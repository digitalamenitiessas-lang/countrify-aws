# Countrify

App de beneficios exclusivos para residentes de countries y barrios cerrados: gastronomía, wellness, eventos, reservas personalizadas y más.

Powered by Digital Amenities.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Montserrat / Montserrat Alternates
- AWS: Cognito · RDS Postgres · S3 · ECS Fargate · ECR · ALB
- Web Push (VAPID) · OpenRouter (IA backoffice)

Comparte la instancia RDS y el cluster ECS con Citify; cada producto tiene su propio Cognito, S3 bucket, schema de datos y dominio.

## Desarrollo local

Requiere Node 20+ (o superior) y un `.env.local` con las variables del proyecto (ver `.env.example`).

```bash
npm install
npm run dev
```

App disponible en `http://localhost:3000` (o el puerto que Next informe).

## Estructura

```
app/             # Next.js App Router (páginas + API routes)
components/      # UI (shadcn + componentes propios)
lib/             # Auth, DB (pg), AWS SDKs, utilidades
public/          # Assets estáticos y logos
scripts/         # Schemas SQL + utilidades de migración
supabase/        # Legado: migraciones y seeds heredadas (en proceso de limpieza)
brand/           # Manual de marca y logos fuente
docs/            # Documentación operativa
```

## Despliegue

Imagen Docker → ECR → task definition en cluster ECS `citify-prod-cluster`.
Tabla compartida con Citify: `businesses` y `promotions` (misma fila por negocio/promo).

Ver `docs/AWS_HANDOFF.md` para detalle de recursos AWS.
