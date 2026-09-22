-- ---------------------------------------------------------------------------
-- Columnas de businesses y promotions que la app usa y que faltaban.
--
-- NOTA: businesses y promotions viven en el schema `shared` (ver
-- scripts/db/build-schema.mjs). Sobre una base creada desde cero estas columnas
-- ya vienen en el DDL base y esta migracion es no-op: se conserva porque una
-- base que ya exista si las necesita.
--
-- Contexto: businesses y promotions vivian en el schema public de la base de
-- Citify. Al traerlas al schema countrify, el DDL se saco de
-- scripts/generated-rds-schema.sql, que es un volcado CONGELADO de Citify del
-- 20260518. Las columnas agregadas por migraciones posteriores a esa fecha no
-- estaban ahi, asi que la app arrancaba y despues fallaba en runtime con
-- "column does not exist".
--
-- Encontradas levantando la app contra la base nueva:
--   column "address" does not exist            -> BrandsCarousel del landing
--   column p.published_month does not exist    -> /superadmin (500)
--
-- La fuente de la forma exacta es el repo hermano:
--   citify-aws/db/migrations/20260420_promotion_qr_monthly.sql
--   countrify-aws/lib/db/businesses.ts:17-29 (BUSINESS_SELECT_COLUMNS)
--   countrify-aws/lib/db/business.ts:33-40 (patch de updateBusinessFields)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- businesses: direccion y coordenadas
--
-- Las tres las selecciona BUSINESS_SELECT_COLUMNS y las escribe
-- updateBusinessFieldsInPostgres. Van nullable: un negocio puede cargarse sin
-- direccion y completarla despues, y el mapa del backoffice tolera un negocio
-- sin coordenadas (no lo dibuja).
-- ---------------------------------------------------------------------------
alter table shared.businesses
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- ---------------------------------------------------------------------------
-- promotions: mes de publicacion y promocion de origen
--
-- published_month agrupa las promos por mes (el negocio publica un cupo
-- mensual) y source_promotion_id apunta a la promo del mes anterior cuando se
-- reutiliza.
--
-- Sobre el default: date_trunc devuelve timestamptz, por eso el cast a date.
-- Se setea el default ANTES del not null para que las filas que ya existan
-- (ninguna hoy, pero esta migracion tiene que ser correcta tambien sobre una
-- base con datos) tomen un valor valido.
-- ---------------------------------------------------------------------------
alter table shared.promotions
  add column if not exists published_month date,
  add column if not exists source_promotion_id uuid
    references shared.promotions(id) on delete set null;

update shared.promotions
   set published_month = date_trunc('month', coalesce(created_at, now()))::date
 where published_month is null;

alter table shared.promotions
  alter column published_month set default date_trunc('month', now())::date;

alter table shared.promotions
  alter column published_month set not null;

create index if not exists promotions_business_month_idx
  on shared.promotions (business_id, published_month desc);

create index if not exists promotions_source_idx
  on shared.promotions (source_promotion_id);

-- ---------------------------------------------------------------------------
-- Un vecino no puede canjear dos veces la misma promocion.
--
-- La funcion de canje hace `on conflict (profile_id, promotion_id) do nothing`
-- para detectar el doble canje, y sin este indice unico ese ON CONFLICT es un
-- error de sintaxis en tiempo de ejecucion: no hay constraint que matchee.
-- ---------------------------------------------------------------------------
create unique index if not exists promotion_redemptions_profile_promotion_uidx
  on countrify.promotion_redemptions (profile_id, promotion_id);
