# Handoff — Countrify

Documento maestro para retomar. Acá está **dónde estamos**, **qué docs
relacionados existen** y **qué sigue en orden**.

Última actualización: 2026-05-26 (tarde)

---

## Docs relacionados que usamos

| Doc | Propósito |
|---|---|
| [PRODUCTION-READINESS.md](./PRODUCTION-READINESS.md) | Tracker de sprints (0/1/2) + ítems específicos de Countrify. Estado vivo de qué está done/pending. |
| [docs/AWS_HANDOFF.md](./docs/AWS_HANDOFF.md) | Inventario de infra AWS (ECS, ECR, ALB, RDS, Cognito, S3, Secrets Manager). Útil cuando hay que tocar infra. |
| [docs/LINK-EXISTING-USER-TO-UNIT.md](./docs/LINK-EXISTING-USER-TO-UNIT.md) | Spec compartida con Citify para vincular vecinos existentes a unidades. **Implementado en Countrify ✅**, pendiente en Citify. |
| [infra/lambda/cron-reminders/README.md](./infra/lambda/cron-reminders/README.md) | Setup del cron diario de recordatorios (Lambda + EventBridge). |
| [scripts/seed-cobranzas-demo.js](./scripts/seed-cobranzas-demo.js) | Script para refrescar Country Demo con datos de prueba (2 fases). |

---

## Dónde estamos hoy

### ✅ Shippeado este sprint

- **Cobranzas MVP completo** — vista por edificio + KPIs + listado + botón "Registrar pago" enganchado a Dialog.
- **Reminders cron + UI** — endpoint sistémico `/api/cron/generate-reminders` + Lambda + EventBridge schedule diario 09:00 ARG. Smoke E2E pasó.
- **Vincular vecino existente a unidad** — implementado en `ed07941`, doc espejo para Citify actualizado.
- **CI/CD GitHub Actions** — activo (deploy + migrate-prod workflows). Adelantados sobre Citify acá.

### ⏳ Pendiente de validar E2E (no es código — es probar con data real)

Country Los Naranjos tiene 1 run en `calculated` con 3 unidades y 2 gastos.
Para validar todo lo de hoy en vivo:

1. Login admin Los Naranjos → `/iadmin/liquidaciones?propertyId=54cd08f9-32ef-4f40-bc99-77c6bb57d275` → **Emitir** (con 2 due_dates).
2. `/iadmin/cobranzas?propertyId=54cd08f9-…` → ver 3 unidades unpaid + probar "Registrar pago".
3. `aws lambda invoke countrify-cron-generate-reminders` → debería crear 3+ reminders.
4. `/iadmin/recordatorios?propertyId=54cd08f9-…` → ver bandeja con avisos.
5. `/print/liquidaciones/<run-id>` → vista imprimible.
6. Generar share token de una unidad → `/l/<token>` → recibo público.

**Esto es ~15 min de clicks.** No bloquea otros trabajos pero da confianza de que todo lo de hoy efectivamente funciona.

### 🔍 Descubierto hoy (no estaba en el tracker)

Tu compañero de Citify (branch `matias` commit `89fd8fa`) tiene cosas
que Countrify **no** tiene y vale la pena portar:

- **Notificaciones in-app (la campanita)** — tabla `user_notifications`, helper `enqueueUserNotification`, componente `NotificationsBell` en navbar, página `/notificaciones`. Trigger cuando se emite un run.
- **`iadmin_payment_receipts`** — vecino sube comprobante (foto/PDF), admin aprueba/rechaza. Feature grande, distinto del flujo de "admin registra cobro" que tenemos hoy.
- **Vencimientos editables al emitir** — modal "Liquidar y enviar" con due_dates editables (1-4 vencimientos + % de recargo). Verificar si ya está en Countrify.
- **Recargo dinámico** — `ReportPaymentDialog` detecta fecha y precarga monto con recargo. Depende de `iadmin_payment_receipts`.

---

## Roadmap propuesto (en orden)

### Tier A — Cerrar lo de hoy

- [ ] **A1. Validación E2E con Los Naranjos** — 15 min de clicks. Ver "Pendiente de validar" arriba.

### Tier B — Paridad con Citify (lo que descubrimos)

- [ ] **B1. Notificaciones in-app (campanita)** — ~1.5-2h. Portar de `89fd8fa`. Simplifica a 1 kind (`liquidation_emitted`) porque no tenemos receipts todavía. Trigger: hook en `changeLiquidationStatus` cuando pasa a `issued`.
- [ ] **B2. `iadmin_payment_receipts`** — ~4-6h. Feature grande: tabla + UI vecino (subir comprobante) + UI admin (aprobar/rechazar) + 2 kinds más de notification.
- [ ] **B3. Vencimientos editables al emitir** — verificar primero si ya está. Si no, port ~1h.
- [ ] **B4. Recargo dinámico** — depende de B2.

### Tier C — Sprint 1 operacional

- [ ] **C1. SW cache busting** (~1-2h) — bug heredado del PWA, usuarios quedan con builds viejas.
- [ ] **C2. SES bounce rate alarm** (~30 min) — CloudWatch alarm + SNS. Evita que AWS suspenda sending.
- [ ] **C3. PWA icons validation** (~15 min) — confirmar install iOS/Android.
- [ ] **C4. Staging environment** (~2-3h, +RDS staging $$) — para no testear contra prod.
- [ ] **C5. Restore test RDS snapshot** (~1h) — nunca se hizo.
- [ ] **C6. Onboarding self-service form** (~2-3h) — "quiero sumar mi consorcio".
- [ ] **C7. Mobile responsive `/iadmin/*`** (~3-5h) — backoffice hoy es desktop-only.

### Tier D — Sprint 2 features de producto

- [ ] **D1. Comunicados con envío real** (~1.5h) — UI ya existe (redactor IA), falta tabla + server action + botón "Enviar". Con feature flag porque SES sigue en sandbox.
- [ ] **D2. Reportes/morosos CSV export** (~2-3h).
- [ ] **D3. Conciliación bancaria CSV import** (~3-4h) — decidir formato CSV (Galicia/Santander/genérico) **antes** de codear.
- [ ] **D4. Vista cross-cartera de cobranzas** (~1-2h) — hoy es placeholder.

### Tier E — Sprint 0 blockers externos

- [ ] **E1. SES production access** — case `177930958100136` DENIED 2 veces, esperando AWS. **Bloqueante para D1 y para mandar emails a vecinos reales.**
- [ ] **E2. Sentry** — necesita cuenta del lado del user. Sin esto no hay error tracking en producción.

### Tier F — Countrify-specific

- [ ] **F1. Dual-pool Cognito limpieza** — documentar mejor y considerar separación.
- [ ] **F2. S3 compartido vs propio** — decidir si migramos del bucket de Citify al propio.

---

## Estrategia de validación

| Edificio | propertyId | Uso |
|---|---|---|
| Country Los Naranjos | `54cd08f9-32ef-4f40-bc99-77c6bb57d275` | **Validación real** — tiene 3 unidades, 2 gastos, 1 run en `calculated`. Emitir y usar como E2E. |
| Country Demo | `4dd0c8ea-e246-4a1c-8625-77f8a64b4702` | Sandbox para demos. Vacío. Refrescable con `scripts/seed-cobranzas-demo.js`. |
| Country Praderas | `66105181-fcaf-4ae5-9a10-351df52fd60f` | Disponible. Vacío. |

---

## Incidentes activos / contexto operacional

- **GitHub Actions outage** del 2026-05-26 — algunos commits no triggearon deploys automáticos. Cuando vuelva, se debería resolver solo. Workaround usado hoy: build + push manual (docker build → ECR → `update-service --force-new-deployment`). Si vuelve a pasar, el doc `PRODUCTION-READINESS.md` tiene el comando exacto.
- **SES sandbox** — 200/día, solo a destinatarios verificados. Bloqueante para cualquier feature de email-to-vecino.
- **Deploy manual** — sirve para emergencias. Comando armado:
  ```bash
  docker build --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=... -t 351885857894.dkr.ecr.us-east-1.amazonaws.com/countrify/countrify-web-prod:d76b3cf .
  docker push 351885857894.dkr.ecr.us-east-1.amazonaws.com/countrify/countrify-web-prod:d76b3cf
  aws ecs update-service --cluster citify-prod-cluster --service countrify-prod-service --force-new-deployment
  ```

---

## Próximo paso sugerido al retomar

**Si tenés 15 min**: hacer A1 (validar Los Naranjos). Cierra el loop de todo lo shippeado hoy y libera el cron de mañana 09:00 para que cree reminders reales.

**Si tenés 2h**: B1 (campanita de notificaciones) — alta visibilidad, lo ven los vecinos directo, parityea con Citify.

**Si tenés media tarde**: B2 (`iadmin_payment_receipts`) — feature grande pero es lo que más diferenciaría a Countrify hoy (vecino sube comprobante, admin lo aprueba).

**Si tenés 1h y querés sacar deuda operativa**: C2 + C3 (~45 min juntos) — SES alarm + PWA icons.
