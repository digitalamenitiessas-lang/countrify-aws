#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Countrify — backup de la base Y de los archivos.
#
#   deploy/backup.sh
#
# Por que los dos: un pg_dump solo es un backup incompleto. Estas dos columnas
# guardan rutas a archivos que viven FUERA de Postgres:
#
#   countrify.iadmin_payment_claims.document_object_key
#   countrify.iadmin_expense_documents.storage_path
#
# Son comprobantes de pago de expensas subidos por los consorcistas:
# documentacion semi-legal que el administrador puede tener que mostrar. Si se
# pierde el objeto, la fila de la base queda apuntando a la nada y no hay forma
# de reconstruirla.
#
# Configuracion: este script lee deploy/backup.env si existe (mismo formato
# KEY=valor). Variables, con sus defaults:
#
#   BACKUP_DIR=/var/backups/countrify   donde se guarda todo
#   RETENTION_DAYS=14                   dumps mas viejos que esto se borran
#   MIN_DUMP_BYTES=20000                piso para considerar valido un dump
#   COMPOSE_FILE=<repo>/deploy/docker-compose.yml
#   PG_SERVICE=postgres                 servicio de compose
#   PG_SUPERUSER=postgres               usuario del pg_dump
#   PG_PASSWORD=                        vacio = socket local con trust
#   PG_DB=countrify
#
#   OBJECTS_MODE=auto                   auto | rclone | local | none
#   RCLONE_REMOTE=                      ej. r2:countrify-prod  (modo rclone)
#   OBJECTS_LOCAL_DIR=                  ej. /srv/countrify/uploads (modo local)
#   ACK_NO_OBJECT_BACKUP=               poner 1 para permitir OBJECTS_MODE=none
#
# Salida: 0 si todo ok, 1 si algo fallo, 2 si la configuracion esta mal. El
# cron usa el codigo de salida para avisar (ver deploy/crontab.example).
#
# RESTORE: ver deploy/README.md. Un backup sin restore probado no es un backup.
# ---------------------------------------------------------------------------
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
[[ -f "$SCRIPT_DIR/backup.env" ]] && source "$SCRIPT_DIR/backup.env"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/countrify}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-20000}"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-}"
PG_DB="${PG_DB:-countrify}"
OBJECTS_MODE="${OBJECTS_MODE:-auto}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
OBJECTS_LOCAL_DIR="${OBJECTS_LOCAL_DIR:-}"
ACK_NO_OBJECT_BACKUP="${ACK_NO_OBJECT_BACKUP:-}"

TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S%z')] $*"
  echo "$line"
  [[ -d "$BACKUP_DIR" ]] && echo "$line" >>"$LOG_FILE" || true
}

die() {
  log "ERROR: $1"
  exit "${2:-1}"
}

on_error() {
  local code=$? line=$1
  log "ERROR: el backup fallo en la linea $line (exit $code)"
  exit 1
}
trap 'on_error $LINENO' ERR

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose -f "$COMPOSE_FILE")
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose -f "$COMPOSE_FILE")
else
  die "no encuentro docker compose ni docker-compose" 2
fi

[[ -f "$COMPOSE_FILE" ]] || die "no existe $COMPOSE_FILE" 2

mkdir -p "$BACKUP_DIR"
[[ -w "$BACKUP_DIR" ]] || die "no puedo escribir en $BACKUP_DIR" 2

log "=== backup $TS (base '$PG_DB') ==="

# ---------------------------------------------------------------------------
# 1. Base: dump logico + globals (roles y sus passwords).
# ---------------------------------------------------------------------------
DUMP_FILE="$BACKUP_DIR/countrify-db-$TS.sql.gz"
GLOBALS_FILE="$BACKUP_DIR/countrify-globals-$TS.sql.gz"

# Array vacio + `set -u` explota en bash 3.x, de ahi la expansion defensiva
# ${pg_env[@]+...} mas abajo.
pg_env=()
[[ -n "$PG_PASSWORD" ]] && pg_env=(-e "PGPASSWORD=$PG_PASSWORD")

log "pg_dump -> $(basename "$DUMP_FILE")"
# -w: nunca pedir password por teclado. Sin esto, un problema de auth cuelga
# el cron para siempre en vez de fallar.
"${DC[@]}" exec -T ${pg_env[@]+"${pg_env[@]}"} "$PG_SERVICE" \
  pg_dump -w -U "$PG_SUPERUSER" -d "$PG_DB" \
  | gzip -9 >"$DUMP_FILE"

log "pg_dumpall --globals-only -> $(basename "$GLOBALS_FILE")"
# Los roles (countrify_admin / countrify_app) y sus passwords no estan en el
# dump de la base. Sin esto, el restore deja las tablas sin dueno valido.
"${DC[@]}" exec -T ${pg_env[@]+"${pg_env[@]}"} "$PG_SERVICE" \
  pg_dumpall -w -U "$PG_SUPERUSER" --globals-only \
  | gzip -9 >"$GLOBALS_FILE"

# ---------------------------------------------------------------------------
# 2. Verificacion. Un archivo que existe no es un backup: puede ser un gzip
#    truncado, un dump vacio, o el mensaje de error de pg_dump comprimido.
# ---------------------------------------------------------------------------
dump_bytes=$(wc -c <"$DUMP_FILE" | tr -d ' ')
[[ "$dump_bytes" -ge "$MIN_DUMP_BYTES" ]] \
  || die "el dump pesa $dump_bytes bytes (< $MIN_DUMP_BYTES): casi seguro salio vacio"

gzip -t "$DUMP_FILE" || die "el gzip del dump esta corrupto"
gzip -t "$GLOBALS_FILE" || die "el gzip de los globals esta corrupto"

# pg_dump escribe esta linea SOLO si termino bien. Es la unica forma barata de
# distinguir un dump completo de uno cortado a la mitad.
# Sin pipe hacia grep: con `set -o pipefail`, grep -q corta el pipe apenas
# encuentra el match, gzip muere con SIGPIPE y el pipeline devuelve error
# aunque el dump este perfecto. Un backup bueno reportado como fallido es
# tan malo como uno malo reportado como bueno: se deja de mirar la alerta.
last_lines="$(gzip -dc "$DUMP_FILE" | tail -5)"
grep -q 'PostgreSQL database dump complete' <<<"$last_lines" \

tables=$(gzip -dc "$DUMP_FILE" | grep -c '^CREATE TABLE ' || true)
[[ "$tables" -ge 30 ]] \
  || die "el dump trae solo $tables CREATE TABLE (se esperaban 40+): base incompleta o equivocada"

log "dump ok: $(du -h "$DUMP_FILE" | cut -f1), $tables tablas"

# ---------------------------------------------------------------------------
# 3. Archivos (comprobantes y adjuntos).
# ---------------------------------------------------------------------------
if [[ "$OBJECTS_MODE" == "auto" ]]; then
  if [[ -n "$RCLONE_REMOTE" ]]; then
    OBJECTS_MODE=rclone
  elif [[ -n "$OBJECTS_LOCAL_DIR" ]]; then
    OBJECTS_MODE=local
  else
    OBJECTS_MODE=none
  fi
fi

case "$OBJECTS_MODE" in
  rclone)
    command -v rclone >/dev/null 2>&1 || die "OBJECTS_MODE=rclone pero rclone no esta instalado" 2
    [[ -n "$RCLONE_REMOTE" ]] || die "OBJECTS_MODE=rclone pero RCLONE_REMOTE esta vacio" 2

    MIRROR_DIR="$BACKUP_DIR/objects"
    MANIFEST="$BACKUP_DIR/countrify-objects-$TS.lst"
    mkdir -p "$MIRROR_DIR"

    log "rclone sync $RCLONE_REMOTE -> $MIRROR_DIR"
    # Espejo, no copia fechada: los comprobantes no se editan, solo se agregan,
    # asi que un espejo + el versionado del bucket alcanza y no multiplica
    # gigas por dia. El manifiesto fechado si queda, para saber que habia.
    rclone sync "$RCLONE_REMOTE" "$MIRROR_DIR" --create-empty-src-dirs

    rclone lsl "$RCLONE_REMOTE" >"$MANIFEST"
    objects=$(wc -l <"$MANIFEST" | tr -d ' ')
    if [[ "$objects" -eq 0 ]]; then
      log "AVISO: el bucket no tiene objetos. Normal si todavia nadie subio nada; sospechoso si no."
    else
      log "objetos ok: $objects archivos espejados"
    fi
    ;;

  local)
    [[ -d "$OBJECTS_LOCAL_DIR" ]] || die "OBJECTS_LOCAL_DIR no existe: $OBJECTS_LOCAL_DIR" 2
    OBJECTS_FILE="$BACKUP_DIR/countrify-objects-$TS.tar.gz"

    log "tar $OBJECTS_LOCAL_DIR -> $(basename "$OBJECTS_FILE")"
    tar -czf "$OBJECTS_FILE" -C "$(dirname "$OBJECTS_LOCAL_DIR")" "$(basename "$OBJECTS_LOCAL_DIR")"
    gzip -t "$OBJECTS_FILE" || die "el tar.gz de los archivos esta corrupto"

    entries=$(tar -tzf "$OBJECTS_FILE" | wc -l | tr -d ' ')
    log "objetos ok: $entries entradas, $(du -h "$OBJECTS_FILE" | cut -f1)"
    ;;

  none)
    [[ "$ACK_NO_OBJECT_BACKUP" == "1" ]] \
      || die "OBJECTS_MODE=none sin ACK_NO_OBJECT_BACKUP=1. Un dump sin los comprobantes no es un backup completo: configura RCLONE_REMOTE o OBJECTS_LOCAL_DIR, o acepta el riesgo explicitamente" 2
    log "AVISO: backup SIN archivos (ACK_NO_OBJECT_BACKUP=1). Los comprobantes no estan cubiertos."
    ;;

  *)
    die "OBJECTS_MODE invalido: $OBJECTS_MODE (auto|rclone|local|none)" 2
    ;;
esac

# ---------------------------------------------------------------------------
# 4. Rotacion. Solo archivos sueltos: el espejo de objetos no se toca.
# ---------------------------------------------------------------------------
deleted=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'countrify-db-*.sql.gz' -o -name 'countrify-globals-*.sql.gz' \
     -o -name 'countrify-objects-*.tar.gz' -o -name 'countrify-objects-*.lst' \) \
  -mtime "+$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
log "rotacion: $deleted archivo(s) con mas de $RETENTION_DAYS dias borrados"

remaining=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'countrify-db-*.sql.gz' | wc -l | tr -d ' ')
log "=== backup ok: $remaining dump(s) en $BACKUP_DIR ==="
