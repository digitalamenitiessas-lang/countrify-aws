#!/usr/bin/env bash
#
# Crea la base de Countrify desde cero. Idempotente sobre una base vacia.
#
#   scripts/db/setup.sh [nombre_de_base]
#
# Variables:
#   PGHOST PGPORT PGUSER PGPASSWORD  conexion (defaults de psql si no estan)
#   COUNTRIFY_ADMIN_PW               password del rol countrify_admin
#   COUNTRIFY_APP_PW                 password del rol countrify_app
#
# Orden y por que:
#   00_roles      roles del cluster (necesita superusuario)
#   01_schema     schema base generado por scripts/db/build-schema.mjs
#   migrations/   migraciones en orden alfabetico (= cronologico por la fecha)
#   03_grants     permisos de runtime, al final para cubrir lo que crearon las
#                 migraciones
set -euo pipefail

DB="${1:-countrify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BOOT="$ROOT/db/bootstrap"

ADMIN_PW="${COUNTRIFY_ADMIN_PW:-}"
APP_PW="${COUNTRIFY_APP_PW:-}"

if [[ -z "$ADMIN_PW" || -z "$APP_PW" ]]; then
  echo "error: faltan COUNTRIFY_ADMIN_PW y/o COUNTRIFY_APP_PW" >&2
  echo "generar una con: openssl rand -base64 24" >&2
  exit 1
fi

if [[ ! -f "$BOOT/01_schema.sql" ]]; then
  echo "error: falta $BOOT/01_schema.sql — corre primero: node scripts/db/build-schema.mjs" >&2
  exit 1
fi

# Escapa comillas simples para pasar la password como literal SQL.
sql_literal() { printf "'%s'" "${1//\'/\'\'}"; }

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

# Igual que run(), pero baja a countrify_admin antes de ejecutar el archivo.
#
# Sin esto, un bootstrap corrido como superusuario deja el schema y las 49
# tablas owned by postgres, y countrify_admin (que es quien corre las
# migraciones) no puede tocarlas: la primera migracion futura muere con
# "permission denied for schema countrify", y para entonces ya hay datos.
#
# El SET ROLE y el -f comparten sesion, asi que todo lo que cree el archivo
# nace con countrify_admin de dueño.
run_as_admin() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -c 'set role countrify_admin' "$@"; }

echo "→ roles"
run -v db="$DB" \
    -v admin_pw="$(sql_literal "$ADMIN_PW")" \
    -v app_pw="$(sql_literal "$APP_PW")" \
    -f "$BOOT/00_roles.sql"

echo "→ schema base"
run_as_admin -f "$BOOT/01_schema.sql"

echo "→ migraciones"
for f in "$BOOT"/migrations/*.sql; do
  echo "   $(basename "$f")"
  run_as_admin -f "$f"
done

# Los grants y el `alter default privileges` tienen que correr como el DUEÑO,
# o los privilegios por defecto se registran para el rol equivocado y las
# tablas que cree la proxima migracion no quedan accesibles para la app.
echo "→ grants"
run_as_admin -f "$BOOT/03_grants.sql"

echo
echo "listo. base '$DB':"
psql -At -d "$DB" \
  -c "select '  tablas:    '||count(*) from pg_tables where schemaname='countrify';" \
  -c "select '  funciones: '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='countrify';"
