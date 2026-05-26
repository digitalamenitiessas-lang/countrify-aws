# Production Readiness — Countrify

Tracking de los gaps para salir a producción. Espejo del doc de Citify
pero con el estado real de Countrify. Si la sesión se interrumpe,
abrir este doc da el estado de cada item.

Última actualización: 2026-05-26

---

## Sprint 0 — Bloqueantes hard (no salir sin esto)

- [ ] **SES production access** o switch a Resend/Postmark. Sandbox:
  200/día, solo a addresses verificadas. La cuenta AWS es compartida
  con Citify: case `177930958100136` DENIED 2 veces, pendiente de
  respuesta del último bump. Mismo bloqueo afecta a Countrify.
- [x] **Secretos fuera de plaintext en task def** ✅
  - 4 secretos creados en AWS Secrets Manager:
    `countrify/prod/db-password`, `countrify/prod/app-session-secret`,
    `countrify/prod/vapid-private-key`, `countrify/prod/openrouter-api-key`.
  - IAM policy adjunta a `ecsTaskExecutionRole`.
  - Task def `countrify-prod-web:10` con los 4 valores en `secrets`/
    `valueFrom`. El resto del env sigue plaintext (DB host/port/user,
    Cognito ids, region — no sensibles).
- [x] **Rate limiting en `/api/auth/*`** ✅ (commit `67e743e`, port desde Citify)
  - `lib/rate-limit.ts` con fixed-window in-memory + sweep
    opportunistico. Single-task hoy; multi-task necesitará Redis.
  - Aplicado en las 4 rutas:
    - `/api/auth/login`: 10/min por IP.
    - `/api/auth/forgot-password`: 10/h por IP + 3/h por email.
    - `/api/auth/reset-password`: 10/min por IP.
    - `/api/auth/change-password`: 5/min por profile + 20/h por IP.
  - 429 con header `Retry-After` y mensaje en español.
- [x] **Páginas legales** ✅ (commit `e50f30e`, placeholders pendientes
      de revisión legal)
  - `app/legal/layout.tsx` con tabs entre las 3 páginas.
  - `app/legal/terminos/page.tsx`, `app/legal/privacidad/page.tsx`
    (cubre Ley 25.326), `app/legal/cookies/page.tsx`.
  - Links en el footer del landing.
  - Marcadas como "Borrador inicial — pendiente de revisión legal".
    El abogado tiene que ver el banner y reemplazar los `[PLACEHOLDER]`.
- [x] **Error pages** ✅ (commit `75d1070`)
  - `app/not-found.tsx`: 404 branded con CTA "Volver al inicio".
  - `app/error.tsx`: errores en route segments, muestra `digest`.
  - `app/global-error.tsx`: fallback cuando falla el root layout.
- [ ] **Sentry o error tracker**. Solo CloudWatch logs hoy. Necesita
  account creation; free tier alcanza para el volumen actual.

## Sprint 1 — Operacionales (te queman post-launch)

- [ ] Staging environment (task def + RDS de staging — hoy
  apuntamos todos a prod)
- [x] **CI/CD GitHub Actions** ✅ (commit `1325cee`)
  - `.github/workflows/deploy.yml`: push a `main` → build, push a ECR,
    registra nueva task def, `update-service`.
  - `.github/workflows/migrate.yml`: dispatch manual para correr
    migraciones SQL contra prod.
  - **Countrify está adelante de Citify en este punto.**
- [ ] Restore test de RDS snapshot (nunca se hizo — DB compartida con Citify)
- [ ] Service worker cache busting (problema heredado del PWA)
- [ ] Dashboard / alarma de bounce rate SES (>5% suspende sending,
      compartido con Citify)
- [ ] Comunicados (DB + UI + email — feature gap clave del iadmin)
- [ ] Onboarding self-service form ("quiero sumar mi consorcio")
- [x] **Reminders cron + UI** ✅ (commits `7fe388c` + `7006e97`, 2026-05-26)
  - UI ya existía; faltaba scoped por edificio y trigger automático.
  - Refactor: core de `generateReminders` extraído a
    `lib/iadmin/generate-reminders-core.ts` (sin user context).
  - Endpoint sistémico `POST /api/cron/generate-reminders` con bearer auth.
    Itera administrations activas, audit log con `actor_profile_id=NULL` y
    action `reminders.generated_by_cron`.
  - `/iadmin/recordatorios` con `?propertyId=` + `ScopedToBuildingBanner`.
  - **Infra AWS**:
    - Secret `countrify/prod/cron-secret` en Secrets Manager.
    - Task def `countrify-prod-web:11` con `CRON_SECRET` inyectado.
    - Lambda `countrify-cron-generate-reminders` (Node 20) en
      `infra/lambda/cron-reminders/`. Lee secret y hace POST con bearer.
    - EventBridge rule `countrify-cron-reminders-daily` schedule
      `cron(0 12 * * ? *)` = 09:00 ARG.
    - Probada manualmente con `aws lambda invoke`: wiring OK, conecta
      y envía bearer correcto.
  - **Pendiente smoke test del endpoint** post-deploy del commit
    `7fe388c` (bloqueado por outage de GitHub Actions del 2026-05-26).
- [ ] Mobile responsive en `/iadmin/*` (built para desktop)

## Sprint 2 — Features gaps

- [x] **Cobranzas MVP** ✅ (commit `0361dc0`, 2026-05-25)
  - Vista scoped por edificio (`/iadmin/cobranzas?propertyId=…`)
  - KPIs cobrado/pendiente + buckets pagó-tiempo/tarde/parcial/sin pagar
  - Listado filtrable, drawer de detalle por unidad, recordatorio WhatsApp.
  - Pendiente: vista cross-cartera (placeholder), drawer de registrar
    cobro en la página (el form existe, falta engancharlo acá).
- [ ] PDF de liquidación / recibo verificado E2E
- [ ] Reportes / morosos / export CSV en cobranzas
- [ ] Conciliación bancaria CSV import
- [ ] Restaurar / asignar `iadmin_unit_holders` desde UI

## Específicos de Countrify (no aplican a Citify)

- [ ] **Dual-pool Cognito limpio**: hoy Countrify pool es primary
      (vecinos/admins) y Citify pool es fallback para negocios
      compartidos. Task def precisa `AWS_COGNITO_BUSINESS_*` o el
      fallback no dispara. Documentar y considerar separación a futuro.
- [ ] **S3 compartido**: usamos `citify-prod-assets` para lectura y
      escritura. El bucket propio `countrify-prod-assets` quedó creado
      pero sin uso. Decidir si migramos o mantenemos compartido.
- [ ] **PWA icons**: ya hay íconos PNG (commit `bc39d1c`) pero falta
      validar install en iOS y Android.
- [ ] **Seed de datos demo de cobranzas**: Country Demo tiene
      managed_property + unidades pero 0 liquidaciones. Para testear
      la UI con datos reales hay que cargar gastos + emitir un run, o
      seedear con SQL.

## Roadmap v1.5+

- WhatsApp Business API (hoy solo genera `wa.me?text=` link)
- Pasarela de pago en `/l/[token]` (MercadoPago/Stripe)
- Reportes con gráficos (recharts ya está)
- AI assistance en flows normales (helpers ya existen en `lib/iadmin/ai-*.ts`)

---

## Estado de ejecución

**Sprint 0**: 4/6 completos. Bloquean salida a prod real:
- SES sandbox (compartido con Citify, esperando respuesta de AWS)
- Sentry (falta account)

**Sprint 1**: 2/9 completos (CI/CD + Reminders cron).

**Sprint 2**: 1/5 completos (cobranzas MVP).

## Incidentes activos

- **2026-05-26**: GitHub Actions major outage (githubstatus.com).
  Commits `bb288b3`, `7fe388c`, `7006e97` no triggearon deploys.
  Cuando se recupere: `git commit --allow-empty -m "ci: retrigger"
  && git push` o "Run workflow" manual en la UI.
