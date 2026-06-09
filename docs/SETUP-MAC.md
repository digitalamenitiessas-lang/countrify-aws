# Setup del entorno Countrify en una Mac nueva

Runbook para levantar el entorno de desarrollo/operación de **Countrify** desde cero.

> ⚠️ **Secretos:** este doc NO contiene valores secretos (access keys, passwords, API
> keys). Esos se copian directo de máquina a máquina — ver
> [§ Archivos a copiar (secretos)](#archivos-a-copiar-secretos). Nunca los pegues en
> chats ni los commitees.
>
> ⚠️ **Cuenta AWS compartida con Citify.** Misma cuenta AWS corre Countrify y Citify en
> paralelo. No toques recursos `citify-*` salvo los que Countrify reutiliza a propósito
> (ej. bucket `citify-prod-assets`, cluster `citify-prod-cluster`). No necesitás ningún
> archivo de secretos de Citify para operar Countrify.

---

## 1. Herramientas a instalar

| Tool | Versión de referencia | Cómo instalar en Mac |
|---|---|---|
| Node | `v25.x` | `nvm install 25 && nvm alias default 25` |
| npm | `11.x` (viene con Node) | — |
| AWS CLI | `v2.x` | `brew install awscli` |
| Docker | `29.x` | Docker Desktop para Mac |
| git | cualquiera reciente | `brew install git` / Xcode CLT |

El proyecto usa **npm** (hay `package-lock.json`, no pnpm/yarn).

Verificación post-install:

```bash
node --version    # v25.x
npm --version     # 11.x
aws --version     # aws-cli/2.x
docker --version  # 29.x
```

---

## 2. Clonar el repo

```bash
git clone <url-del-repo-countrify-aws> countrify-aws
cd countrify-aws
npm install
```

---

## 3. Identidad / config AWS

| | |
|---|---|
| IAM user | `countrify-deploy` |
| Account ID | `351885857894` |
| Región | `us-east-1` |
| Perfil CLI | **default** (sin perfil nombrado) |

Las credenciales reales se copian (no se reconfiguran con `aws configure`) — ver
[§ Archivos a copiar](#archivos-a-copiar-secretos).

Verificación:

```bash
aws sts get-caller-identity
# -> Arn: arn:aws:iam::351885857894:user/countrify-deploy
#    Account: 351885857894
```

> El user local `countrify-deploy` **solo** se usa para los scripts de migración/SQL
> (sección 6). El **deploy NO usa estas credenciales** — corre por GitHub Actions vía
> OIDC.

---

## 4. Variables de entorno

Copiá `.env.local` desde la máquina vieja (ver
[§ Archivos a copiar](#archivos-a-copiar-secretos)). El esquema de claves está en
[`.env.example`](../.env.example). Claves esperadas:

```
AWS_REGION, PORT, HOSTNAME, APP_SESSION_SECRET,
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL,
AWS_COGNITO_REGION, AWS_COGNITO_USER_POOL_ID, AWS_COGNITO_CLIENT_ID,
AWS_S3_BUCKET, AWS_S3_PUBLIC_BASE_URL,
VAPID_MAILTO, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
EMAIL_PROVIDER, RESEND_API_KEY, RESEND_FROM_ADDRESS, RESEND_WEBHOOK_SECRET,
OPENROUTER_MODEL, OPENROUTER_API_KEY,
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## 5. Correr en local

```bash
npm run dev      # next dev en http://localhost:3000
```

Build de imagen Docker (no hay docker-compose): usa el [`Dockerfile`](../Dockerfile) de la raíz.

---

## 6. Deploy

**No hay deploy manual desde tu máquina.** Es push-to-main:

```bash
git push origin main      # dispara .github/workflows/deploy.yml
```

El workflow ([`deploy.yml`](../.github/workflows/deploy.yml)):

1. Asume rol AWS por OIDC (`countrify-github-actions-deploy`) — sin secret keys en el runner.
2. Login a ECR (`amazon-ecr-login@v2`).
3. `docker buildx build --push` → `351885857894.dkr.ecr.us-east-1.amazonaws.com/countrify/countrify-web-prod:<IMAGE_TAG>`.
4. `aws ecs update-service --force-new-deployment` sobre cluster `citify-prod-cluster`, service `countrify-prod-service`.
5. Espera `services-stable`, verifica digest, smoke test a `https://countrify.com.ar/`.

> `IMAGE_TAG` es un tag fijo que se bumpea a mano en el bloque `env:` del workflow.

**Login manual a ECR** (solo si alguna vez necesitás push fuera del CI):

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin 351885857894.dkr.ecr.us-east-1.amazonaws.com
```

---

## 7. Conexión a la base (RDS)

La RDS es **privada — no se alcanza desde local**. Se corre SQL **vía ECS run-task**
dentro de la VPC. No necesitás `psql` ni el password en tu Mac.

```bash
# Migración (DDL), en orden cronológico:
bash scripts/migrate-prod.sh db/migrations/<archivo>.sql

# Query / diagnóstico (imprime filas):
bash scripts/run-sql-prod.sh /tmp/diag.sql
```

Ambos suben el `.sql` a `s3://countrify-prod-assets/_tmp/` y lanzan una task Fargate que
conecta a la RDS con las env vars `DB_*` del task def. Ver
[`scripts/migrate-prod.sh`](../scripts/migrate-prod.sh) y
[`scripts/run-sql-prod.sh`](../scripts/run-sql-prod.sh).

---

## Archivos a copiar (secretos)

Mové estos archivos **directo de la máquina vieja a la Mac** por un canal seguro
(AirDrop, `scp`/`rsync` por SSH, o un gestor de secretos / 1Password). **No por chat,
no commitear.**

| # | Qué | Origen (PC Windows) | Destino (Mac) |
|---|---|---|---|
| 1 | Credenciales AWS | `C:\Users\Matías Lujan\.aws\credentials` | `~/.aws/credentials` |
| 2 | Config AWS | `C:\Users\Matías Lujan\.aws\config` | `~/.aws/config` |
| 3 | Env del proyecto | `<repo>\.env.local` (raíz del repo) | `<repo>/.env.local` |

> En Mac, `~/.aws/` puede no existir todavía: `mkdir -p ~/.aws` antes de copiar.
> Permisos recomendados: `chmod 600 ~/.aws/credentials ~/.aws/config .env.local`.

---

## Migrar la memoria de Claude (contexto del proyecto)

Estos archivos NO viajan con `git clone` (viven fuera del repo). Son notas de
arquitectura/operación de Claude — sin passwords crudos, pero con info sensible
(usuarios demo, cauciones de Citify). Tratalos como copia interna, mismo canal seguro.

**Origen (PC Windows)** — carpeta `memory/` completa (12 archivos):

```
C:\Users\Matías Lujan\.claude\projects\C--Users-Mat-as-Lujan-countrify-aws\memory\
├── MEMORY.md                                   (índice — copiar sí o sí)
├── project_cognito_pool_architecture.md
├── project_shared_s3_bucket.md
├── project_auth_maps_by_email.md
├── project_iadmin_mirror_from_citify.md
├── project_superadmin_onboarding_flow.md
├── reference_rds_access_via_ecs.md
├── reference_demo_users.md
├── feedback_ecs_services_separate.md
├── feedback_task_def_image_pin.md
├── feedback_shared_aws_account_caution.md
└── feedback_use_server_export_type_breaks_actions.md
```

**Destino (Mac):**

```
~/.claude/projects/<nombre-derivado-de-la-ruta-del-repo-en-Mac>/memory/
```

El nombre de la carpeta del proyecto lo deriva Claude de la **ruta absoluta** del repo, así
que en Mac será distinto que en Windows (algo como `-Users-<usuario>-countrify-aws`).

> **Truco para no adivinar el nombre:** en la Mac, abrí el proyecto **una vez** con Claude
> Code (eso crea `~/.claude/projects/<...>/` con el nombre correcto), y **recién después**
> copiá los 12 `.md` dentro de la subcarpeta `memory/`.

---

## Verificación final en la Mac

```bash
aws sts get-caller-identity      # user/countrify-deploy, account 351885857894
npm install && npm run dev       # arranca en :3000
```
