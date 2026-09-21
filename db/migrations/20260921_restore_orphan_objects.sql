-- ---------------------------------------------------------------------------
-- Restaura los objetos que la app usa en runtime y que nunca estuvieron en
-- ningun .sql del repo.
--
-- Contexto: estos objetos se aplicaron a mano sobre la base de produccion en
-- AWS y nunca se versionaron. Al borrarse la cuenta AWS se perdio la base, y
-- con ella la unica copia de estas definiciones. Se reconstruyen a partir de
-- las queries del codigo, que son la unica fuente que quedo.
--
--   password_must_change  -> lib/db/profiles.ts:16,52,82,93
--   password_reset_tokens -> app/api/auth/forgot-password/route.ts:57,63
--                            app/api/auth/reset-password/route.ts:50,95,113
--   push_subscriptions    -> lib/db/business.ts:15,27
--
-- NO se crea countrify.iadmin_expense_categories: la unica referencia esta en
-- scripts/seed-cobranzas-demo.js:83 y la app no la consulta en ningun lado
-- (0 referencias en lib/ y app/). countrify.iadmin_expenses.category es una
-- columna de texto plano. Ese script de seed quedo desactualizado.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. profiles.password_must_change
--
-- Marca que el usuario tiene que cambiar la password antes de poder usar la
-- app. Se setea en true al crear un usuario con password temporal y lo chequea
-- requireProfile (lib/auth.ts:70), que redirige a /cambiar-password?first=1.
-- ---------------------------------------------------------------------------
alter table countrify.profiles
  add column if not exists password_must_change boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. password_reset_tokens
--
-- Flujo de "olvide mi password". El token plano de 32 bytes viaja por mail y
-- solo se guarda su hash SHA-256, asi que un dump de la base no permite
-- resetear la password de nadie.
-- ---------------------------------------------------------------------------
create table if not exists countrify.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references countrify.profiles(id) on delete cascade,
  token_hash text not null,
  requested_ip inet,
  user_agent text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- El lookup del reset es por token_hash y tiene que ser unico: dos filas con el
-- mismo hash harian ambiguo que token se esta consumiendo.
create unique index if not exists password_reset_tokens_token_hash_key
  on countrify.password_reset_tokens (token_hash);

-- forgot-password invalida los tokens vivos del profile antes de emitir uno
-- nuevo (route.ts:57): filtra por profile_id + used_at is null + expires_at.
create index if not exists password_reset_tokens_profile_active_idx
  on countrify.password_reset_tokens (profile_id)
  where used_at is null;

-- ---------------------------------------------------------------------------
-- 3. push_subscriptions
--
-- Suscripciones de Web Push (VAPID). El upsert de lib/db/business.ts:17 hace
-- `on conflict (profile_id, endpoint)`, asi que ese par tiene que ser unico.
-- ---------------------------------------------------------------------------
create table if not exists countrify.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references countrify.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_profile_endpoint_key
  on countrify.push_subscriptions (profile_id, endpoint);

-- ---------------------------------------------------------------------------
-- 4. Unicidad de email en profiles
--
-- No es un objeto perdido: nunca existio. La unicidad la garantizaba Cognito,
-- que usaba el email como Username del pool y rechazaba duplicados con
-- UsernameExistsException. Al sacar Cognito esa garantia desaparece, y la carga
-- masiva de vecinos (app/superadmin/actions.ts) podria crear dos perfiles con
-- el mismo email — con lo cual el login por email queda ambiguo.
--
-- Va sobre lower(email) porque findProfileByEmail normaliza a minusculas antes
-- de consultar (app/api/auth/login/route.ts:27).
-- ---------------------------------------------------------------------------
create unique index if not exists profiles_email_lower_key
  on countrify.profiles (lower(email));
