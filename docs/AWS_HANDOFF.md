# Countrify AWS Handoff

## Estado actual

El proyecto ya corre en AWS y hoy está en un estado de migración avanzada:

- Hosting: `ECS/Fargate`
- Contenedores: `ECR`
- Entrada pública: `ALB`
- Storage nuevo: `S3`
- Base nueva: `RDS PostgreSQL`
- Autenticación nueva: `Cognito`

Todavía existe compatibilidad con Supabase para partes del sistema que no se terminaron de migrar. La app hoy funciona en modo híbrido.

## Recursos principales

- Región AWS: `us-east-1`
- Cuenta AWS: `351885857894`
- ALB:
  - `http://citify-prod-alb-522648696.us-east-1.elb.amazonaws.com`
- ECS Cluster:
  - `citify-prod-cluster`
- ECS Service:
  - `citify-prod-service`
- Task definition family:
  - `citify-prod-web`
- ECR:
  - `351885857894.dkr.ecr.us-east-1.amazonaws.com/citify/citify-web-prod`
- S3 bucket:
  - `citify-prod-assets`
- RDS host:
  - `citify-prod-db.cyhi4wiiax9v.us-east-1.rds.amazonaws.com`
- RDS database:
  - `citify`
- Cognito User Pool:
  - `us-east-1_qcmuRiMh1`
- Cognito App Client:
  - `2pqp4rei9p3971diarhiht9lnu`

## Arquitectura de autenticación

La app ya no inicia sesión con Supabase en el frontend.

La sesión actual usa:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- cookie `countrify_session`

Archivos clave:

- `C:\repos\citify\lib\auth\session.ts`
- `C:\repos\citify\app\api\auth\login\route.ts`
- `C:\repos\citify\app\api\auth\logout\route.ts`
- `C:\repos\citify\app\api\auth\me\route.ts`
- `C:\repos\citify\lib\auth.ts`
- `C:\repos\citify\components\login-form.tsx`
- `C:\repos\citify\components\navbar.tsx`

## Arquitectura de datos

### Ya en AWS

- Schema RDS aplicado
- Conectividad app -> RDS validada con:
  - `/api/health/rds`
- Usuarios sembrados en Cognito
- Datos base sembrados en RDS:
  - `buildings`
  - `businesses`
  - `profiles`

### Sigue usando Supabase en parte

Todavía quedan rutas y módulos que persisten o consultan contra Supabase por backend server-side.

Eso significa:

- el usuario ya entra por Cognito
- pero no toda la lógica de negocio dejó Supabase

## Storage

### S3

Uploads nuevos ya pasan por S3 en estos flujos:

- marketplace
- logos de negocio
- imágenes de promociones
- documentos de gastos

Archivos clave:

- `C:\repos\citify\lib\aws\s3.ts`
- `C:\repos\citify\app\api\uploads\marketplace-url\route.ts`
- `C:\repos\citify\app\api\uploads\business-asset-url\route.ts`
- `C:\repos\citify\app\api\uploads\expense-document-url\route.ts`

### Compatibilidad legacy

La lectura todavía tolera archivos viejos en Supabase Storage para no romper datos existentes.

## Dashboards migrados

### Negocio

Flujos principales ya desacoplados del browser client de Supabase:

- crear/editar promo
- borrar promo
- actualizar logo
- actualizar ubicación
- validar canje

Rutas:

- `C:\repos\citify\app\api\business\promotions\route.ts`
- `C:\repos\citify\app\api\business\promotions\[id]\route.ts`
- `C:\repos\citify\app\api\business\profile\route.ts`
- `C:\repos\citify\app\api\business\redemptions\validate\route.ts`

### Vecino

Flujos principales ya desacoplados del browser client de Supabase:

- guardar/desguardar promos
- generar token QR
- polling de canje
- publicar en marketplace

Rutas:

- `C:\repos\citify\app\api\consumer\saved-promotions\toggle\route.ts`
- `C:\repos\citify\app\api\consumer\redemptions\token\route.ts`
- `C:\repos\citify\app\api\consumer\redemptions\status\route.ts`
- `C:\repos\citify\app\api\consumer\marketplace-items\route.ts`

## Scripts útiles

- Aplicar schema RDS:
  - `C:\repos\citify\scripts\apply-rds-schema.js`
- Sincronizar usuarios a Cognito:
  - `C:\repos\citify\scripts\sync-cognito-users.js`
- Sincronizar perfiles base a RDS:
  - `C:\repos\citify\scripts\sync-rds-profiles.js`

## Variables importantes

La app hoy depende, como mínimo, de:

- `APP_SESSION_SECRET`
- `AWS_COGNITO_REGION`
- `AWS_COGNITO_USER_POOL_ID`
- `AWS_COGNITO_CLIENT_ID`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_S3_PUBLIC_BASE_URL`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

Compatibilidad legacy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Qué falta para salir completamente de Supabase

1. Migrar complaints
2. Migrar rutas server que todavía usan `supabase.auth.getUser()`
3. Reemplazar RPCs de Supabase por lógica backend/RDS
4. Mover más lecturas y escrituras a RDS
5. Apagar lectura legacy de Supabase Storage cuando ya no haga falta
6. Eliminar dependencias restantes del cliente/SSR de Supabase

## Checklist de prueba

### Infra

- `/api/health/rds` devuelve `ok: true`
- `/api/health/cognito` devuelve `ok: true`

### Auth

- login funciona
- navbar refleja sesión correcta
- logout limpia sesión

### Negocio

- panel `/admin`
- crear promo
- editar promo
- borrar promo
- cambiar logo

### Vecino

- guardar promo
- generar QR
- publicar marketplace

## Secretos

Este documento no incluye secretos sensibles.

El archivo local de operación con credenciales y referencias quedó fuera del repo en:

- `C:\tmp\citify-aws-team-secrets.md`

Ese archivo no debe subirse al repositorio.
