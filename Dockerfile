# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Countrify — imagen de produccion (Next 16, output: standalone)
#
# Build normal (desde la raiz del repo):
#   docker build -t countrify:local .
#
# OJO ARQUITECTURA: la Mac de desarrollo es arm64 y el VPS es amd64. Una imagen
# arm64 en el VPS arranca y muere al instante con "exec format error", que no
# dice nada sobre la causa real. Para buildear desde la Mac:
#   docker buildx build --platform linux/amd64 -t countrify:local --load .
# Lo mas simple igual es buildear en el propio VPS (ver deploy/README.md).
#
# ---------------------------------------------------------------------------
# Variables de entorno: que se congela y que no
# ---------------------------------------------------------------------------
# Next reemplaza en tiempo de BUILD cualquier `process.env.NEXT_PUBLIC_*` que
# este definida en el entorno del build — y lo hace tanto en el bundle del
# cliente como en el codigo de servidor. O sea: lo que se pasa como ARG queda
# CONGELADO en la imagen y despues no se puede cambiar por env, solo
# rebuildeando.
#
# Al reves: si la variable NO esta definida durante el build, Next deja el
# `process.env.X` tal cual y el codigo de servidor lo lee en RUNTIME.
#
# Por eso aca hay una sola ARG:
#
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY  se usa en components/pwa/pwa-init.tsx, que es
#     'use client' → viaja al navegador si o si, no hay forma de leerla en
#     runtime. Rotar el par VAPID obliga a rebuildear la imagen. Es el unico
#     NEXT_PUBLIC_* que toca codigo de cliente en todo el repo.
#
# Y NO estan como ARG, a proposito:
#
#   NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_BASE_URL  pese al nombre, hoy solo se
#     usan en codigo de servidor (layout/metadata, sitemap, robots, mails,
#     server actions, rutas API). Dejandolas fuera del build se leen en runtime
#     desde el env del contenedor, y cambiar de dominio es reiniciar el
#     contenedor en vez de rebuildear. El dominio todavia esta en el aire, asi
#     que esto es lo que queremos.
#     CONTRAPARTIDA: si alguna vez alguien las usa en un componente 'use client'
#     van a salir undefined en el navegador. Ahi hay que agregarlas como ARG
#     (y aceptar el rebuild por cambio de dominio) o pasarlas del server al
#     cliente por props.
#     COROLARIO: nunca definas estas dos en el entorno del build (ni en un .env
#     que se cuele al contexto — por eso .dockerignore excluye .env*), porque
#     quedarian congeladas sin que nadie se entere.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Sin valor por default: si nadie la pasa, la variable no existe en el entorno
# del build y Next no la inlinea.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# El `unset` cubre el caso `--build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=` (vacio):
# definida-pero-vacia tambien cuenta como definida para Next, y congelaria un
# string vacio que despues ninguna env de runtime puede corregir.
RUN set -eu; \
    if [ -z "${NEXT_PUBLIC_VAPID_PUBLIC_KEY:-}" ]; then \
      unset NEXT_PUBLIC_VAPID_PUBLIC_KEY; \
      echo "aviso: build sin NEXT_PUBLIC_VAPID_PUBLIC_KEY → push deshabilitado en esta imagen"; \
    fi; \
    npm run build

# Red de seguridad para los modulos NATIVOS. El output tracing de Next a veces
# no se lleva el binario .node al standalone (el require es dinamico), y el
# sintoma en produccion es "Cannot find module '@node-rs/argon2'" con el login
# entero caido. Copiarlos a mano cuesta unos MB y saca el tema de la mesa.
# El `|| true` hace que no falle si algun dia el paquete ya no esta.
RUN set -eu; \
    mkdir -p /extra-modules; \
    for pkg in @node-rs; do \
      [ -d "node_modules/$pkg" ] && cp -R "node_modules/$pkg" /extra-modules/ || true; \
    done

# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker define HOSTNAME con el id del contenedor, y el server standalone de
# Next lo usa como direccion de bind: sin esta linea intenta bindear a un
# hostname que no resuelve y no atiende a nadie.
ENV HOSTNAME=0.0.0.0

# Usuario no-root. La imagen node ya trae `node` (uid 1000); todo se copia con
# --chown para que .next/cache sea escribible sin dar permisos de mas.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Modulos nativos (ver el RUN del builder). Va DESPUES del standalone para que
# quede encima de lo que el tracing haya copiado.
COPY --from=builder --chown=node:node /extra-modules/ ./node_modules/

# Migraciones: el runner necesita el script, el SQL y el driver pg (que ya viene
# en el node_modules trazado del standalone). Asi se puede correr
#   docker compose run --rm --entrypoint node app scripts/db/migrate.mjs
# sin instalar nada en el host.
COPY --from=builder --chown=node:node /app/scripts/db ./scripts/db
COPY --from=builder --chown=node:node /app/db/bootstrap ./db/bootstrap

USER node

EXPOSE 3000

# Liveness, no readiness: cualquier respuesta HTTP (incluido un 500 o un 404)
# cuenta como "el server esta vivo". Si atara el healthcheck al estado de la
# base, una caida de Postgres marcaria la app como unhealthy y confundiria el
# diagnostico; para eso esta /api/health/rds, que se consulta a mano.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health/rds').then(() => process.exit(0), () => process.exit(1))"]

CMD ["node", "server.js"]
