# Countrify en el VPS — de cero a produccion

Runbook completo para levantar Countrify en el VPS de Hostinger (KVM 2:
2 vCPU / 8 GB / ~100 GB NVMe, São Paulo), **sin AWS**.

> El VPS **ya corre los bots de Telegram**. Todo lo de esta guia esta pensado
> para convivir con ellos: proyecto de compose propio, red propia, Postgres sin
> puerto publicado, limites de memoria y de logs. Antes de tocar nada, hacé el
> reconocimiento del paso 1.

## Que reemplaza a que

| Antes (AWS) | Ahora (VPS) |
|---|---|
| ECS Fargate + ECR | `docker compose` con la imagen buildeada en el server |
| RDS Postgres | contenedor `postgres:17-alpine` con volumen `countrify_pgdata` |
| ALB + ACM | Caddy con HTTPS automatico (o el proxy que ya este en el host) |
| Cognito | login local contra `countrify.profiles`, hash argon2id |
| S3 | Cloudflare R2 o MinIO (`docs/STORAGE.md`) |
| Lambda + EventBridge | `cron` del sistema (`deploy/crontab.example`) |
| Secrets Manager | archivos `deploy/.env.*` con permisos 600 |
| Backups automaticos de RDS | `deploy/backup.sh` + cron |

Archivos de este directorio:

```
docker-compose.yml   postgres + app + caddy (perfil) + minio (perfil) + dbsetup (perfil)
Caddyfile            reverse proxy con HTTPS automatico
backup.sh            backup de base + archivos, con verificacion y rotacion
crontab.example      recordatorios, recargos y backup
README.md            esto
```

---

## 1. Reconocimiento del VPS

Antes de instalar nada, mirar con que nos encontramos. Todo esto es de solo
lectura:

```bash
ssh root@<ip-del-vps>

# Sistema
cat /etc/os-release
uname -m                 # x86_64 = amd64. Importa para el build (ver paso 5).
free -h                  # cuanta RAM esta usando lo que ya corre
df -h /                  # espacio libre
timedatectl              # zona horaria: define los horarios del cron

# Que esta escuchando, y quien
ss -tulpn | sort -k5     # ¿estan libres 80 y 443?
docker ps                # ¿los bots corren en docker?
docker network ls
docker volume ls
systemctl list-units --type=service --state=running | head -40

# Firewall
ufw status verbose 2>/dev/null || iptables -S | head -20
```

Anotar dos respuestas, porque deciden el resto:

1. **¿80 y 443 estan libres?**
   - Libres → **caso A**: levantamos Caddy (paso 9A).
   - Ocupados por nginx/Caddy/Traefik de los bots → **caso B**: la app publica
     solo en `127.0.0.1` y ese proxy la toma (paso 9B).
2. **¿Cuanta RAM queda de verdad?** Los limites del compose suman ~3.3 GB
   (Postgres 1.5 + app 1.5 + Caddy 0.25). Si los bots ya usan mas de 4 GB, bajar
   `mem_limit` en `docker-compose.yml` antes de levantar.

---

## 2. Docker

```bash
docker --version && docker compose version
```

Si falta (y solo si falta — si los bots ya corren en docker, NO reinstalar):

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

Conviene operar con un usuario no-root que pertenezca al grupo `docker`:

```bash
adduser countrify
usermod -aG docker countrify
# cerrar sesion y volver a entrar como countrify
```

El cron del paso 11 corre como ese usuario.

---

## 3. Clonar el repo

```bash
sudo mkdir -p /srv && sudo chown countrify:countrify /srv
cd /srv
git clone <url-del-repo> countrify
cd countrify
```

De acá en adelante, todos los comandos se corren desde `/srv/countrify`.

---

## 4. Generar los secretos

Generarlos **en el VPS** y pegarlos en los `.env.*` del paso 5. Guardarlos
tambien en el gestor de contraseñas: si se pierde `APP_SESSION_SECRET` se caen
todas las sesiones; si se pierde el par VAPID hay que volver a pedir permiso de
notificaciones a cada usuario.

```bash
openssl rand -base64 48      # APP_SESSION_SECRET
openssl rand -hex 32         # CRON_SECRET
openssl rand -base64 24      # POSTGRES_PASSWORD (superusuario)
openssl rand -base64 24      # COUNTRIFY_ADMIN_PW (dueño del schema)
openssl rand -base64 24      # COUNTRIFY_APP_PW  (runtime = DB_PASSWORD)

# Par VAPID (necesita node; si el VPS no lo tiene, generarlo en la Mac)
npx web-push generate-vapid-keys
```

---

## 5. Archivos de entorno

Todos dentro de `deploy/`, todos fuera de git. **Crearlos a los seis, aunque
alguno quede vacio**: compose lee los `env_file` de todos los servicios al
parsear el archivo, incluso los de un perfil que no se levanta, y si falta uno
falla cualquier comando con un error poco obvio.

```bash
cd /srv/countrify/deploy
touch .env .env.app .env.db .env.dbsetup .env.minio backup.env
chmod 600 .env .env.app .env.db .env.dbsetup .env.minio backup.env
```

**`deploy/.env`** — valores NO secretos que interpola compose:

```ini
COUNTRIFY_IMAGE=countrify:local
COUNTRIFY_DB=countrify
APP_BIND=127.0.0.1
APP_PORT=3000
COUNTRIFY_DOMAIN=countrify.com.ar
COUNTRIFY_TLS_EMAIL=admin@countrify.com.ar
COUNTRIFY_UPSTREAM=app:3000
# Solo para el build (queda congelada en la imagen):
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxxxxx...
```

**`deploy/.env.app`** — el entorno del contenedor de la app. Se arma copiando
`.env.example` de la raiz del repo, que documenta variable por variable de donde
sale cada valor. Los minimos para arrancar:

```ini
NEXT_PUBLIC_SITE_URL=https://countrify.com.ar
NEXT_PUBLIC_APP_BASE_URL=https://countrify.com.ar
APP_SESSION_SECRET=<openssl rand -base64 48>
DB_HOST=postgres
DB_PORT=5432
DB_NAME=countrify
DB_USER=countrify_app
DB_PASSWORD=<COUNTRIFY_APP_PW>
DB_SSL=disable
CRON_SECRET=<openssl rand -hex 32>
```

> **`DB_SSL=disable` no es opcional.** `lib/db/postgres.ts`, en `getPoolConfig()`, apaga TLS **solo**
> con ese literal; con cualquier otro valor, o sin la variable, intenta TLS
> contra un Postgres que no lo tiene y falla con un error que parece de red.

Con eso la app levanta, pero varias cosas quedan apagadas hasta cargar el resto
(todas explicadas una por una en `.env.example`):

| Para que | Variables | De donde salen |
|---|---|---|
| Subir y ver archivos | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_BASE_URL` | Cloudflare R2 o MinIO — **seguir `docs/STORAGE.md`**, que incluye crear los dos buckets y el CORS |
| Mandar mails | `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `RESEND_WEBHOOK_SECRET` | dashboard de Resend (el dominio ya esta verificado) |
| Notificaciones push | `VAPID_MAILTO`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | el par generado en el paso 4 |
| IA del backoffice | `OPENROUTER_API_KEY` | openrouter.ai |

**`deploy/.env.db`** — el contenedor de Postgres:

```ini
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<openssl rand -base64 24>
POSTGRES_DB=countrify

# UNA sola base para los dos productos. businesses y promotions se comparten
# entre Countrify y Citify (misma fila), y Postgres no soporta claves foraneas
# entre bases distintas. Cada producto tiene su schema, mas el schema `shared`.
# Ver deploy/MULTI-PRODUCTO.md antes de sumar Citify.
```

**`deploy/.env.dbsetup`** — solo para el paso 7 (crear roles y schema):

```ini
PGHOST=postgres
PGPORT=5432
PGUSER=postgres
PGPASSWORD=<el mismo POSTGRES_PASSWORD de arriba>
COUNTRIFY_ADMIN_PW=<openssl rand -base64 24>
COUNTRIFY_APP_PW=<el mismo que DB_PASSWORD de .env.app>
```

**`deploy/backup.env`** — ver la cabecera de `backup.sh`. Minimo:

```ini
BACKUP_DIR=/var/backups/countrify
RETENTION_DAYS=14
PG_DB=countrify
# Con R2:
RCLONE_REMOTE=r2:countrify-private
```

**`deploy/.env.minio`** — solo si se usa MinIO en vez de R2 (`docs/STORAGE.md`).
Con R2 queda vacio, pero tiene que existir:

```ini
MINIO_ROOT_USER=countrify
MINIO_ROOT_PASSWORD=<openssl rand -base64 24>
MINIO_SERVER_URL=https://archivos.countrify.com.ar
MINIO_BROWSER_REDIRECT_URL=https://consola-archivos.countrify.com.ar
```

---

## 6. Buildear la imagen

### Opcion recomendada: buildear en el VPS

Evita de raiz el problema de arquitectura y no hace falta registry:

```bash
cd /srv/countrify
docker compose -f deploy/docker-compose.yml build app
```

Tarda varios minutos con 2 vCPU. Si el build se queda sin memoria, parar
temporalmente algun bot o agregar swap.

### Opcion alternativa: buildear en la Mac

> **La Mac es arm64 y el VPS es amd64.** Una imagen arm64 en el VPS arranca y
> muere con `exec format error`, que no dice nada de la causa. Hay que forzar la
> plataforma:

```bash
# en la Mac
docker buildx build --platform linux/amd64 -t countrify:local --load .
docker save countrify:local | gzip | ssh countrify@<ip> 'gunzip | docker load'
```

---

## 7. Crear la base

```bash
cd /srv/countrify
DC="docker compose -f deploy/docker-compose.yml"

# migrate.mjs hace DDL: siempre con el rol dueño del schema, nunca con el de
# runtime. Estas dos variables pisan DB_USER/DB_PASSWORD solo para ese comando.
ADMIN="-e DB_ADMIN_USER=countrify_admin -e DB_ADMIN_PASSWORD=PEGAR_COUNTRIFY_ADMIN_PW"

# 1. Postgres solo, y esperar a que el healthcheck lo de por sano
$DC up -d postgres
$DC ps

# 2. Roles + schema + migraciones (corre scripts/db/setup.sh adentro de un
#    contenedor con psql, porque Postgres no publica puerto al host)
$DC --profile tools run --rm dbsetup

# 3. Registrar esas migraciones en la tabla de control. setup.sh las aplica pero
#    no las anota; sin este paso el runner las querria aplicar de nuevo.
$DC run --rm $ADMIN --entrypoint node app scripts/db/migrate.mjs --baseline

# 4. Verificar
$DC run --rm $ADMIN --entrypoint node app scripts/db/migrate.mjs --dry-run
# -> "todo al dia: N migraciones aplicadas, 0 pendientes"
```

De acá en adelante, cada migracion nueva se aplica con:

```bash
$DC run --rm $ADMIN --entrypoint node app scripts/db/migrate.mjs
```

El runner aplica en orden alfabetico lo que falte, cada archivo en su propia
transaccion, y **aborta** si una migracion ya aplicada cambio de contenido.
Al terminar re-aplica `db/bootstrap/03_grants.sql`, porque las tablas que crea
una migracion nacen sin permisos para `countrify_app` y eso se descubre recien
en runtime, con un `permission denied` en la cara del usuario.

---

## 8. Sembrar el super_admin

No hay panel de AWS donde dar de alta el primer usuario: se crea con el script.
Las credenciales van por variable de entorno, nunca por argumento (los
argumentos quedan en el historial y en `ps`).

```bash
$DC run --rm --entrypoint node \
  -e SEED_SUPERADMIN_EMAIL='admin@countrify.com.ar' \
  -e SEED_SUPERADMIN_PASSWORD='<una password de 10+ caracteres>' \
  -e SEED_SUPERADMIN_NAME='Matias Lujan' \
  app scripts/db/seed-superadmin.mjs
```

Es idempotente: si el mail ya existe, le reescribe el hash.

---

## 9. Levantar y exponer

```bash
$DC up -d
$DC ps
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200
curl -sS http://127.0.0.1:3000/api/health/rds                      # {"ok":true,...}
```

### Caso A — 80 y 443 libres: Caddy

```bash
$DC --profile caddy up -d
$DC logs -f caddy      # ver que saque el certificado
```

Caddy pide el certificado a Let's Encrypt solo, pero **necesita que el DNS ya
apunte al VPS** (paso 10). Si todavia no hay dominio, se puede usar
`<ip-con-guiones>.sslip.io` como `COUNTRIFY_DOMAIN` para tener HTTPS real
mientras tanto.

### Caso B — 80/443 ocupados por los bots

No levantar el perfil `caddy`. La app ya escucha en `127.0.0.1:3000`; se agrega
un vhost en el proxy que ya esta.

**nginx** (`/etc/nginx/sites-available/countrify`):

```nginx
server {
    listen 443 ssl http2;
    server_name countrify.com.ar;

    # ssl_certificate ... (certbot)

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CRITICO: $remote_addr, NO $proxy_add_x_forwarded_for.
        # $proxy_add_x_forwarded_for appendea al header que mando el cliente, y
        # lib/rate-limit.ts se queda con el PRIMER valor de la lista. Con append,
        # cualquiera evade el limite de logins mandando un X-Forwarded-For falso.
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Real-IP         $remote_addr;
    }
}
```

**Si el proxy existente es Caddy**, agregar un site block al Caddyfile de ellos
copiando el bloque `reverse_proxy` de `deploy/Caddyfile` — los `header_up` son
la parte que no se puede omitir — apuntando a `127.0.0.1:3000`.

---

## 10. DNS

En el panel del registrador (o en Cloudflare):

| Tipo | Nombre | Valor |
|---|---|---|
| A | `@` | `<ip-del-vps>` |
| A | `www` | `<ip-del-vps>` |
| A | `archivos` | `<ip-del-vps>` — solo si se usa MinIO |

Con Cloudflare como DNS: poner los registros en **DNS only** (nube gris) hasta
que Caddy haya emitido el certificado; despues se puede pasar a proxied.

Verificar antes de seguir: `dig +short countrify.com.ar`.

Los registros SPF/DKIM de Resend no se tocan: el mail no depende del VPS.

---

## 11. Cron

```bash
crontab -e     # como el usuario countrify (el que puede correr docker)
```

Pegar el contenido de `deploy/crontab.example` y ajustar rutas, dominio y
horarios segun `timedatectl`. Antes hay que crear el archivo con el secreto
(`/etc/countrify/cron.curlrc`): las instrucciones estan en el mismo archivo.

Probar a mano antes de confiar en el cron:

```bash
curl -i -X POST -K /etc/countrify/cron.curlrc \
  -H 'Content-Type: application/json' -d '{}' \
  https://countrify.com.ar/api/cron/generate-reminders
# 200 con {"ok":true,...}. Un 401 = el secreto no coincide con CRON_SECRET.
```

---

## 12. Verificacion (checklist de humo)

```bash
$DC ps                                    # todos Up, postgres healthy
curl -s https://countrify.com.ar/api/health/rds    # {"ok":true}
```

A mano, en el navegador:

- [ ] La home carga con estilos e imagenes.
- [ ] Login con el super_admin sembrado.
- [ ] Panel superadmin: crear un country de prueba.
- [ ] Subir una imagen (marketplace o logo de negocio) y verla renderizada.
- [ ] Subir un comprobante de gasto y volver a descargarlo (URL prefirmada).
- [ ] Un mail que salga de verdad (alta de usuario, o el form de contacto).
- [ ] Rate limit: 11 intentos fallidos de login seguidos deben dar **429**.
- [ ] Y el importante: los mismos 11 intentos mandando `-H 'X-Forwarded-For:
      1.2.3.4'` distinto cada vez **tambien** deben dar 429. Si no, el proxy
      esta dejando pasar el header del cliente (ver troubleshooting).

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code} " -X POST \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d '{"email":"no@existe.test","password":"x"}' \
    https://countrify.com.ar/api/auth/login
done; echo
# esperado: ... 401 401 429
```

---

## 13. Operacion diaria

```bash
cd /srv/countrify
DC="docker compose -f deploy/docker-compose.yml"

$DC logs -f app                 # logs
$DC logs --tail 200 postgres
$DC restart app
$DC down                        # baja Countrify. NO toca los bots.
docker stats --no-stream        # cuanto esta usando cada cosa
```

**Desplegar una version nueva:**

```bash
git pull
$DC build app
$DC up -d app                   # recrea solo la app
$DC run --rm -e DB_ADMIN_USER=countrify_admin -e DB_ADMIN_PASSWORD='...' \
  --entrypoint node app scripts/db/migrate.mjs   # si hay migraciones nuevas
```

Si la migracion cambia el schema de forma incompatible con la version vieja,
correrla **antes** del `up -d` implica downtime corto; al reves, errores. Para el
MVP lo mas simple es: `down` → migrar → `up -d`.

---

## 14. Backup y restore

```bash
deploy/backup.sh          # a mano
tail -f /var/backups/countrify/backup.log
```

El script hace tres cosas y falla con exit != 0 si alguna no cierra:

1. `pg_dump` de la base + `pg_dumpall --globals-only` (los roles y sus
   passwords, que no estan en el dump de la base).
2. Los **archivos**. Un dump sin ellos no alcanza:
   `countrify.iadmin_payment_claims.document_object_key` y
   `countrify.iadmin_expense_documents.storage_path` apuntan a objetos que viven
   afuera, y son comprobantes de pago de consorcistas.
3. Verificacion (tamaño minimo, gzip integro, marcador de cierre de `pg_dump`,
   cantidad de tablas) y rotacion por dias.

### Restore

> **Un backup sin restore probado no es un backup.** Hacer este ensayo al menos
> una vez ahora, y despues cada vez que cambie algo de la infra. Sobre una base
> de prueba, nunca sobre la de produccion.

```bash
cd /srv/countrify
DC="docker compose -f deploy/docker-compose.yml"
DUMP=/var/backups/countrify/countrify-db-20260921-030000.sql.gz
GLOBALS=/var/backups/countrify/countrify-globals-20260921-030000.sql.gz

# 1. Ensayo: restaurar a una base nueva al lado de la real
$DC exec -T postgres psql -U postgres -c 'create database countrify_restore_test'

# 2. Roles (si es un server nuevo; si ya existen, ignorar los errores de "already exists")
gunzip -c "$GLOBALS" | $DC exec -T postgres psql -U postgres

# 3. Datos
gunzip -c "$DUMP" | $DC exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d countrify_restore_test

# 4. Verificar que hay algo adentro
$DC exec -T postgres psql -U postgres -d countrify_restore_test -c \
  "select count(*) tablas from pg_tables where schemaname='countrify'"
$DC exec -T postgres psql -U postgres -d countrify_restore_test -c \
  "select count(*) from countrify.profiles"

# 5. Limpiar el ensayo
$DC exec -T postgres psql -U postgres -c 'drop database countrify_restore_test'
```

**Restore real (el server se perdio):** pasos 1 a 3 de esta guia (Docker, clonar,
`.env.*`), despues `up -d postgres`, despues los pasos 2 y 3 de arriba pero
contra la base `countrify` recien creada, y **sin** correr `dbsetup` ni
`migrate.mjs`: el dump ya trae el schema, las migraciones y la tabla
`countrify.schema_migrations` con su historial.

**Los archivos** van por separado:

```bash
# R2
rclone sync /var/backups/countrify/objects r2:countrify-private
# MinIO / disco
tar -xzf /var/backups/countrify/countrify-objects-<fecha>.tar.gz -C /destino
```

---

## 15. Troubleshooting

### `exec format error` apenas arranca el contenedor

La imagen es arm64 (buildeada en la Mac) y el VPS es amd64. Verificar:

```bash
docker image inspect countrify:local --format '{{.Architecture}}'   # debe decir amd64
uname -m                                                            # x86_64
```

Solucion: buildear en el VPS, o `docker buildx build --platform linux/amd64`.

### La app no conecta a la base y el error parece de red

`connection terminated unexpectedly`, `ECONNRESET`, `The server does not support
SSL connections`. Casi siempre es `DB_SSL`:

```bash
grep DB_SSL deploy/.env.app     # tiene que decir exactamente: DB_SSL=disable
```

`lib/db/postgres.ts`, en `getPoolConfig()`, apaga TLS **solo** con el literal `disable`. Cualquier
otro valor —incluida la variable ausente, `false`, `0` o `off`— intenta TLS.

El otro clasico: `DB_HOST=localhost`. Dentro del contenedor, `localhost` es el
contenedor mismo. Tiene que ser `postgres`, el nombre del servicio.

### Subir un archivo falla con `SignatureDoesNotMatch` o 403

Tres causas, en orden de frecuencia:

1. **Checksums del SDK.** Desde `@aws-sdk/client-s3` 3.1045 el SDK manda
   checksums CRC32 en todos los PUT y eso rompe el PUT prefirmado contra R2 y
   MinIO. `lib/storage/s3.ts` lo desactiva con
   `requestChecksumCalculation: 'WHEN_REQUIRED'`. Si alguien saca esa linea,
   vuelve el problema: el presign anda y el PUT del navegador falla siempre.
2. **`S3_ENDPOINT` con el host equivocado.** La firma se calcula sobre el host
   del endpoint. Tiene que ser el hostname **publico** con el que pega el
   navegador, no `http://minio:9000`.
3. **CORS.** `content-length` tiene que estar en `AllowedHeaders`, en los dos
   buckets. Ver `docs/STORAGE.md`.

### El rate limit de login no frena nada

El proxy esta dejando pasar el `X-Forwarded-For` del cliente.
`lib/rate-limit.ts:63` toma `xff.split(',')[0]`, o sea el primer valor de la
lista: si el proxy **appendea** en vez de **pisar**, el atacante controla ese
primer valor y se saltea el limite de 10 logins por minuto. Afecta a
`/api/auth/login`, `forgot-password`, `reset-password` y `change-password`.

- Caddy: `header_up X-Forwarded-For {remote_host}` dentro de `reverse_proxy`
  (ya esta en `deploy/Caddyfile`).
- nginx: `proxy_set_header X-Forwarded-For $remote_addr;` — **nunca**
  `$proxy_add_x_forwarded_for`.

Se verifica con el bucle de curl del paso 12.

### Los puertos 80/443 ya estan tomados

```bash
ss -tulpn | grep -E ':80 |:443 '
```

No levantar el perfil `caddy`: usar el caso B del paso 9. Si el proceso que los
ocupa resulta ser algo que nadie usa, apagarlo **solo** despues de confirmar con
el dueño de los bots.

### `Cannot find module '@node-rs/argon2'`

El modulo nativo del hash de passwords no llego a la imagen. El Dockerfile ya lo
copia a mano desde el stage de build justamente por esto; si vuelve a pasar,
verificar dentro del contenedor:

```bash
$DC exec app ls node_modules/@node-rs
```

### Cambie NEXT_PUBLIC_SITE_URL y la app sigue mostrando el valor viejo

Alguna variable `NEXT_PUBLIC_*` quedo definida durante el build y Next la
congelo en el codigo. Revisar que no haya un `.env` en el contexto del build
(`.dockerignore` lo excluye) ni un `--build-arg` de mas, y rebuildear.

### Caddy ni siquiera arranca

Si el contenedor sale al instante con un error de parseo del Caddyfile, casi
siempre es que `COUNTRIFY_DOMAIN` o `COUNTRIFY_TLS_EMAIL` estan vacios en
`deploy/.env`: el Caddyfile los expande y queda una directiva sin argumento.

```bash
grep -E 'COUNTRIFY_(DOMAIN|TLS_EMAIL)' deploy/.env
$DC --profile caddy config caddy    # ver como quedan resueltas
```

### Caddy no consigue el certificado

```bash
$DC logs caddy | tail -50
dig +short countrify.com.ar        # ¿apunta al VPS?
ss -tulpn | grep -E ':80 |:443 '   # ¿los tiene Caddy?
```

Let's Encrypt valida por HTTP en el puerto 80: si el DNS no propago todavia o el
80 esta ocupado, no hay certificado. Ojo con el rate limit de Let's Encrypt
(5 fallos por hora por dominio): no reintentar en loop.

### El VPS se queda sin memoria y se caen los bots

```bash
docker stats --no-stream
dmesg -T | grep -i 'killed process'
```

Bajar `mem_limit` de `postgres` y `app` en `docker-compose.yml` y, si Postgres es
el que aprieta, tambien `shared_buffers` (el `command:` del servicio). Los
valores por default asumen que Countrify puede usar ~3.3 GB de los 8 GB.

### `migrate.mjs` aborta por hash distinto

Una migracion ya aplicada cambio de contenido en disco. Es a proposito: una
migracion aplicada es historia y no se edita. Si el cambio es real, escribir una
migracion nueva. Si el archivo se regenero sin cambios de fondo (por ejemplo
`node scripts/db/build-schema.mjs`) y la base ya tiene ese estado, actualizar el
hash a mano con el `update` que el propio error imprime.
