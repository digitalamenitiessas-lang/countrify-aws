#!/usr/bin/env node
/**
 * Transforma scripts/countrify-schema.sql (heredado de AWS/Citify) en un schema
 * standalone que aplica limpio sobre un Postgres vacio, en una sola pasada.
 *
 * Que arregla, y por que:
 *
 *  1. Saca el shim falso de Supabase (schema auth, auth.users, auth.uid(),
 *     roles anon/authenticated/service_role). El proyecto nacio en Supabase y
 *     migro a Cognito+RDS; eso quedo como lastre. auth.uid() devuelve null fijo.
 *  2. Saca el FK countrify.profiles.id -> auth.users(id). Es incumplible: ningun
 *     codigo de la app inserta en auth.users, asi que toda alta de usuario
 *     violaba el FK (en prod tiene que haber estado dropeado a mano).
 *  3. Saca handle_new_user() y su trigger sobre auth.users, que dependian de lo
 *     anterior.
 *  4. Saca las 40 `enable row level security` y las 79 policies. Estan muertas:
 *     56 policies dependen de auth.uid(), que devuelve null, y la app usa
 *     pgQuery plano en 107 call sites contra 1 de pgQueryAsProfile. Si el RLS
 *     se aplicara de verdad la app no funcionaria. La autorizacion vive en el
 *     codigo (requireProfile + capacidades iadmin), no en la base.
 *  5. Trae businesses y promotions al schema countrify. Vivian en el schema
 *     public de Citify; el archivo original las dropeaba pero dejaba 5 FKs
 *     apuntando a ellas, por lo que abortaba sobre una base limpia.
 *  6. Mueve countrify.user_has_building_access antes de sus usos. El original
 *     la usa en las lineas 439/491/517/524 y la define en la 565, y Postgres
 *     valida el cuerpo de las funciones `language sql` al crearlas. Por eso el
 *     script de AWS corria el archivo DOS veces aceptando errores en la 1ra.
 *
 * Uso: node scripts/db/build-schema.mjs
 * Salida: db/bootstrap/01_schema.sql
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SOURCE = resolve(root, 'scripts/countrify-schema.sql')
const OUT = resolve(root, 'db/bootstrap/01_schema.sql')

// ---------------------------------------------------------------------------
// Split en sentencias respetando dollar-quoting ($$ ... $$ y $tag$ ... $tag$),
// strings con comillas simples y comentarios de linea.
// ---------------------------------------------------------------------------
function splitStatements(sql) {
  const out = []
  let buf = ''
  let i = 0
  let inSingle = false
  let inLineComment = false
  let dollarTag = null

  while (i < sql.length) {
    const ch = sql[i]
    const rest = sql.slice(i)

    if (inLineComment) {
      buf += ch
      if (ch === '\n') inLineComment = false
      i += 1
      continue
    }

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      buf += ch
      i += 1
      continue
    }

    if (inSingle) {
      buf += ch
      if (ch === "'") inSingle = false
      i += 1
      continue
    }

    if (rest.startsWith('--')) {
      inLineComment = true
      buf += ch
      i += 1
      continue
    }

    if (ch === "'") {
      inSingle = true
      buf += ch
      i += 1
      continue
    }

    const dollarMatch = /^\$[A-Za-z_]*\$/.exec(rest)
    if (dollarMatch) {
      dollarTag = dollarMatch[0]
      buf += dollarTag
      i += dollarTag.length
      continue
    }

    if (ch === ';') {
      out.push(buf + ';')
      buf = ''
      i += 1
      continue
    }

    buf += ch
    i += 1
  }

  if (buf.trim()) out.push(buf)
  return out
}

/** Texto de la sentencia sin comentarios, en minuscula, para hacer matching. */
function codeOf(stmt) {
  return stmt
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .toLowerCase()
    .trim()
}

// ---------------------------------------------------------------------------
// Reglas de descarte
// ---------------------------------------------------------------------------
const DROP_RULES = [
  { name: 'shim: do-block auth/extensions/roles', test: (c) => c.startsWith('do $$') && c.includes("nspname = 'auth'") && c.includes("rolname = 'anon'") },
  { name: 'shim: create table auth.users', test: (c) => /^create table if not exists auth\.users/.test(c) },
  { name: 'shim: function auth.uid() (se reemplaza por countrify.uid)', test: (c) => /^create or replace function auth\.uid\(\)/.test(c) },
  { name: 'shim: function handle_new_user', test: (c) => /^create or replace function countrify\.handle_new_user\(\)/.test(c) },
  { name: 'shim: trigger on_auth_user_created', test: (c) => /on_auth_user_created/.test(c) },
  { name: 'rls: enable row level security', test: (c) => /^alter table .* enable row level security/.test(c) },
  { name: 'rls: create policy', test: (c) => /^create policy/.test(c) },
  { name: 'rls: drop policy', test: (c) => /^drop policy/.test(c) },
  // Un do-block genera policies por iteracion sobre un array de tablas. Es el
  // unico do-block que toca policies y no hace nada mas, asi que se va entero.
  { name: 'rls: do-block que genera policies', test: (c) => c.startsWith('do $$') && /create policy/.test(c) },
  // Ojo: multilinea. `.` no cruza saltos de linea, hay que usar [\\s\\S].
  { name: 'rls: grant a roles de supabase', test: (c) => /^grant [\s\S]*?\bto\b[\s\S]*?\b(anon|authenticated|service_role)\b/.test(c) },
]

// ---------------------------------------------------------------------------
// countrify.uid() — reemplazo de auth.uid().
//
// El schema fuente definia auth.uid() como `select null::uuid`, pero el codigo
// de la app dice otra cosa: lib/db/postgres.ts:102 documenta que "en RDS la
// leemos desde esa variable de sesion", y pgQueryAsProfile setea
// `app.current_profile_id` antes de cada query. O sea que la definicion real en
// produccion nunca fue la del repo. Esta es la version correcta.
//
// Ojo: solo devuelve un valor dentro de pgQueryAsProfile. Las 107 llamadas con
// pgQuery plano la ven NULL, que es exactamente como venia funcionando: la
// autorizacion vive en la capa de app (requireProfile + capacidades iadmin).
// ---------------------------------------------------------------------------
const UID_FUNCTION = `
create or replace function countrify.uid()
returns uuid
language sql
stable
as $fn$
  select nullif(current_setting('app.current_profile_id', true), '')::uuid
$fn$;
`.trim()

// ---------------------------------------------------------------------------
// DDL de businesses/promotions, ahora en el schema countrify.
// Tomado de scripts/generated-rds-schema.sql:79-120, con los `public.`
// reescritos y el FK circular profiles.business_id resuelto por ALTER.
// ---------------------------------------------------------------------------
const SHARED_TABLES = `
-- ---------------------------------------------------------------------------
-- schema shared: businesses y promotions
--
-- Estas dos tablas son COMPARTIDAS entre Countrify y Citify: una misma fila por
-- negocio y por promocion se muestra en los dos productos. En AWS vivian en el
-- schema public de la base de Citify, y Countrify las leia de ahi; eso ataba un
-- producto al schema del otro y generaba los problemas de ownership que
-- documenta scripts/migrate-prod.sh.
--
-- Ahora viven en un schema propio. Las dos apps corren contra la MISMA base de
-- Postgres, cada una con su schema (countrify / citify) mas este. No pueden ser
-- dos bases separadas: Postgres no soporta claves foraneas entre bases, y
-- countrify.profiles, promotion_redemptions, saved_promotions y
-- promotion_redemption_tokens referencian estas tablas.
--
-- DDL original en citify-aws/scripts/generated-rds-schema.sql:79-121.
-- ---------------------------------------------------------------------------

create schema if not exists shared;

create table if not exists shared.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null default '',
  -- SIN clave foranea, a proposito. La fila es compartida pero cada producto
  -- tiene su propia tabla de profiles, asi que este id apunta a los perfiles
  -- del producto que dio de alta el negocio. Un FK solo podria apuntar a uno de
  -- los dos y romperia el alta desde el otro. La integridad de esta columna la
  -- sostiene la app (lib/db/superadmin.ts la escribe).
  owner_profile_id uuid,
  address text,
  latitude double precision,
  longitude double precision,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists shared.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references shared.businesses(id) on delete cascade,
  -- SIN clave foranea, por el mismo motivo que owner_profile_id: los buildings
  -- son de cada producto (countries en Countrify, edificios en Citify).
  -- Nullable significa "promocion para todos"; con valor, la app de ese
  -- producto la limita a ese building.
  building_id uuid,
  title text not null,
  description text not null,
  discount text not null,
  category text not null,
  expiration_date date not null,
  image_path text,
  is_active boolean not null default true,
  published_month date not null default date_trunc('month', now())::date,
  source_promotion_id uuid references shared.promotions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promotions_business_month_idx
  on shared.promotions (business_id, published_month desc);
create index if not exists promotions_source_idx
  on shared.promotions (source_promotion_id);

-- El FK de profiles hacia businesses va por ALTER porque la tabla profiles se
-- crea antes. Cruza de schema, que dentro de la misma base es perfectamente
-- valido.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'countrify'
      and table_name = 'profiles'
      and constraint_name = 'profiles_business_id_fkey'
  ) then
    alter table countrify.profiles
      add constraint profiles_business_id_fkey
      foreign key (business_id)
      references shared.businesses(id)
      on delete set null;
  end if;
end
$$;
`.trim()

// ---------------------------------------------------------------------------
// Roles. countrify_admin es dueno del schema y corre migraciones;
// countrify_app es el usuario de runtime de la app (solo DML).
// ---------------------------------------------------------------------------
const ROLES = `
-- ---------------------------------------------------------------------------
-- Roles de Countrify. Correr como superusuario, una sola vez por cluster.
-- Las passwords se pasan por variable de psql:
--   psql -v admin_pw="'...'" -v app_pw="'...'" -f db/bootstrap/00_roles.sql
-- ---------------------------------------------------------------------------

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'countrify_admin') then
    create role countrify_admin login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'countrify_app') then
    create role countrify_app login;
  end if;
end
$roles$;

alter role countrify_admin password :admin_pw;
alter role countrify_app   password :app_pw;
`.trim()

// Grants para el rol de runtime. Va despues del schema y las migraciones.
const GRANTS = `
-- ---------------------------------------------------------------------------
-- Permisos del usuario de runtime. Solo DML: la app nunca hace DDL.
-- Correr como countrify_admin (dueno del schema) despues de cada migracion.
-- ---------------------------------------------------------------------------

grant usage on schema countrify to countrify_app;

-- El schema shared lo comparten Countrify y Citify: los dos roles de runtime
-- necesitan leer y escribir ahi (un negocio se da de alta desde cualquiera de
-- los dos y tiene que aparecer en el otro).
grant usage on schema shared to countrify_app;
grant select, insert, update, delete on all tables   in schema shared to countrify_app;
grant usage, select                 on all sequences in schema shared to countrify_app;
alter default privileges in schema shared
  grant select, insert, update, delete on tables to countrify_app;

grant select, insert, update, delete on all tables    in schema countrify to countrify_app;
grant usage, select                 on all sequences  in schema countrify to countrify_app;
grant execute                       on all functions  in schema countrify to countrify_app;

-- Y sobre lo que se cree de aca en adelante.
alter default privileges in schema countrify
  grant select, insert, update, delete on tables to countrify_app;
alter default privileges in schema countrify
  grant usage, select on sequences to countrify_app;
alter default privileges in schema countrify
  grant execute on functions to countrify_app;
`.trim()

// ---------------------------------------------------------------------------
// Transformacion
// ---------------------------------------------------------------------------
function transform(sql, { label }) {
  const statements = splitStatements(sql)
  const dropped = new Map()
  const kept = []

  for (const stmt of statements) {
    const code = codeOf(stmt)
    if (!code) continue
    const rule = DROP_RULES.find((r) => r.test(code))
    if (rule) {
      dropped.set(rule.name, (dropped.get(rule.name) ?? 0) + 1)
      continue
    }
    kept.push(
      stmt
        .replace(/\bpublic\.businesses\b/g, 'shared.businesses')
        .replace(/\bpublic\.promotions\b/g, 'shared.promotions')
        .replace(/id uuid primary key references auth\.users\(id\) on delete cascade/g, 'id uuid primary key')
        .replace(/\bauth\.uid\(\)/g, 'countrify.uid()')
        .replace(/\s*,\s*(anon|authenticated|service_role)\b/g, ''),
    )
  }

  return { kept, dropped, label, total: statements.length }
}

function report({ label, total, kept, dropped }) {
  console.log(`\n${label}: ${total} -> ${kept.length} sentencias`)
  for (const [name, count] of [...dropped].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${name}`)
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
mkdirSync(resolve(root, 'db/bootstrap'), { recursive: true })
mkdirSync(resolve(root, 'db/bootstrap/migrations'), { recursive: true })

writeFileSync(resolve(root, 'db/bootstrap/00_roles.sql'), ROLES + '\n')
writeFileSync(resolve(root, 'db/bootstrap/03_grants.sql'), GRANTS + '\n')

// --- schema base ---
const base = transform(readFileSync(SOURCE, 'utf8'), { label: 'schema base' })
let kept = base.kept

const schemaIdx = kept.findIndex((s) => /^create schema if not exists countrify/.test(codeOf(s)))
if (schemaIdx === -1) throw new Error('No encontre `create schema countrify`')
kept.splice(schemaIdx + 1, 0, UID_FUNCTION)

const profilesIdx = kept.findIndex((s) => /^create table if not exists countrify\.profiles/.test(codeOf(s)))
if (profilesIdx === -1) throw new Error('No encontre la tabla countrify.profiles')
kept.splice(profilesIdx + 1, 0, SHARED_TABLES)

const fnIdx = kept.findIndex((s) => /^create or replace function countrify\.user_has_building_access/.test(codeOf(s)))
const firstUseIdx = kept.findIndex((s, i) => i !== fnIdx && /user_has_building_access/.test(codeOf(s)))
if (fnIdx !== -1 && firstUseIdx !== -1 && firstUseIdx < fnIdx) {
  const [fn] = kept.splice(fnIdx, 1)
  kept.splice(firstUseIdx, 0, fn)
}

const header = `-- ---------------------------------------------------------------------------
-- Countrify — schema standalone
--
-- GENERADO por scripts/db/build-schema.mjs. No editar a mano.
-- ---------------------------------------------------------------------------

`
writeFileSync(OUT, header + kept.join('\n\n') + '\n')
report(base)

// --- migraciones ---
const migDir = resolve(root, 'db/migrations')
// Los archivos con punto inicial NO son migraciones: en el repo hermano hay
// .oneshot-wipe-*.sql que borran datos masivamente.
const migrations = readdirSync(migDir).filter((f) => f.endsWith('.sql') && !f.startsWith('.')).sort()
for (const name of migrations) {
  const t = transform(readFileSync(resolve(migDir, name), 'utf8'), { label: name })
  writeFileSync(
    resolve(root, 'db/bootstrap/migrations', name),
    `-- GENERADO por scripts/db/build-schema.mjs desde db/migrations/${name}\n\n` + t.kept.join('\n\n') + '\n',
  )
  if (t.dropped.size) report(t)
}

console.log(`\n${migrations.length} migraciones procesadas -> db/bootstrap/migrations/`)
