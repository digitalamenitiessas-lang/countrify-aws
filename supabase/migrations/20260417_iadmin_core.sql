-- IAdmin core: backoffice administrativo de consorcios
-- Convenciones:
--   * Todas las tablas, helpers y policies del modulo llevan prefijo iadmin_
--   * Reusamos buildings y profiles existentes (no se duplican entidades del producto base)
--   * RLS apoyada en helpers iadmin_user_administration_ids() y iadmin_user_has_capability()

create extension if not exists "pgcrypto";

------------------------------------------------------------
-- 1. Tipos enumerados especificos del modulo
------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_property_kind') then
    create type public.iadmin_property_kind as enum ('consorcio', 'barrio_privado', 'edificio', 'mixto');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_unit_kind') then
    create type public.iadmin_unit_kind as enum ('departamento', 'casa', 'local', 'cochera', 'baulera', 'otro');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_holder_kind') then
    create type public.iadmin_holder_kind as enum ('propietario', 'inquilino', 'apoderado', 'otro');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_period_status') then
    create type public.iadmin_period_status as enum ('open', 'locked', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_expense_status') then
    create type public.iadmin_expense_status as enum ('draft', 'pending_review', 'needs_doc', 'approved', 'rejected', 'imputed');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_ai_extraction_status') then
    create type public.iadmin_ai_extraction_status as enum ('pending', 'suggested', 'validated', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_liquidation_status') then
    create type public.iadmin_liquidation_status as enum ('draft', 'calculated', 'issued', 'closed');
  end if;
end
$$;

------------------------------------------------------------
-- 2. Administracion (entidad raiz del modulo)
------------------------------------------------------------
create table if not exists public.iadmin_administrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iadmin_administrations_active_idx on public.iadmin_administrations (is_active);

------------------------------------------------------------
-- 3. Catalogo de capacidades + roles operativos por administracion
------------------------------------------------------------
create table if not exists public.iadmin_capabilities (
  code text primary key,
  description text not null
);

insert into public.iadmin_capabilities (code, description) values
  ('portfolio.view',          'Ver cartera de consorcios administrados'),
  ('consorcio.view',          'Ver detalle operativo de un consorcio'),
  ('consorcio.edit',          'Editar datos de un consorcio'),
  ('units.manage',            'Gestionar unidades funcionales'),
  ('holders.manage',          'Gestionar titulares e inquilinos'),
  ('providers.manage',        'Gestionar proveedores'),
  ('expenses.view',           'Ver gastos'),
  ('expenses.create',         'Cargar gastos'),
  ('expenses.approve',        'Aprobar / rechazar gastos'),
  ('documents.upload',        'Subir documentos / comprobantes'),
  ('documents.validate',      'Validar extracciones de IA documental'),
  ('liquidations.view',       'Ver liquidaciones'),
  ('liquidations.create',     'Generar corridas de liquidacion'),
  ('liquidations.close',      'Cerrar liquidaciones'),
  ('collections.view',        'Ver cobranzas y deuda'),
  ('communications.send',     'Emitir comunicaciones'),
  ('reports.view',            'Ver reportes operativos'),
  ('reports.sensitive.view',  'Ver reportes financieros sensibles'),
  ('admin.settings.manage',   'Configurar parametros de la administracion')
on conflict (code) do update set description = excluded.description;

-- Granularidad por administracion: un mismo profile puede tener distintos
-- operational_role en distintas administraciones. operational_role es texto
-- libre para no obligar a un enum; los presets viven en TS (lib/iadmin/capabilities.ts)
-- y la materializacion efectiva se hace via iadmin_role_capabilities.
create table if not exists public.iadmin_role_grants (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  operational_role text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (administration_id, profile_id)
);

create index if not exists iadmin_role_grants_profile_idx on public.iadmin_role_grants (profile_id);
create index if not exists iadmin_role_grants_admin_idx on public.iadmin_role_grants (administration_id);

-- Capacidades efectivas por (administration, role). Permite override por administracion
-- sin tener que cambiar el preset global. Se rellena por trigger desde TS si hace falta;
-- en el SQL la dejamos vacia y delegamos al chequeo TS para presets, pero el helper SQL
-- consulta esta tabla cuando hay overrides explicitos.
create table if not exists public.iadmin_role_capabilities (
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  operational_role text not null,
  capability_code text not null references public.iadmin_capabilities(code) on delete cascade,
  granted boolean not null default true,
  primary key (administration_id, operational_role, capability_code)
);

------------------------------------------------------------
-- 4. Cartera de consorcios administrados (envoltorio de buildings)
------------------------------------------------------------
create table if not exists public.iadmin_managed_properties (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete restrict,
  display_name text,                -- override opcional sobre buildings.name
  property_kind public.iadmin_property_kind not null default 'consorcio',
  tax_id text,
  managed_since date,
  management_fee_pct numeric(6,3),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (administration_id, building_id)
);

create index if not exists iadmin_managed_properties_admin_idx on public.iadmin_managed_properties (administration_id);
create index if not exists iadmin_managed_properties_building_idx on public.iadmin_managed_properties (building_id);

------------------------------------------------------------
-- 5. Unidades funcionales y titulares
------------------------------------------------------------
create table if not exists public.iadmin_units (
  id uuid primary key default gen_random_uuid(),
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  code text not null,                       -- ej. "1A", "Lote 23"
  kind public.iadmin_unit_kind not null default 'departamento',
  floor text,
  surface_m2 numeric(10,2),
  prorata_coefficient numeric(10,6),         -- alicuota
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, code)
);

create index if not exists iadmin_units_property_idx on public.iadmin_units (managed_property_id);

create table if not exists public.iadmin_unit_holders (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.iadmin_units(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  tax_id text,
  email text,
  phone text,
  holder_kind public.iadmin_holder_kind not null default 'propietario',
  start_date date,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iadmin_unit_holders_unit_idx on public.iadmin_unit_holders (unit_id);

------------------------------------------------------------
-- 6. Proveedores
------------------------------------------------------------
create table if not exists public.iadmin_providers (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  name text not null,
  tax_id text,
  category text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iadmin_providers_admin_idx on public.iadmin_providers (administration_id);

------------------------------------------------------------
-- 7. Periodos contables
------------------------------------------------------------
create table if not exists public.iadmin_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  period_year integer not null check (period_year between 2000 and 2100),
  period_month integer not null check (period_month between 1 and 12),
  status public.iadmin_period_status not null default 'open',
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, period_year, period_month)
);

create index if not exists iadmin_periods_property_idx on public.iadmin_accounting_periods (managed_property_id);

------------------------------------------------------------
-- 8. Gastos
------------------------------------------------------------
create table if not exists public.iadmin_expenses (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  accounting_period_id uuid references public.iadmin_accounting_periods(id) on delete set null,
  provider_id uuid references public.iadmin_providers(id) on delete set null,
  category text,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  issued_at date,
  due_at date,
  status public.iadmin_expense_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists iadmin_expenses_property_idx on public.iadmin_expenses (managed_property_id);
create index if not exists iadmin_expenses_period_idx on public.iadmin_expenses (accounting_period_id);
create index if not exists iadmin_expenses_status_idx on public.iadmin_expenses (status);

------------------------------------------------------------
-- 9. Documentos del gasto + extraccion IA
------------------------------------------------------------
create table if not exists public.iadmin_expense_documents (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.iadmin_expenses(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists iadmin_expense_documents_expense_idx on public.iadmin_expense_documents (expense_id);

create table if not exists public.iadmin_ai_document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.iadmin_expense_documents(id) on delete cascade,
  status public.iadmin_ai_extraction_status not null default 'pending',
  provider text,                          -- ej. 'manual', 'openai-vision', etc.
  raw_payload jsonb,                      -- respuesta cruda del proveedor
  suggested_fields jsonb,                 -- {provider_id, amount, currency, issued_at, category, description}
  confidence numeric(5,2),
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  validation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id)
);

create index if not exists iadmin_ai_extractions_status_idx on public.iadmin_ai_document_extractions (status);

------------------------------------------------------------
-- 10. Liquidaciones (esqueleto)
------------------------------------------------------------
create table if not exists public.iadmin_liquidation_runs (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  accounting_period_id uuid not null references public.iadmin_accounting_periods(id) on delete cascade,
  status public.iadmin_liquidation_status not null default 'draft',
  total_expenses numeric(14,2) not null default 0,
  total_units integer not null default 0,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, accounting_period_id)
);

create index if not exists iadmin_liquidations_property_idx on public.iadmin_liquidation_runs (managed_property_id);

create table if not exists public.iadmin_liquidation_items (
  id uuid primary key default gen_random_uuid(),
  liquidation_run_id uuid not null references public.iadmin_liquidation_runs(id) on delete cascade,
  unit_id uuid not null references public.iadmin_units(id) on delete restrict,
  prorata_coefficient numeric(10,6) not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists iadmin_liquidation_items_run_idx on public.iadmin_liquidation_items (liquidation_run_id);

------------------------------------------------------------
-- 11. Placeholders estructurales (cobranzas, banco, comunicaciones, auditoria)
------------------------------------------------------------
create table if not exists public.iadmin_payments (
  id uuid primary key default gen_random_uuid(),
  liquidation_item_id uuid references public.iadmin_liquidation_items(id) on delete set null,
  unit_id uuid references public.iadmin_units(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.iadmin_bank_movements (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid references public.iadmin_managed_properties(id) on delete set null,
  movement_date date not null,
  description text,
  amount numeric(14,2) not null,
  balance numeric(14,2),
  external_ref text,
  reconciled_payment_id uuid references public.iadmin_payments(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.iadmin_notifications (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  audience text,
  subject text not null,
  body text,
  status text not null default 'queued',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.iadmin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid references public.iadmin_administrations(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists iadmin_audit_admin_idx on public.iadmin_audit_logs (administration_id);

------------------------------------------------------------
-- 12. Triggers de updated_at (reusa public.set_updated_at del initial)
------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'iadmin_administrations',
    'iadmin_managed_properties',
    'iadmin_units',
    'iadmin_unit_holders',
    'iadmin_providers',
    'iadmin_accounting_periods',
    'iadmin_expenses',
    'iadmin_ai_document_extractions',
    'iadmin_liquidation_runs'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end
$$;

------------------------------------------------------------
-- 13. Helpers SQL para RLS
------------------------------------------------------------
create or replace function public.iadmin_user_administration_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_role() = 'super_admin' then a.id
    else g.administration_id
  end
  from public.iadmin_administrations a
  left join public.iadmin_role_grants g
    on g.administration_id = a.id
   and g.profile_id = auth.uid()
  where public.current_user_role() = 'super_admin' or g.profile_id = auth.uid()
$$;

create or replace function public.iadmin_user_belongs_to(target_admin_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_user_role() = 'super_admin' then true
    else exists (
      select 1 from public.iadmin_role_grants
      where administration_id = target_admin_id
        and profile_id = auth.uid()
    )
  end
$$;

-- Capacidad efectiva: si hay row en iadmin_role_capabilities, gana ese override.
-- Si no hay override explicito, devolvemos true para super_admin y true cuando el
-- usuario tiene alguna grant en la administracion (los presets se aplican en TS,
-- el SQL es permisivo por defecto y la UI/server actions hacen el gating fino).
-- Nota: evitamos `SELECT col INTO var FROM ...` porque el SQL editor de Supabase
-- lo interpreta erroneamente como `SELECT INTO table`. Usamos asignaciones con
-- subqueries que son equivalentes y robustas.
create or replace function public.iadmin_user_has_capability(target_admin_id uuid, target_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_override boolean;
begin
  if public.current_user_role() = 'super_admin' then
    return true;
  end if;

  v_role := (
    select g.operational_role
    from public.iadmin_role_grants g
    where g.administration_id = target_admin_id
      and g.profile_id = auth.uid()
    limit 1
  );

  if v_role is null then
    return false;
  end if;

  v_override := (
    select rc.granted
    from public.iadmin_role_capabilities rc
    where rc.administration_id = target_admin_id
      and rc.operational_role = v_role
      and rc.capability_code = target_capability
    limit 1
  );

  if v_override is not null then
    return v_override;
  end if;

  -- sin override explicito: permitimos por default (los presets aplican en TS).
  return true;
end;
$$;

------------------------------------------------------------
-- 14. Row Level Security
------------------------------------------------------------
alter table public.iadmin_administrations enable row level security;
alter table public.iadmin_capabilities enable row level security;
alter table public.iadmin_role_grants enable row level security;
alter table public.iadmin_role_capabilities enable row level security;
alter table public.iadmin_managed_properties enable row level security;
alter table public.iadmin_units enable row level security;
alter table public.iadmin_unit_holders enable row level security;
alter table public.iadmin_providers enable row level security;
alter table public.iadmin_accounting_periods enable row level security;
alter table public.iadmin_expenses enable row level security;
alter table public.iadmin_expense_documents enable row level security;
alter table public.iadmin_ai_document_extractions enable row level security;
alter table public.iadmin_liquidation_runs enable row level security;
alter table public.iadmin_liquidation_items enable row level security;
alter table public.iadmin_payments enable row level security;
alter table public.iadmin_bank_movements enable row level security;
alter table public.iadmin_notifications enable row level security;
alter table public.iadmin_audit_logs enable row level security;

-- catalogo de capacidades: lectura para autenticados, escritura solo super_admin
drop policy if exists "iadmin_capabilities readable" on public.iadmin_capabilities;
create policy "iadmin_capabilities readable" on public.iadmin_capabilities
  for select to authenticated using (true);

drop policy if exists "iadmin_capabilities super admin write" on public.iadmin_capabilities;
create policy "iadmin_capabilities super admin write" on public.iadmin_capabilities
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- administraciones: visible si pertenece o es super admin
drop policy if exists "iadmin_administrations select" on public.iadmin_administrations;
create policy "iadmin_administrations select" on public.iadmin_administrations
  for select to authenticated
  using (public.iadmin_user_belongs_to(id));

drop policy if exists "iadmin_administrations super admin write" on public.iadmin_administrations;
create policy "iadmin_administrations super admin write" on public.iadmin_administrations
  for all to authenticated
  using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- role grants: visibles para miembros de la administracion; mutaciones solo titular o super
drop policy if exists "iadmin_role_grants select" on public.iadmin_role_grants;
create policy "iadmin_role_grants select" on public.iadmin_role_grants
  for select to authenticated
  using (public.iadmin_user_belongs_to(administration_id));

drop policy if exists "iadmin_role_grants admin write" on public.iadmin_role_grants;
create policy "iadmin_role_grants admin write" on public.iadmin_role_grants
  for all to authenticated
  using (public.iadmin_user_has_capability(administration_id, 'admin.settings.manage'))
  with check (public.iadmin_user_has_capability(administration_id, 'admin.settings.manage'));

drop policy if exists "iadmin_role_capabilities select" on public.iadmin_role_capabilities;
create policy "iadmin_role_capabilities select" on public.iadmin_role_capabilities
  for select to authenticated
  using (public.iadmin_user_belongs_to(administration_id));

drop policy if exists "iadmin_role_capabilities write" on public.iadmin_role_capabilities;
create policy "iadmin_role_capabilities write" on public.iadmin_role_capabilities
  for all to authenticated
  using (public.iadmin_user_has_capability(administration_id, 'admin.settings.manage'))
  with check (public.iadmin_user_has_capability(administration_id, 'admin.settings.manage'));

-- helper macro: crea politicas standard select/all sobre tablas con administration_id directo
do $$
declare
  t record;
  tables_with_admin text[] := array[
    'iadmin_managed_properties',
    'iadmin_providers',
    'iadmin_expenses',
    'iadmin_liquidation_runs',
    'iadmin_bank_movements',
    'iadmin_notifications'
  ];
  table_name text;
begin
  foreach table_name in array tables_with_admin loop
    execute format('drop policy if exists "%1$s select scoped" on public.%1$s', table_name);
    execute format(
      'create policy "%1$s select scoped" on public.%1$s for select to authenticated using (public.iadmin_user_belongs_to(administration_id))',
      table_name
    );

    execute format('drop policy if exists "%1$s write scoped" on public.%1$s', table_name);
    execute format(
      'create policy "%1$s write scoped" on public.%1$s for all to authenticated using (public.iadmin_user_belongs_to(administration_id)) with check (public.iadmin_user_belongs_to(administration_id))',
      table_name
    );
  end loop;
end
$$;

-- tablas indirectas (administracion via join)
drop policy if exists "iadmin_units select" on public.iadmin_units;
create policy "iadmin_units select" on public.iadmin_units
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_units write" on public.iadmin_units;
create policy "iadmin_units write" on public.iadmin_units
  for all to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_unit_holders select" on public.iadmin_unit_holders;
create policy "iadmin_unit_holders select" on public.iadmin_unit_holders
  for select to authenticated
  using (
    exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_unit_holders write" on public.iadmin_unit_holders;
create policy "iadmin_unit_holders write" on public.iadmin_unit_holders
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_accounting_periods select" on public.iadmin_accounting_periods;
create policy "iadmin_accounting_periods select" on public.iadmin_accounting_periods
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_accounting_periods write" on public.iadmin_accounting_periods;
create policy "iadmin_accounting_periods write" on public.iadmin_accounting_periods
  for all to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_expense_documents select" on public.iadmin_expense_documents;
create policy "iadmin_expense_documents select" on public.iadmin_expense_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_expenses e
      where e.id = expense_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  );

drop policy if exists "iadmin_expense_documents write" on public.iadmin_expense_documents;
create policy "iadmin_expense_documents write" on public.iadmin_expense_documents
  for all to authenticated
  using (
    exists (
      select 1 from public.iadmin_expenses e
      where e.id = expense_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  )
  with check (
    exists (
      select 1 from public.iadmin_expenses e
      where e.id = expense_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  );

drop policy if exists "iadmin_ai_extractions select" on public.iadmin_ai_document_extractions;
create policy "iadmin_ai_extractions select" on public.iadmin_ai_document_extractions
  for select to authenticated
  using (
    exists (
      select 1
      from public.iadmin_expense_documents d
      join public.iadmin_expenses e on e.id = d.expense_id
      where d.id = document_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  );

drop policy if exists "iadmin_ai_extractions write" on public.iadmin_ai_document_extractions;
create policy "iadmin_ai_extractions write" on public.iadmin_ai_document_extractions
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_expense_documents d
      join public.iadmin_expenses e on e.id = d.expense_id
      where d.id = document_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_expense_documents d
      join public.iadmin_expenses e on e.id = d.expense_id
      where d.id = document_id and public.iadmin_user_belongs_to(e.administration_id)
    )
  );

drop policy if exists "iadmin_liquidation_items select" on public.iadmin_liquidation_items;
create policy "iadmin_liquidation_items select" on public.iadmin_liquidation_items
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_liquidation_runs r
      where r.id = liquidation_run_id and public.iadmin_user_belongs_to(r.administration_id)
    )
  );

drop policy if exists "iadmin_liquidation_items write" on public.iadmin_liquidation_items;
create policy "iadmin_liquidation_items write" on public.iadmin_liquidation_items
  for all to authenticated
  using (
    exists (
      select 1 from public.iadmin_liquidation_runs r
      where r.id = liquidation_run_id and public.iadmin_user_belongs_to(r.administration_id)
    )
  )
  with check (
    exists (
      select 1 from public.iadmin_liquidation_runs r
      where r.id = liquidation_run_id and public.iadmin_user_belongs_to(r.administration_id)
    )
  );

drop policy if exists "iadmin_payments select" on public.iadmin_payments;
create policy "iadmin_payments select" on public.iadmin_payments
  for select to authenticated
  using (
    unit_id is null
    or exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_payments write" on public.iadmin_payments;
create policy "iadmin_payments write" on public.iadmin_payments
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_units u
      join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
      where u.id = unit_id and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_audit_logs select" on public.iadmin_audit_logs;
create policy "iadmin_audit_logs select" on public.iadmin_audit_logs
  for select to authenticated
  using (
    administration_id is null
      and public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  );

drop policy if exists "iadmin_audit_logs insert" on public.iadmin_audit_logs;
create policy "iadmin_audit_logs insert" on public.iadmin_audit_logs
  for insert to authenticated
  with check (
    administration_id is null and public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  );

------------------------------------------------------------
-- 15. Storage bucket para documentos de gastos
------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('iadmin-expense-documents', 'iadmin-expense-documents', false)
on conflict (id) do nothing;

drop policy if exists "iadmin docs read" on storage.objects;
create policy "iadmin docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'iadmin-expense-documents'
    and exists (
      select 1
      from public.iadmin_administrations a
      where (storage.foldername(name))[1] = a.id::text
        and public.iadmin_user_belongs_to(a.id)
    )
  );

drop policy if exists "iadmin docs write" on storage.objects;
create policy "iadmin docs write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'iadmin-expense-documents'
    and exists (
      select 1
      from public.iadmin_administrations a
      where (storage.foldername(name))[1] = a.id::text
        and public.iadmin_user_belongs_to(a.id)
    )
  );

drop policy if exists "iadmin docs update" on storage.objects;
create policy "iadmin docs update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'iadmin-expense-documents'
    and exists (
      select 1
      from public.iadmin_administrations a
      where (storage.foldername(name))[1] = a.id::text
        and public.iadmin_user_belongs_to(a.id)
    )
  )
  with check (
    bucket_id = 'iadmin-expense-documents'
    and exists (
      select 1
      from public.iadmin_administrations a
      where (storage.foldername(name))[1] = a.id::text
        and public.iadmin_user_belongs_to(a.id)
    )
  );
