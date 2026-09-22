#!/usr/bin/env bash
#
# Backup de Countrify en el VPS: base de datos + archivos + configuracion.
#
#   /home/countrify/countrify-aws/deploy/backup-vps.sh
#
# Reemplaza a deploy/backup.sh, que estaba escrito para el despliegue con
# Docker que finalmente no se uso.
#
# Que respalda, y por que los tres juntos:
#   - La base (pg_dump).
#   - Los objetos de Garage (los dos buckets). Un dump sin los archivos es
#     inutil: countrify.iadmin_payment_claims.document_object_key y
#     countrify.iadmin_expense_documents.storage_path apuntan a objetos que
#     viven afuera de la base. Restaurar solo la base deja filas apuntando a
#     comprobantes que no existen.
#   - /etc/countrify y /etc/garage.toml. Sin las credenciales, la base y los
#     objetos restaurados no se pueden abrir.
#
# CONTIENE SECRETOS: passwords de la base, la clave de sesion, las de Garage.
# El directorio va 0700 root. Si algun dia se copia afuera, cifrarlo.
#
# Salidas: 0 todo bien · 1 algo fallo · 2 configuracion mal.
# El cron usa el codigo de salida para avisar (ver la seccion de alertas).
#
# RESTORE: deploy/RESTORE.md. Un backup sin restore probado no es un backup.
set -Eeuo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/var/backups/countrify}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_DB="${PG_DB:-countrify}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-20000}"
RCLONE_REMOTE="${RCLONE_REMOTE:-garage}"
BUCKETS="${BUCKETS:-countrify-public countrify-private}"
# Opcional: avisa por Telegram si algo falla. Sin esto, un backup roto es
# silencioso, que es el peor modo de falla posible para un backup.
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

[[ -f /etc/countrify/backup.env ]] && source /etc/countrify/backup.env

TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$BACKUP_DIR/backup.log"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S%z')] $*"
  echo "$line"
  [[ -d "$BACKUP_DIR" ]] && echo "$line" >>"$LOG_FILE" || true
}

avisar() {
  [[ -n "$TELEGRAM_BOT_TOKEN" && -n "$TELEGRAM_CHAT_ID" ]] || return 0
  curl -sS --max-time 20 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=[Countrify] backup FALLO: $1" || true
}

die() {
  log "ERROR: $1"
  avisar "$1"
  exit "${2:-1}"
}

trap 'die "fallo inesperado en la linea $LINENO"' ERR

command -v pg_dump >/dev/null || die "falta pg_dump" 2
command -v rclone  >/dev/null || die "falta rclone" 2

mkdir -p "$BACKUP_DIR" || die "no se pudo crear $BACKUP_DIR (permisos?)" 2
chmod 700 "$BACKUP_DIR"
DEST="$BACKUP_DIR/$TS"
mkdir -p "$DEST"

log "=== backup $TS ==="

# --- 1. Base de datos ------------------------------------------------------
# Formato custom (-Fc): comprimido y permite restaurar tablas sueltas.
DUMP="$DEST/db.dump"
log "base de datos..."
sudo -u postgres pg_dump -Fc -d "$PG_DB" -f "$DUMP" || die "pg_dump fallo"

SIZE=$(stat -c%s "$DUMP")
(( SIZE >= MIN_DUMP_BYTES )) || die "el dump pesa $SIZE bytes, menos del minimo ($MIN_DUMP_BYTES): quedo cortado"

# pg_restore -l lee el indice del archivo. Si el dump esta truncado o corrupto,
# falla aca y no dentro de seis meses cuando haga falta de verdad.
TABLAS=$(pg_restore -l "$DUMP" 2>/dev/null | grep -c "TABLE DATA" || true)
(( TABLAS > 0 )) || die "el dump no tiene datos de tablas: esta corrupto"
log "  ok — $(numfmt --to=iec "$SIZE"), $TABLAS tablas con datos"

# --- 2. Objetos ------------------------------------------------------------
# Por bucket y no en total: si un bucket viene vacio por un error, un conteo
# global lo taparia con los objetos del otro.
for B in $BUCKETS; do
  log "objetos de $B..."
  rclone sync "$RCLONE_REMOTE:$B" "$DEST/objetos/$B" --create-empty-src-dirs \
    || die "rclone fallo copiando $B"
  N=$(find "$DEST/objetos/$B" -type f | wc -l)
  log "  ok — $N objetos"
  echo "$N" > "$DEST/objetos/$B.count"
done

# --- 3. Configuracion ------------------------------------------------------
log "configuracion..."
tar czf "$DEST/config.tar.gz" \
  -C / etc/countrify etc/garage.toml \
  etc/systemd/system/countrify.service etc/systemd/system/garage.service \
  etc/caddy/countrify.caddy 2>/dev/null || die "no se pudo empaquetar la configuracion"
log "  ok — $(numfmt --to=iec "$(stat -c%s "$DEST/config.tar.gz")")"

# --- 4. Manifiesto ---------------------------------------------------------
{
  echo "fecha: $(date -Iseconds)"
  echo "base: $PG_DB, $TABLAS tablas con datos, $(numfmt --to=iec "$SIZE")"
  for B in $BUCKETS; do echo "bucket $B: $(cat "$DEST/objetos/$B.count") objetos"; done
  echo "commit: $(git -C /home/countrify/countrify-aws rev-parse --short HEAD 2>/dev/null || echo '?')"
} > "$DEST/MANIFIESTO.txt"

# --- 5. Rotacion -----------------------------------------------------------
# Se borra por nombre de directorio (timestamp), no por mtime: un `find -mtime`
# sobre archivos recien tocados no borra nada y el disco se llena en silencio.
BORRADOS=0
while IFS= read -r d; do
  rm -rf "$d"; BORRADOS=$((BORRADOS+1))
done < <(find "$BACKUP_DIR" -maxdepth 1 -type d -name '20*-*' -printf '%f\n' \
         | sort | head -n -"$RETENTION_DAYS" | sed "s|^|$BACKUP_DIR/|")
(( BORRADOS > 0 )) && log "rotacion: $BORRADOS backups viejos borrados"

TOTAL=$(du -sh "$DEST" | cut -f1)
LIBRE=$(df -h "$BACKUP_DIR" | awk 'NR==2{print $4}')
log "=== listo — $TOTAL en $DEST (quedan $LIBRE libres) ==="
trap - ERR
exit 0
