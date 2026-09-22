#!/usr/bin/env bash
#
# Desplegar una version nueva de Countrify en el VPS.
#
#   ssh root@<vps> '/home/countrify/countrify-aws/deploy/redeploy.sh'
#
# Hace: pull -> npm ci si cambiaron las dependencias -> build -> migraciones
# pendientes -> restart -> verificacion. Si algo falla, no reinicia el servicio:
# la version vieja sigue sirviendo.
#
# Corre como root (necesita systemctl). El build corre con prioridad baja
# porque este VPS tiene 1 nucleo compartido con otros 12 servicios.
set -Eeuo pipefail

APP_DIR=/home/countrify/countrify-aws
ENV_FILE=/etc/countrify/app.env
SECRETS=/etc/countrify/secrets.env
NODE_BIN=/opt/node22/bin
PORT=3030

die() { echo "ERROR: $1" >&2; exit 1; }
paso() { echo; echo "→ $1"; }

[ "$(id -u)" = 0 ] || die "hay que correrlo como root (usa systemctl)"
[ -f "$ENV_FILE" ] || die "falta $ENV_FILE"

cd "$APP_DIR"
export PATH="$NODE_BIN:$PATH"

paso "actualizando el codigo"
# next-env.d.ts lo regenera Next en cada build y ensucia el arbol.
git checkout -- next-env.d.ts 2>/dev/null || true
ANTES=$(git rev-parse HEAD)
git pull -q origin main
DESPUES=$(git rev-parse HEAD)
if [ "$ANTES" = "$DESPUES" ]; then
  echo "  ya estaba al dia ($(git log --oneline -1))"
else
  echo "  $(git log --oneline "$ANTES..$DESPUES" | wc -l) commits nuevos -> $(git log --oneline -1)"
fi

paso "dependencias"
if ! git diff --quiet "$ANTES" "$DESPUES" -- package-lock.json 2>/dev/null; then
  echo "  package-lock.json cambio, reinstalando"
  nice -n 19 ionice -c3 npm ci --no-audit --no-fund 2>&1 | tail -2
else
  echo "  sin cambios, se saltea npm ci"
fi

paso "compilando"
set -a; . "$ENV_FILE"; set +a
nice -n 19 ionice -c3 npm run build 2>&1 | grep -E "Compiled successfully|Failed|Type error" \
  || die "el build fallo — el servicio NO se reinicio, sigue sirviendo la version anterior"

paso "migraciones pendientes"
. "$SECRETS"
DB_HOST=127.0.0.1 DB_PORT=5432 DB_NAME=countrify DB_SSL=disable \
DB_USER=countrify_admin DB_PASSWORD="$COUNTRIFY_ADMIN_PW" \
  node scripts/db/migrate.mjs 2>&1 | tail -3

paso "reiniciando"
chown -R countrify:countrify "$APP_DIR"
systemctl restart countrify

paso "verificando"
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORT/login" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "${code:-}" = "200" ] || {
  echo
  journalctl -u countrify -n 20 --no-pager
  die "la app no responde despues del reinicio (ultimo codigo: ${code:-sin respuesta})"
}

echo "  /login -> HTTP 200"
echo "  memoria: $(systemctl show countrify -p MemoryCurrent --value | awk '{printf "%.0f MB",$1/1024/1024}')"
echo
echo "listo: $(git log --oneline -1)"
