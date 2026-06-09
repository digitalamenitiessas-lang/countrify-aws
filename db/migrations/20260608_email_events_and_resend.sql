-- Infra de email (Resend / SES) para Countrify.
-- Crea countrify.email_events (audit log + dedup + alimenta el webhook y las
-- metricas) y agrega a countrify.profiles las columnas del kill-switch
-- (email_blocked*) y las preferencias por categoria (email_notifications).
--
-- El codigo que asume este esquema ya esta portado:
--   * lib/email/send.ts            -> insert en email_events, dedup, preference check
--   * lib/db/email-metrics.ts      -> agregados por status/template sobre email_events
--   * app/api/email/resend-webhook -> update de status + email_blocked en profiles
--
-- Nota: la columna se llama ses_message_id por legacy (era SES). Hoy guarda el
-- id del proveedor activo (Resend). El webhook hace el lookup por esta columna.

-- ----------------------------------------------------------------------------
-- 1) profiles: kill-switch + preferencias
-- ----------------------------------------------------------------------------
alter table countrify.profiles
  add column if not exists email_blocked boolean not null default false,
  add column if not exists email_blocked_reason text,
  add column if not exists email_blocked_at timestamptz,
  add column if not exists email_notifications jsonb not null default
    '{"complaints": true, "liquidations": true, "announcements": true, "reminders": true, "promotions": true}'::jsonb;

-- ----------------------------------------------------------------------------
-- 2) email_events: audit log de cada intento de envio
-- ----------------------------------------------------------------------------
create table if not exists countrify.email_events (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  to_email text not null,
  to_profile_id uuid references countrify.profiles(id) on delete set null,
  subject text not null,
  -- dedup: dos envios con el mismo idempotency_key -> el segundo es 'duplicate'.
  idempotency_key text,
  -- sent | suppressed | duplicate | failed | delivered | bounced | complained
  status text not null,
  -- id del proveedor (Resend). Lo usa el webhook para hacer match del evento.
  ses_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz
);

-- Dedup lookup (findExistingByIdempotency). Unique parcial: multiples NULL ok.
create unique index if not exists email_events_idempotency_key_uidx
  on countrify.email_events (idempotency_key)
  where idempotency_key is not null;

-- Webhook: lookup por el id del proveedor.
create index if not exists email_events_message_id_idx
  on countrify.email_events (ses_message_id)
  where ses_message_id is not null;

-- Metricas: getEmailHealthSummary / listTemplateHealth filtran por ventana.
create index if not exists email_events_sent_at_idx
  on countrify.email_events (sent_at desc);

create index if not exists email_events_template_sent_at_idx
  on countrify.email_events (template_key, sent_at desc);

-- listTopBouncingAddresses agrupa bounces por address.
create index if not exists email_events_to_email_status_idx
  on countrify.email_events (to_email, status);

-- ----------------------------------------------------------------------------
-- 3) grants: el app user (countrify_app) opera la tabla. Esta migracion corre
--    como citify_admin (dueno del schema), asi que damos permisos explicitos.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on countrify.email_events to countrify_app;
