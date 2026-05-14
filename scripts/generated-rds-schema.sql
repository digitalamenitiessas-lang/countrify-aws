
create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'create schema auth';
  end if;

  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create schema extensions';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid
$$;


-- Migration: 20260415_initial.sql

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'negocio_admin', 'consorcio_admin', 'vecino');
  end if;
end
$$;

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  total_units integer not null default 0 check (total_units >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'vecino',
  avatar_text text,
  building_id uuid references public.buildings(id) on delete set null,
  business_id uuid,
  floor text,
  unit text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null default '',
  owner_profile_id uuid references public.profiles(id) on delete set null,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_business_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_business_id_fkey
      foreign key (business_id)
      references public.businesses(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  building_id uuid references public.buildings(id) on delete set null,
  title text not null,
  description text not null,
  discount text not null,
  category text not null,
  expiration_date date not null,
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketplace_items (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references public.profiles(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  condition text not null check (condition in ('Nuevo', 'Como Nuevo', 'Buen Estado', 'Usado')),
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_promotions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, promotion_id)
);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  status text not null default 'redeemed',
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at before update on public.businesses for each row execute function public.set_updated_at();

drop trigger if exists set_promotions_updated_at on public.promotions;
create trigger set_promotions_updated_at before update on public.promotions for each row execute function public.set_updated_at();

drop trigger if exists set_marketplace_updated_at on public.marketplace_items;
create trigger set_marketplace_updated_at before update on public.marketplace_items for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_text)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'U'), 2))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_building_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select building_id
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

alter table public.buildings enable row level security;
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.promotions enable row level security;
alter table public.marketplace_items enable row level security;
alter table public.saved_promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

drop policy if exists "Buildings are viewable by authenticated users" on public.buildings;
create policy "Buildings are viewable by authenticated users" on public.buildings
for select to authenticated using (true);

drop policy if exists "Only super admins manage buildings" on public.buildings;
create policy "Only super admins manage buildings" on public.buildings
for all to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

drop policy if exists "Profiles select by role scope" on public.profiles;
create policy "Profiles select by role scope" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and building_id = public.current_user_building_id()
  )
);

drop policy if exists "Profiles self update" on public.profiles;
create policy "Profiles self update" on public.profiles
for update to authenticated
using (id = auth.uid() or public.current_user_role() = 'super_admin')
with check (id = auth.uid() or public.current_user_role() = 'super_admin');

drop policy if exists "Businesses visible publicly" on public.businesses;
create policy "Businesses visible publicly" on public.businesses
for select to anon, authenticated using (true);

drop policy if exists "Businesses write by scoped owners" on public.businesses;
create policy "Businesses write by scoped owners" on public.businesses
for all to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and id = public.current_user_business_id()
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and id = public.current_user_business_id()
  )
);

drop policy if exists "Promotions are publicly visible" on public.promotions;
create policy "Promotions are publicly visible" on public.promotions
for select to anon, authenticated using (is_active = true or auth.uid() is not null);

drop policy if exists "Promotions business scoped write" on public.promotions;
create policy "Promotions business scoped write" on public.promotions
for all to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and business_id = public.current_user_business_id()
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and business_id = public.current_user_business_id()
  )
);

drop policy if exists "Marketplace scoped read" on public.marketplace_items;
create policy "Marketplace scoped read" on public.marketplace_items
for select to authenticated
using (
  public.current_user_role() = 'super_admin'
  or public.current_user_role() = 'negocio_admin'
  or (
    public.current_user_role() in ('vecino', 'consorcio_admin')
    and building_id = public.current_user_building_id()
  )
);

drop policy if exists "Marketplace owner write" on public.marketplace_items;
create policy "Marketplace owner write" on public.marketplace_items
for all to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'vecino'
    and seller_profile_id = auth.uid()
    and building_id = public.current_user_building_id()
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'vecino'
    and seller_profile_id = auth.uid()
    and building_id = public.current_user_building_id()
  )
);

drop policy if exists "Saved promotions own rows" on public.saved_promotions;
create policy "Saved promotions own rows" on public.saved_promotions
for all to authenticated
using (profile_id = auth.uid() or public.current_user_role() = 'super_admin')
with check (profile_id = auth.uid() or public.current_user_role() = 'super_admin');

drop policy if exists "Redemptions own rows" on public.promotion_redemptions;
create policy "Redemptions own rows" on public.promotion_redemptions
for all to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and exists (
      select 1
      from public.promotions p
      where p.id = promotion_id
        and p.business_id = public.current_user_business_id()
    )
  )
)
with check (profile_id = auth.uid() or public.current_user_role() = 'super_admin');












-- Migration: 20260416_building_complaints.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'complaint_status') then
    create type public.complaint_status as enum ('sin_completar', 'en_desarrollo', 'resuelto');
  end if;
end
$$;

create table if not exists public.building_complaints (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  status public.complaint_status not null default 'sin_completar',
  is_anonymous boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists building_complaints_building_idx
  on public.building_complaints (building_id, created_at desc);

create index if not exists building_complaints_author_idx
  on public.building_complaints (author_profile_id);

create or replace function public.get_neighbor_building_complaints(target_building_id uuid)
returns table (
  id uuid,
  building_id uuid,
  title text,
  description text,
  status public.complaint_status,
  is_anonymous boolean,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  author_label text,
  author_unit text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    complaints.id,
    complaints.building_id,
    complaints.title,
    complaints.description,
    complaints.status,
    complaints.is_anonymous,
    complaints.created_at,
    complaints.updated_at,
    complaints.resolved_at,
    case
      when complaints.is_anonymous then 'Vecino anonimo'
      else coalesce(profiles.full_name, 'Vecino')
    end as author_label,
    case
      when complaints.is_anonymous then null
      else nullif(concat_ws(' - ', nullif(profiles.floor, ''), nullif(profiles.unit, '')), '')
    end as author_unit
  from public.building_complaints as complaints
  join public.profiles on profiles.id = complaints.author_profile_id
  where complaints.building_id = target_building_id
    and (
      public.current_user_role() = 'super_admin'
      or (
        public.current_user_role() = 'vecino'
        and target_building_id = public.current_user_building_id()
      )
      or (
        public.current_user_role() = 'consorcio_admin'
        and public.user_has_building_access(target_building_id)
      )
    )
  order by complaints.created_at desc
$$;

create or replace function public.enforce_complaint_status_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_user_role() = 'consorcio_admin' then
    if new.building_id <> old.building_id
      or new.author_profile_id <> old.author_profile_id
      or new.title <> old.title
      or new.description <> old.description
      or new.is_anonymous <> old.is_anonymous
      or new.created_at <> old.created_at
    then
      raise exception 'Consorcio admin solo puede actualizar el estado de la queja.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_building_complaints_updated_at on public.building_complaints;
create trigger set_building_complaints_updated_at
before update on public.building_complaints
for each row execute function public.set_updated_at();

drop trigger if exists enforce_complaint_status_update on public.building_complaints;
create trigger enforce_complaint_status_update
before update on public.building_complaints
for each row execute function public.enforce_complaint_status_update();

alter table public.building_complaints enable row level security;

drop policy if exists "Complaints scoped read" on public.building_complaints;
create policy "Complaints scoped read"
on public.building_complaints for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'vecino'
    and building_id = public.current_user_building_id()
  )
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "Complaints insert by neighbor or super admin" on public.building_complaints;
create policy "Complaints insert by neighbor or super admin"
on public.building_complaints for insert
to authenticated
with check (
  (
    public.current_user_role() = 'vecino'
    and author_profile_id = auth.uid()
    and building_id = public.current_user_building_id()
    and status = 'sin_completar'
  )
  or public.current_user_role() = 'super_admin'
);

drop policy if exists "Complaints update by consorcio or super admin" on public.building_complaints;
create policy "Complaints update by consorcio or super admin"
on public.building_complaints for update
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
);




-- Migration: 20260416_consorcio_multi_building.sql

create table if not exists public.building_admin_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (profile_id, building_id)
);

create index if not exists building_admin_assignments_profile_idx
  on public.building_admin_assignments (profile_id);

create index if not exists building_admin_assignments_building_idx
  on public.building_admin_assignments (building_id);

insert into public.building_admin_assignments (profile_id, building_id, is_primary)
select
  profiles.id,
  profiles.building_id,
  true
from public.profiles
where profiles.role = 'consorcio_admin'
  and profiles.building_id is not null
on conflict (profile_id, building_id) do nothing;

create or replace function public.current_user_primary_building_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select building_id
  from public.building_admin_assignments
  where profile_id = auth.uid()
  order by is_primary desc, created_at asc
  limit 1
$$;

create or replace function public.user_has_building_access(target_building_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_role public.app_role;
begin
  v_current_role := public.current_user_role();

  if v_current_role = 'super_admin' then
    return true;
  end if;

  if v_current_role = 'consorcio_admin' then
    return exists (
      select 1
      from public.building_admin_assignments
      where profile_id = auth.uid()
        and building_id = target_building_id
    );
  end if;

  if v_current_role = 'vecino' then
    return public.current_user_building_id() = target_building_id;
  end if;

  return false;
end;
$$;

alter table public.building_admin_assignments enable row level security;

drop policy if exists "Assignments visible to owner or super admin" on public.building_admin_assignments;
create policy "Assignments visible to owner or super admin"
on public.building_admin_assignments for select
to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_role() = 'super_admin'
);

drop policy if exists "Assignments managed by super admin" on public.building_admin_assignments;
create policy "Assignments managed by super admin"
on public.building_admin_assignments for all
to authenticated
using (public.current_user_role() = 'super_admin')
with check (public.current_user_role() = 'super_admin');

drop policy if exists "Profiles select by role scope" on public.profiles;
create policy "Profiles select by role scope"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and building_id is not null
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "Marketplace scoped read" on public.marketplace_items;
create policy "Marketplace scoped read"
on public.marketplace_items for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or public.current_user_role() = 'negocio_admin'
  or (
    public.current_user_role() in ('vecino', 'consorcio_admin')
    and public.user_has_building_access(building_id)
  )
);




-- Migration: 20260417_complaint_cases.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'complaint_case_status') then
    create type public.complaint_case_status as enum ('nuevo', 'en_revision', 'en_desarrollo', 'en_espera', 'resuelto', 'cerrado');
  end if;

  if not exists (select 1 from pg_type where typname = 'complaint_case_event_type') then
    create type public.complaint_case_event_type as enum ('created', 'status_changed', 'message_posted', 'resolved', 'closed', 'migrated');
  end if;

  if not exists (select 1 from pg_type where typname = 'complaint_case_message_type') then
    create type public.complaint_case_message_type as enum ('comment', 'status_note');
  end if;

  if not exists (select 1 from pg_type where typname = 'complaint_case_actor_role') then
    create type public.complaint_case_actor_role as enum ('vecino', 'consorcio', 'super_admin', 'sistema');
  end if;
end
$$;

create sequence if not exists public.complaint_case_code_seq;

create table if not exists public.complaint_reason_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,
  is_other boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.complaint_cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null unique,
  building_id uuid not null references public.buildings(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  status public.complaint_case_status not null default 'nuevo',
  other_reason_text text,
  resolved_at timestamptz,
  closed_at timestamptz,
  legacy_complaint_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_case_reasons (
  case_id uuid not null references public.complaint_cases(id) on delete cascade,
  reason_id uuid not null references public.complaint_reason_catalog(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (case_id, reason_id)
);

create table if not exists public.complaint_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.complaint_cases(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  message_type public.complaint_case_message_type not null default 'comment',
  created_at timestamptz not null default now()
);

create table if not exists public.complaint_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.complaint_cases(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_label text not null,
  actor_role public.complaint_case_actor_role not null,
  event_type public.complaint_case_event_type not null,
  summary text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists complaint_cases_building_idx on public.complaint_cases (building_id, updated_at desc);
create index if not exists complaint_cases_author_idx on public.complaint_cases (author_profile_id);
create index if not exists complaint_case_messages_case_idx on public.complaint_case_messages (case_id, created_at asc);
create index if not exists complaint_case_events_case_idx on public.complaint_case_events (case_id, created_at asc);

insert into public.complaint_reason_catalog (slug, label, description, is_other)
values
  ('ascensor', 'Ascensor', 'Problemas con funcionamiento, ruidos o demoras.', false),
  ('limpieza', 'Limpieza', 'Estado general, residuos o falta de higiene.', false),
  ('ruidos', 'Ruidos', 'Molestias sonoras o convivencia.', false),
  ('seguridad', 'Seguridad', 'Accesos, cerraduras, control o incidentes.', false),
  ('iluminacion', 'Iluminacion', 'Luces quemadas o zonas oscuras.', false),
  ('mantenimiento', 'Mantenimiento', 'Reparaciones generales o desperfectos.', false),
  ('humedad_filtraciones', 'Humedad / filtraciones', 'Goteras, humedad o filtraciones visibles.', false),
  ('espacios_comunes', 'Espacios comunes', 'SUM, patio, pasillos, hall u otros espacios compartidos.', false),
  ('administracion', 'Administracion', 'Consultas o reclamos administrativos.', false),
  ('otros', 'Otros', 'Motivo libre no cubierto por las categorias principales.', true)
on conflict (slug) do update
set
  label = excluded.label,
  description = excluded.description,
  is_other = excluded.is_other;

create or replace function public.complaint_actor_role_for_profile(target_profile_id uuid)
returns public.complaint_case_actor_role
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when role = 'consorcio_admin' then 'consorcio'::public.complaint_case_actor_role
      when role = 'super_admin' then 'super_admin'::public.complaint_case_actor_role
      else 'vecino'::public.complaint_case_actor_role
    end
  from public.profiles
  where id = target_profile_id
  limit 1
$$;

create or replace function public.complaint_actor_label_for_profile(target_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when role = 'consorcio_admin' then 'Consorcio'
      when role = 'super_admin' then 'Super admin'
      else coalesce(full_name, 'Vecino')
    end
  from public.profiles
  where id = target_profile_id
  limit 1
$$;

create or replace function public.generate_complaint_case_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  seq_value bigint;
begin
  seq_value := nextval('public.complaint_case_code_seq');
  return 'EXP-' || to_char(current_date, 'YYYY') || '-' || lpad(seq_value::text, 6, '0');
end;
$$;

create or replace function public.assign_complaint_case_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.case_code is null or btrim(new.case_code) = '' then
    new.case_code := public.generate_complaint_case_code();
  end if;
  return new;
end;
$$;

create or replace function public.complaint_case_status_label(target_status public.complaint_case_status)
returns text
language sql
immutable
as $$
  select
    case target_status
      when 'nuevo' then 'Nuevo'
      when 'en_revision' then 'En revision'
      when 'en_desarrollo' then 'En desarrollo'
      when 'en_espera' then 'En espera'
      when 'resuelto' then 'Resuelto'
      when 'cerrado' then 'Cerrado'
    end
$$;

create or replace function public.log_complaint_case_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.complaint_case_events (
    case_id,
    actor_profile_id,
    actor_label,
    actor_role,
    event_type,
    summary,
    metadata,
    created_at
  )
  values (
    new.id,
    new.author_profile_id,
    public.complaint_actor_label_for_profile(new.author_profile_id),
    public.complaint_actor_role_for_profile(new.author_profile_id),
    'created',
    'Expediente creado',
    jsonb_build_object('status', new.status),
    new.created_at
  );

  return new;
end;
$$;

create or replace function public.log_complaint_case_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_label text;
  actor_role public.complaint_case_actor_role;
  event_kind public.complaint_case_event_type;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  actor_id := auth.uid();
  actor_label := case when actor_id is null then 'Sistema' else public.complaint_actor_label_for_profile(actor_id) end;
  actor_role := case when actor_id is null then 'sistema'::public.complaint_case_actor_role else public.complaint_actor_role_for_profile(actor_id) end;
  event_kind := case
    when new.status = 'resuelto' then 'resolved'::public.complaint_case_event_type
    when new.status = 'cerrado' then 'closed'::public.complaint_case_event_type
    else 'status_changed'::public.complaint_case_event_type
  end;

  insert into public.complaint_case_events (
    case_id,
    actor_profile_id,
    actor_label,
    actor_role,
    event_type,
    summary,
    metadata
  )
  values (
    new.id,
    actor_id,
    actor_label,
    actor_role,
    event_kind,
    'Estado actualizado a ' || public.complaint_case_status_label(new.status),
    jsonb_build_object('from', old.status, 'to', new.status)
  );

  return new;
end;
$$;

create or replace function public.log_complaint_case_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.complaint_case_events (
    case_id,
    actor_profile_id,
    actor_label,
    actor_role,
    event_type,
    summary,
    metadata,
    created_at
  )
  values (
    new.case_id,
    new.author_profile_id,
    public.complaint_actor_label_for_profile(new.author_profile_id),
    public.complaint_actor_role_for_profile(new.author_profile_id),
    'message_posted',
    'Nuevo comentario en el expediente',
    jsonb_build_object('message_type', new.message_type),
    new.created_at
  );

  update public.complaint_cases
  set updated_at = greatest(updated_at, new.created_at)
  where id = new.case_id;

  return new;
end;
$$;

create or replace function public.enforce_complaint_case_update_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.current_user_role() = 'consorcio_admin' then
    if new.building_id <> old.building_id
      or new.author_profile_id <> old.author_profile_id
      or new.title <> old.title
      or new.description <> old.description
      or coalesce(new.other_reason_text, '') <> coalesce(old.other_reason_text, '')
      or new.created_at <> old.created_at
      or coalesce(new.legacy_complaint_id, '00000000-0000-0000-0000-000000000000'::uuid) <> coalesce(old.legacy_complaint_id, '00000000-0000-0000-0000-000000000000'::uuid)
    then
      raise exception 'Consorcio admin solo puede actualizar el estado del expediente.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_complaint_cases_updated_at on public.complaint_cases;
create trigger set_complaint_cases_updated_at
before update on public.complaint_cases
for each row execute function public.set_updated_at();

drop trigger if exists assign_complaint_case_code on public.complaint_cases;
create trigger assign_complaint_case_code
before insert on public.complaint_cases
for each row execute function public.assign_complaint_case_code();

drop trigger if exists enforce_complaint_case_update_scope on public.complaint_cases;
create trigger enforce_complaint_case_update_scope
before update on public.complaint_cases
for each row execute function public.enforce_complaint_case_update_scope();

drop trigger if exists log_complaint_case_created on public.complaint_cases;
create trigger log_complaint_case_created
after insert on public.complaint_cases
for each row execute function public.log_complaint_case_created();

drop trigger if exists log_complaint_case_status_change on public.complaint_cases;
create trigger log_complaint_case_status_change
after update of status on public.complaint_cases
for each row execute function public.log_complaint_case_status_change();

drop trigger if exists log_complaint_case_message on public.complaint_case_messages;
create trigger log_complaint_case_message
after insert on public.complaint_case_messages
for each row execute function public.log_complaint_case_message();

alter table public.complaint_reason_catalog enable row level security;
alter table public.complaint_cases enable row level security;
alter table public.complaint_case_reasons enable row level security;
alter table public.complaint_case_messages enable row level security;
alter table public.complaint_case_events enable row level security;

drop policy if exists "Complaint reason catalog readable" on public.complaint_reason_catalog;
create policy "Complaint reason catalog readable"
on public.complaint_reason_catalog for select
to authenticated
using (true);

drop policy if exists "Complaint cases select admin only" on public.complaint_cases;
create policy "Complaint cases select admin only"
on public.complaint_cases for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "Complaint cases insert own building" on public.complaint_cases;
create policy "Complaint cases insert own building"
on public.complaint_cases for insert
to authenticated
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'vecino'
    and author_profile_id = auth.uid()
    and building_id = public.current_user_building_id()
  )
);

drop policy if exists "Complaint cases update scoped admin" on public.complaint_cases;
create policy "Complaint cases update scoped admin"
on public.complaint_cases for update
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
)
with check (
  public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "Complaint case reasons select admin only" on public.complaint_case_reasons;
create policy "Complaint case reasons select admin only"
on public.complaint_case_reasons for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.complaint_cases cases
    where cases.id = case_id
      and public.current_user_role() = 'consorcio_admin'
      and public.user_has_building_access(cases.building_id)
  )
);

drop policy if exists "Complaint case messages select admin only" on public.complaint_case_messages;
create policy "Complaint case messages select admin only"
on public.complaint_case_messages for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.complaint_cases cases
    where cases.id = case_id
      and public.current_user_role() = 'consorcio_admin'
      and public.user_has_building_access(cases.building_id)
  )
);

drop policy if exists "Complaint case messages insert scoped users" on public.complaint_case_messages;
create policy "Complaint case messages insert scoped users"
on public.complaint_case_messages for insert
to authenticated
with check (
  author_profile_id = auth.uid()
  and exists (
    select 1
    from public.complaint_cases cases
    where cases.id = case_id
      and cases.status <> 'cerrado'
      and (
        public.current_user_role() = 'super_admin'
        or (
          public.current_user_role() = 'vecino'
          and cases.building_id = public.current_user_building_id()
        )
        or (
          public.current_user_role() = 'consorcio_admin'
          and public.user_has_building_access(cases.building_id)
        )
      )
  )
);

drop policy if exists "Complaint case events select admin only" on public.complaint_case_events;
create policy "Complaint case events select admin only"
on public.complaint_case_events for select
to authenticated
using (
  public.current_user_role() = 'super_admin'
  or exists (
    select 1
    from public.complaint_cases cases
    where cases.id = case_id
      and public.current_user_role() = 'consorcio_admin'
      and public.user_has_building_access(cases.building_id)
  )
);

create or replace function public.get_neighbor_complaint_cases(target_building_id uuid)
returns table (
  id uuid,
  case_code text,
  building_id uuid,
  building_name text,
  title text,
  description text,
  status public.complaint_case_status,
  other_reason_text text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reasons jsonb,
  messages jsonb,
  events jsonb,
  can_reply boolean,
  can_change_status boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cases.id,
    cases.case_code,
    cases.building_id,
    buildings.name as building_name,
    cases.title,
    cases.description,
    cases.status,
    cases.other_reason_text,
    cases.created_at,
    cases.updated_at,
    cases.resolved_at,
    cases.closed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', reasons.id,
          'slug', reasons.slug,
          'label', reasons.label,
          'is_other', reasons.is_other
        )
        order by reasons.label
      )
      from public.complaint_case_reasons case_reasons
      join public.complaint_reason_catalog reasons on reasons.id = case_reasons.reason_id
      where case_reasons.case_id = cases.id
    ), '[]'::jsonb) as reasons,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', messages.id,
          'case_id', messages.case_id,
          'message', messages.message,
          'message_type', messages.message_type,
          'author_label',
            case
              when profiles.role = 'consorcio_admin' then 'Consorcio'
              when profiles.role = 'super_admin' then 'Super admin'
              else 'Vecino del edificio'
            end,
          'author_role',
            case
              when profiles.role = 'consorcio_admin' then 'consorcio'
              when profiles.role = 'super_admin' then 'super_admin'
              else 'vecino'
            end,
          'created_at', messages.created_at
        )
        order by messages.created_at asc
      )
      from public.complaint_case_messages messages
      join public.profiles on profiles.id = messages.author_profile_id
      where messages.case_id = cases.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', events.id,
          'case_id', events.case_id,
          'event_type', events.event_type,
          'actor_label',
            case
              when events.actor_role = 'vecino' then 'Vecino del edificio'
              when events.actor_role = 'consorcio' then 'Consorcio'
              when events.actor_role = 'super_admin' then 'Super admin'
              else events.actor_label
            end,
          'actor_role', events.actor_role,
          'summary', events.summary,
          'metadata', events.metadata,
          'created_at', events.created_at
        )
        order by events.created_at asc
      )
      from public.complaint_case_events events
      where events.case_id = cases.id
    ), '[]'::jsonb) as events,
    cases.status <> 'cerrado' as can_reply,
    false as can_change_status
  from public.complaint_cases cases
  join public.buildings on buildings.id = cases.building_id
  where target_building_id = public.current_user_building_id()
    and public.current_user_role() in ('vecino', 'super_admin')
    and cases.building_id = target_building_id
  order by cases.updated_at desc, cases.created_at desc
$$;

create or replace function public.create_neighbor_complaint_case(
  target_building_id uuid,
  case_title text,
  case_description text,
  reason_ids uuid[],
  other_reason_text_input text default null
)
returns table (
  id uuid,
  case_code text,
  building_id uuid,
  building_name text,
  title text,
  description text,
  status public.complaint_case_status,
  other_reason_text text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reasons jsonb,
  messages jsonb,
  events jsonb,
  can_reply boolean,
  can_change_status boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_case_id uuid;
begin
  if public.current_user_role() not in ('vecino', 'super_admin') then
    raise exception 'Solo los vecinos pueden crear expedientes.';
  end if;

  if public.current_user_role() = 'vecino' and target_building_id <> public.current_user_building_id() then
    raise exception 'No podes crear expedientes para otro edificio.';
  end if;

  if array_length(reason_ids, 1) is null then
    raise exception 'Debes seleccionar al menos un motivo.';
  end if;

  insert into public.complaint_cases (
    building_id,
    author_profile_id,
    title,
    description,
    status,
    other_reason_text
  )
  values (
    target_building_id,
    auth.uid(),
    trim(case_title),
    trim(case_description),
    'nuevo',
    nullif(trim(coalesce(other_reason_text_input, '')), '')
  )
  returning public.complaint_cases.id into new_case_id;

  insert into public.complaint_case_reasons (case_id, reason_id)
  select new_case_id, reason_id
  from unnest(reason_ids) as reason_id
  join public.complaint_reason_catalog reasons on reasons.id = reason_id
  on conflict do nothing;

  return query
  select *
  from public.get_neighbor_complaint_cases(target_building_id) as payload
  where payload.id = new_case_id;
end;
$$;

create or replace function public.post_complaint_case_message(
  target_case_id uuid,
  message_body text,
  message_kind public.complaint_case_message_type default 'comment'
)
returns table (
  id uuid,
  case_id uuid,
  message text,
  message_type public.complaint_case_message_type,
  author_label text,
  author_role public.complaint_case_actor_role,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_building uuid;
  v_current_role public.app_role;
  inserted_id uuid;
  actor_label text;
  actor_role public.complaint_case_actor_role;
begin
  select building_id
  into target_building
  from public.complaint_cases
  where complaint_cases.id = target_case_id
    and status <> 'cerrado'
  limit 1;

  if target_building is null then
    raise exception 'El expediente no existe o esta cerrado.';
  end if;

  v_current_role := public.current_user_role();

  if not (
    v_current_role = 'super_admin'
    or (v_current_role = 'vecino' and target_building = public.current_user_building_id())
    or (v_current_role = 'consorcio_admin' and public.user_has_building_access(target_building))
  ) then
    raise exception 'No tenes acceso para comentar en este expediente.';
  end if;

  insert into public.complaint_case_messages (
    case_id,
    author_profile_id,
    message,
    message_type
  )
  values (
    target_case_id,
    auth.uid(),
    trim(message_body),
    message_kind
  )
  returning complaint_case_messages.id into inserted_id;

  actor_role := public.complaint_actor_role_for_profile(auth.uid());
  actor_label := case
    when v_current_role = 'vecino' then 'Vecino del edificio'
    when actor_role = 'consorcio' then 'Consorcio'
    when actor_role = 'super_admin' then 'Super admin'
    else public.complaint_actor_label_for_profile(auth.uid())
  end;

  return query
  select
    inserted_id,
    target_case_id,
    trim(message_body),
    message_kind,
    actor_label,
    actor_role,
    now();
end;
$$;

create or replace function public.update_complaint_case_status(
  target_case_id uuid,
  next_status public.complaint_case_status
)
returns table (
  case_id uuid,
  status public.complaint_case_status,
  updated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  latest_event_summary text,
  latest_event_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_building uuid;
begin
  select building_id
  into target_building
  from public.complaint_cases
  where complaint_cases.id = target_case_id
  limit 1;

  if target_building is null then
    raise exception 'Expediente no encontrado.';
  end if;

  if not (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'consorcio_admin'
      and public.user_has_building_access(target_building)
    )
  ) then
    raise exception 'No tenes permisos para cambiar el estado.';
  end if;

  update public.complaint_cases
  set
    status = next_status,
    resolved_at = case when next_status = 'resuelto' then coalesce(resolved_at, now()) when next_status <> 'resuelto' then null else resolved_at end,
    closed_at = case when next_status = 'cerrado' then coalesce(closed_at, now()) when next_status <> 'cerrado' then null else closed_at end
  where id = target_case_id;

  return query
  select
    cases.id,
    cases.status,
    cases.updated_at,
    cases.resolved_at,
    cases.closed_at,
    events.summary,
    events.created_at
  from public.complaint_cases cases
  left join lateral (
    select summary, created_at
    from public.complaint_case_events
    where case_id = cases.id
    order by created_at desc
    limit 1
  ) events on true
  where cases.id = target_case_id;
end;
$$;

do $$
declare
  legacy_exists boolean;
  other_reason_id uuid;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'building_complaints'
  ) into legacy_exists;

  if legacy_exists then
    select id into other_reason_id
    from public.complaint_reason_catalog
    where slug = 'otros'
    limit 1;

    insert into public.complaint_cases (
      building_id,
      author_profile_id,
      title,
      description,
      status,
      resolved_at,
      created_at,
      updated_at,
      legacy_complaint_id
    )
    select
      legacy.building_id,
      legacy.author_profile_id,
      legacy.title,
      legacy.description,
      case legacy.status::text
        when 'sin_completar' then 'nuevo'::public.complaint_case_status
        when 'en_desarrollo' then 'en_desarrollo'::public.complaint_case_status
        when 'resuelto' then 'resuelto'::public.complaint_case_status
      end,
      legacy.resolved_at,
      legacy.created_at,
      legacy.updated_at,
      legacy.id
    from public.building_complaints legacy
    where not exists (
      select 1
      from public.complaint_cases existing
      where existing.legacy_complaint_id = legacy.id
    );

    insert into public.complaint_case_reasons (case_id, reason_id)
    select cases.id, other_reason_id
    from public.complaint_cases cases
    where cases.legacy_complaint_id is not null
      and not exists (
        select 1
        from public.complaint_case_reasons existing
        where existing.case_id = cases.id
      );

    insert into public.complaint_case_events (
      case_id,
      actor_profile_id,
      actor_label,
      actor_role,
      event_type,
      summary,
      metadata,
      created_at
    )
    select
      cases.id,
      null,
      'Sistema',
      'sistema'::public.complaint_case_actor_role,
      'migrated'::public.complaint_case_event_type,
      'Migrado desde modulo anterior',
      jsonb_build_object('legacy_complaint_id', cases.legacy_complaint_id),
      cases.created_at
    from public.complaint_cases cases
    where cases.legacy_complaint_id is not null
      and not exists (
        select 1
        from public.complaint_case_events events
        where events.case_id = cases.id
          and events.event_type = 'migrated'
      );
  end if;
end
$$;




-- Migration: 20260417_iadmin_core.sql

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







-- Migration: 20260418_complaint_case_mentions.sql

create table if not exists public.complaint_case_message_mentions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.complaint_case_messages(id) on delete cascade,
  mentioned_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (message_id, mentioned_profile_id)
);

create index if not exists complaint_case_message_mentions_message_idx
  on public.complaint_case_message_mentions (message_id, created_at asc);

alter table public.complaint_case_message_mentions enable row level security;

create or replace function public.complaint_mention_label_for_profile(target_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when role = 'consorcio_admin' then 'Consorcio · ' || coalesce(full_name, 'Consorcio')
      when coalesce(floor, '') <> '' or coalesce(unit, '') <> '' then
        coalesce(full_name, 'Vecino') || ' (' || concat_ws(' - ', nullif(floor, ''), nullif(unit, '')) || ')'
      else coalesce(full_name, 'Vecino')
    end
  from public.profiles
  where id = target_profile_id
  limit 1
$$;

create or replace function public.complaint_case_can_access(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.complaint_cases cases
    where cases.id = target_case_id
      and (
        public.current_user_role() = 'super_admin'
        or (
          public.current_user_role() = 'vecino'
          and cases.building_id = public.current_user_building_id()
        )
        or (
          public.current_user_role() = 'consorcio_admin'
          and public.user_has_building_access(cases.building_id)
        )
      )
  )
$$;

create or replace function public.complaint_case_can_mention_profile(target_case_id uuid, target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with target_case as (
    select building_id
    from public.complaint_cases
    where id = target_case_id
    limit 1
  ),
  target_profile as (
    select id, role, building_id
    from public.profiles
    where id = target_profile_id
    limit 1
  )
  select exists (
    select 1
    from target_case
    join target_profile on true
    where (
      target_profile.role = 'vecino'
      and target_profile.building_id = target_case.building_id
    ) or (
      target_profile.role = 'consorcio_admin'
      and exists (
        select 1
        from public.building_admin_assignments
        where profile_id = target_profile.id
          and building_id = target_case.building_id
      )
    )
  )
$$;

drop policy if exists "Complaint case mentions select scoped users" on public.complaint_case_message_mentions;
create policy "Complaint case mentions select scoped users"
on public.complaint_case_message_mentions for select
to authenticated
using (
  exists (
    select 1
    from public.complaint_case_messages messages
    where messages.id = message_id
      and public.complaint_case_can_access(messages.case_id)
  )
);

drop policy if exists "Complaint case mentions insert scoped users" on public.complaint_case_message_mentions;
create policy "Complaint case mentions insert scoped users"
on public.complaint_case_message_mentions for insert
to authenticated
with check (
  exists (
    select 1
    from public.complaint_case_messages messages
    where messages.id = message_id
      and messages.author_profile_id = auth.uid()
      and public.complaint_case_can_access(messages.case_id)
      and public.complaint_case_can_mention_profile(messages.case_id, mentioned_profile_id)
  )
);

create or replace function public.get_neighbor_complaint_cases(target_building_id uuid)
returns table (
  id uuid,
  case_code text,
  building_id uuid,
  building_name text,
  title text,
  description text,
  status public.complaint_case_status,
  other_reason_text text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reasons jsonb,
  messages jsonb,
  events jsonb,
  can_reply boolean,
  can_change_status boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cases.id,
    cases.case_code,
    cases.building_id,
    buildings.name as building_name,
    cases.title,
    cases.description,
    cases.status,
    cases.other_reason_text,
    cases.created_at,
    cases.updated_at,
    cases.resolved_at,
    cases.closed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', reasons.id,
          'slug', reasons.slug,
          'label', reasons.label,
          'is_other', reasons.is_other
        )
        order by reasons.label
      )
      from public.complaint_case_reasons case_reasons
      join public.complaint_reason_catalog reasons on reasons.id = case_reasons.reason_id
      where case_reasons.case_id = cases.id
    ), '[]'::jsonb) as reasons,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', messages.id,
          'case_id', messages.case_id,
          'message', messages.message,
          'message_type', messages.message_type,
          'author_label',
            case
              when profiles.role = 'consorcio_admin' then 'Consorcio'
              when profiles.role = 'super_admin' then 'Super admin'
              else 'Vecino del edificio'
            end,
          'author_role',
            case
              when profiles.role = 'consorcio_admin' then 'consorcio'
              when profiles.role = 'super_admin' then 'super_admin'
              else 'vecino'
            end,
          'created_at', messages.created_at,
          'mentions',
            coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', mentions.id,
                  'message_id', mentions.message_id,
                  'mentioned_profile_id', mentions.mentioned_profile_id,
                  'label', public.complaint_mention_label_for_profile(mentions.mentioned_profile_id)
                )
                order by mentions.created_at asc
              )
              from public.complaint_case_message_mentions mentions
              where mentions.message_id = messages.id
            ), '[]'::jsonb)
        )
        order by messages.created_at asc
      )
      from public.complaint_case_messages messages
      join public.profiles on profiles.id = messages.author_profile_id
      where messages.case_id = cases.id
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', events.id,
          'case_id', events.case_id,
          'event_type', events.event_type,
          'actor_label',
            case
              when events.actor_role = 'vecino' then 'Vecino del edificio'
              when events.actor_role = 'consorcio' then 'Consorcio'
              when events.actor_role = 'super_admin' then 'Super admin'
              else events.actor_label
            end,
          'actor_role', events.actor_role,
          'summary', events.summary,
          'metadata', events.metadata,
          'created_at', events.created_at
        )
        order by events.created_at asc
      )
      from public.complaint_case_events events
      where events.case_id = cases.id
    ), '[]'::jsonb) as events,
    cases.status <> 'cerrado' as can_reply,
    false as can_change_status
  from public.complaint_cases cases
  join public.buildings on buildings.id = cases.building_id
  where target_building_id = public.current_user_building_id()
    and public.current_user_role() in ('vecino', 'super_admin')
    and cases.building_id = target_building_id
  order by cases.updated_at desc, cases.created_at desc
$$;

create or replace function public.post_complaint_case_message(
  target_case_id uuid,
  message_body text,
  message_kind public.complaint_case_message_type default 'comment',
  mentioned_profile_ids uuid[] default '{}'::uuid[]
)
returns table (
  id uuid,
  case_id uuid,
  message text,
  message_type public.complaint_case_message_type,
  author_label text,
  author_role public.complaint_case_actor_role,
  mentions jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_building uuid;
  v_current_role public.app_role;
  inserted_id uuid;
  actor_label text;
  actor_role public.complaint_case_actor_role;
  valid_mention_ids uuid[];
begin
  select building_id
  into target_building
  from public.complaint_cases
  where complaint_cases.id = target_case_id
    and status <> 'cerrado'
  limit 1;

  if target_building is null then
    raise exception 'El expediente no existe o esta cerrado.';
  end if;

  v_current_role := public.current_user_role();

  if not (
    v_current_role = 'super_admin'
    or (v_current_role = 'vecino' and target_building = public.current_user_building_id())
    or (v_current_role = 'consorcio_admin' and public.user_has_building_access(target_building))
  ) then
    raise exception 'No tenes acceso para comentar en este expediente.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(mentioned_profile_ids, '{}'::uuid[])) as profile_id
    where not public.complaint_case_can_mention_profile(target_case_id, profile_id)
  ) then
    raise exception 'Una o mas menciones no pertenecen al edificio o al consorcio asignado.';
  end if;

  select coalesce(array_agg(distinct profile_id), '{}'::uuid[])
  into valid_mention_ids
  from unnest(coalesce(mentioned_profile_ids, '{}'::uuid[])) as profile_id;

  insert into public.complaint_case_messages (
    case_id,
    author_profile_id,
    message,
    message_type
  )
  values (
    target_case_id,
    auth.uid(),
    trim(message_body),
    message_kind
  )
  returning complaint_case_messages.id into inserted_id;

  insert into public.complaint_case_message_mentions (message_id, mentioned_profile_id)
  select inserted_id, profile_id
  from unnest(valid_mention_ids) as profile_id
  on conflict do nothing;

  actor_role := public.complaint_actor_role_for_profile(auth.uid());
  actor_label := case
    when v_current_role = 'vecino' then 'Vecino del edificio'
    when actor_role = 'consorcio' then 'Consorcio'
    when actor_role = 'super_admin' then 'Super admin'
    else public.complaint_actor_label_for_profile(auth.uid())
  end;

  return query
  select
    inserted_id,
    target_case_id,
    trim(message_body),
    message_kind,
    actor_label,
    actor_role,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mentions.id,
          'message_id', mentions.message_id,
          'mentioned_profile_id', mentions.mentioned_profile_id,
          'label', public.complaint_mention_label_for_profile(mentions.mentioned_profile_id)
        )
        order by mentions.created_at asc
      )
      from public.complaint_case_message_mentions mentions
      where mentions.message_id = inserted_id
    ), '[]'::jsonb),
    now();
end;
$$;




-- Migration: 20260419_iadmin_liquidation_3b.sql

-- IAdmin Fase 3b: paridad de datos con liquidacion real
-- Idempotente. No rompe queries existentes.
-- Cambios:
--   * expense_kind (ordinaria | extraordinaria) en gastos
--   * legal_info JSONB en administraciones y en managed_properties (banco, seguros, horarios, amenities, notas)
--   * en liquidation_runs: due_dates JSONB, previous_balance, ordinary_total, extraordinary_total
--   * en liquidation_items: ordinary_amount, extraordinary_amount, previous_balance
--   * tabla iadmin_unit_groups (agrupa unidades como unidad de cobro, ej. depto+cochera)

-- ----------------------------------------------------------------------------
-- 1. expense_kind
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_expense_kind') then
    create type public.iadmin_expense_kind as enum ('ordinaria', 'extraordinaria');
  end if;
end
$$;

alter table public.iadmin_expenses
  add column if not exists expense_kind public.iadmin_expense_kind not null default 'ordinaria';

create index if not exists iadmin_expenses_kind_idx on public.iadmin_expenses (expense_kind);

-- ----------------------------------------------------------------------------
-- 2. legal_info JSONB en administracion y en managed_property
--    Estructura sugerida (no forzada):
--    {
--      "bank": { "name": "Macro", "cbu": "...", "alias": "...", "account": "..." },
--      "contact": { "phone": "...", "email": "...", "accountant_name": "..." },
--      "insurance": [{ "company": "Galicia", "policy": "...", "coverage": "...", "from": "...", "to": "..." }],
--      "amenities": [{ "name": "Quincho", "price": "..." }],
--      "collection_schedule": "Jueves 10-11hs / Miercoles 15-16hs",
--      "footer_notes": "texto libre"
--    }
-- ----------------------------------------------------------------------------
alter table public.iadmin_administrations
  add column if not exists legal_info jsonb not null default '{}'::jsonb;

alter table public.iadmin_managed_properties
  add column if not exists legal_info jsonb not null default '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- 3. Liquidation runs enriquecidos
-- ----------------------------------------------------------------------------
alter table public.iadmin_liquidation_runs
  add column if not exists due_dates jsonb not null default '[]'::jsonb,
  add column if not exists previous_balance numeric(14,2) not null default 0,
  add column if not exists ordinary_total numeric(14,2) not null default 0,
  add column if not exists extraordinary_total numeric(14,2) not null default 0,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.profiles(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 4. Liquidation items enriquecidos
-- ----------------------------------------------------------------------------
alter table public.iadmin_liquidation_items
  add column if not exists ordinary_amount numeric(14,2) not null default 0,
  add column if not exists extraordinary_amount numeric(14,2) not null default 0,
  add column if not exists previous_balance numeric(14,2) not null default 0;

-- Backfill: si ya hay items con amount pero sin ordinary_amount, los copiamos
update public.iadmin_liquidation_items
set ordinary_amount = amount
where ordinary_amount = 0 and amount > 0;

-- ----------------------------------------------------------------------------
-- 5. iadmin_unit_groups (agrupa unidades como unidad de cobro)
-- ----------------------------------------------------------------------------
create table if not exists public.iadmin_unit_groups (
  id uuid primary key default gen_random_uuid(),
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  display_code text not null,                -- ej. "2A-C13"
  primary_unit_id uuid references public.iadmin_units(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, display_code)
);

create index if not exists iadmin_unit_groups_property_idx
  on public.iadmin_unit_groups (managed_property_id);

create table if not exists public.iadmin_unit_group_members (
  group_id uuid not null references public.iadmin_unit_groups(id) on delete cascade,
  unit_id uuid not null references public.iadmin_units(id) on delete cascade,
  primary key (group_id, unit_id),
  unique (unit_id)                           -- una unit puede estar en a lo sumo 1 group
);

-- Trigger updated_at
do $$
begin
  execute 'drop trigger if exists set_iadmin_unit_groups_updated_at on public.iadmin_unit_groups';
  execute 'create trigger set_iadmin_unit_groups_updated_at before update on public.iadmin_unit_groups for each row execute function public.set_updated_at()';
end
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS para las tablas/campos nuevos
-- ----------------------------------------------------------------------------
alter table public.iadmin_unit_groups enable row level security;
alter table public.iadmin_unit_group_members enable row level security;

drop policy if exists "iadmin_unit_groups select" on public.iadmin_unit_groups;
create policy "iadmin_unit_groups select" on public.iadmin_unit_groups
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_unit_groups write" on public.iadmin_unit_groups;
create policy "iadmin_unit_groups write" on public.iadmin_unit_groups
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

drop policy if exists "iadmin_unit_group_members select" on public.iadmin_unit_group_members;
create policy "iadmin_unit_group_members select" on public.iadmin_unit_group_members
  for select to authenticated
  using (
    exists (
      select 1
      from public.iadmin_unit_groups g
      join public.iadmin_managed_properties mp on mp.id = g.managed_property_id
      where g.id = group_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_unit_group_members write" on public.iadmin_unit_group_members;
create policy "iadmin_unit_group_members write" on public.iadmin_unit_group_members
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_unit_groups g
      join public.iadmin_managed_properties mp on mp.id = g.managed_property_id
      where g.id = group_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_unit_groups g
      join public.iadmin_managed_properties mp on mp.id = g.managed_property_id
      where g.id = group_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Capacidades nuevas (groups y legal)
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('unit_groups.manage',    'Agrupar unidades como unidad de cobro'),
  ('consorcio.legal.edit',  'Editar datos legales del consorcio'),
  ('admin.legal.edit',      'Editar datos legales de la administracion')
on conflict (code) do update set description = excluded.description;




-- Migration: 20260420_iadmin_cash_accounts.sql

-- IAdmin Fase 3e: cuentas bancarias / caja por consorcio + pagos a proveedores
-- Idempotente. No rompe datos existentes.

-- ----------------------------------------------------------------------------
-- 1. iadmin_cash_accounts: una cuenta por consorcio (banco, caja chica, reserva)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_cash_account_kind') then
    create type public.iadmin_cash_account_kind as enum ('bank', 'cash', 'reserve', 'other');
  end if;
end
$$;

create table if not exists public.iadmin_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  name text not null,
  kind public.iadmin_cash_account_kind not null default 'bank',
  bank_name text,
  account_number text,
  cbu text,
  alias text,
  opening_balance numeric(14,2) not null default 0,
  opening_balance_at date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, name)
);

create index if not exists iadmin_cash_accounts_property_idx
  on public.iadmin_cash_accounts (managed_property_id);
create index if not exists iadmin_cash_accounts_active_idx
  on public.iadmin_cash_accounts (is_active) where is_active = true;

-- Trigger updated_at
do $$
begin
  execute 'drop trigger if exists set_iadmin_cash_accounts_updated_at on public.iadmin_cash_accounts';
  execute 'create trigger set_iadmin_cash_accounts_updated_at before update on public.iadmin_cash_accounts for each row execute function public.set_updated_at()';
end
$$;

-- ----------------------------------------------------------------------------
-- 2. iadmin_bank_movements: ya existe, ampliamos con cash_account_id + expense_id
-- ----------------------------------------------------------------------------
alter table public.iadmin_bank_movements
  add column if not exists cash_account_id uuid references public.iadmin_cash_accounts(id) on delete set null,
  add column if not exists expense_id uuid references public.iadmin_expenses(id) on delete set null,
  add column if not exists movement_kind text not null default 'manual',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Constraint: movement_kind valido
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'iadmin_bank_movements_kind_check'
  ) then
    alter table public.iadmin_bank_movements
      add constraint iadmin_bank_movements_kind_check
      check (movement_kind in ('manual', 'expense_payment', 'collection', 'transfer', 'adjustment', 'opening'));
  end if;
end
$$;

create index if not exists iadmin_bank_movements_cash_account_idx
  on public.iadmin_bank_movements (cash_account_id);
create index if not exists iadmin_bank_movements_expense_idx
  on public.iadmin_bank_movements (expense_id);
create index if not exists iadmin_bank_movements_date_idx
  on public.iadmin_bank_movements (movement_date desc);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.iadmin_cash_accounts enable row level security;

drop policy if exists "iadmin_cash_accounts select" on public.iadmin_cash_accounts;
create policy "iadmin_cash_accounts select" on public.iadmin_cash_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_cash_accounts write" on public.iadmin_cash_accounts;
create policy "iadmin_cash_accounts write" on public.iadmin_cash_accounts
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

-- ----------------------------------------------------------------------------
-- 4. Capacidades
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('cash_accounts.manage', 'Gestionar cuentas bancarias y caja'),
  ('cash_accounts.view',   'Ver cuentas bancarias y movimientos'),
  ('expenses.mark_paid',   'Marcar gasto como pagado al proveedor')
on conflict (code) do update set description = excluded.description;




-- Migration: 20260420_locations.sql

-- Add location fields to businesses
ALTER TABLE IF EXISTS public.businesses
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;

-- Add location fields to buildings
-- Note: 'address' already exists in buildings, so we only need latitude and longitude
ALTER TABLE IF EXISTS public.buildings
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric;




-- Migration: 20260420_promotion_qr_monthly.sql

alter table public.promotions
  add column if not exists published_month date,
  add column if not exists source_promotion_id uuid references public.promotions(id) on delete set null;

update public.promotions
set published_month = date_trunc('month', coalesce(created_at, now()))::date
where published_month is null;

alter table public.promotions
  alter column published_month set default date_trunc('month', now())::date;

alter table public.promotions
  alter column published_month set not null;

create index if not exists promotions_business_month_idx on public.promotions (business_id, published_month desc);
create index if not exists promotions_source_idx on public.promotions (source_promotion_id);

delete from public.promotion_redemptions pr
where exists (
  select 1
  from public.promotion_redemptions newer
  where newer.profile_id = pr.profile_id
    and newer.promotion_id = pr.promotion_id
    and (
      newer.redeemed_at > pr.redeemed_at
      or (newer.redeemed_at = pr.redeemed_at and newer.created_at > pr.created_at)
      or (newer.redeemed_at = pr.redeemed_at and newer.created_at = pr.created_at and newer.id > pr.id)
    )
);

create unique index if not exists promotion_redemptions_profile_promotion_uidx
  on public.promotion_redemptions (profile_id, promotion_id);

create table if not exists public.promotion_redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'redeemed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemption_tokens_lookup_idx
  on public.promotion_redemption_tokens (promotion_id, profile_id, status, expires_at desc);

create unique index if not exists promotion_redemption_tokens_pending_uidx
  on public.promotion_redemption_tokens (promotion_id, profile_id)
  where status = 'pending';

alter table public.promotion_redemption_tokens enable row level security;

drop policy if exists "Promotion redemption tokens scoped read" on public.promotion_redemption_tokens;
create policy "Promotion redemption tokens scoped read" on public.promotion_redemption_tokens
for select to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and exists (
      select 1
      from public.promotions p
      where p.id = public.promotion_redemption_tokens.promotion_id
        and p.business_id = public.current_user_business_id()
    )
  )
);

create or replace function public.generate_promotion_redemption_token()
returns text
language plpgsql
as $generate_token$
begin
  return upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
end;
$generate_token$;

create or replace function public.create_promotion_redemption_token(target_promotion_id uuid)
returns table (
  id uuid,
  token text,
  qr_value text,
  expires_at timestamptz,
  promotion_id uuid,
  promotion_title text,
  business_name text
)
language plpgsql
security definer
set search_path = public
as $create_redemption_token$
declare
  current_profile public.profiles%rowtype;
  promotion_row public.promotions%rowtype;
  business_row public.businesses%rowtype;
  existing_token public.promotion_redemption_tokens%rowtype;
  created_token public.promotion_redemption_tokens%rowtype;
begin
  select *
  into current_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if current_profile.id is null then
    raise exception 'No se encontro el perfil autenticado.';
  end if;

  if current_profile.role not in ('vecino', 'super_admin') then
    raise exception 'Solo vecinos pueden solicitar cupones QR.';
  end if;

  select *
  into promotion_row
  from public.promotions p
  where p.id = target_promotion_id
  limit 1;

  if promotion_row.id is null then
    raise exception 'La promocion no existe.';
  end if;

  if not promotion_row.is_active or promotion_row.expiration_date < current_date then
    raise exception 'La promocion ya no esta disponible.';
  end if;

  if promotion_row.building_id is not null and promotion_row.building_id <> current_profile.building_id and current_profile.role <> 'super_admin' then
    raise exception 'La promocion no esta disponible para tu edificio.';
  end if;

  if exists (
    select 1
    from public.promotion_redemptions
    where profile_id = current_profile.id
      and promotion_id = promotion_row.id
  ) then
    raise exception 'Esta promocion ya fue usada por este vecino.';
  end if;

  update public.promotion_redemption_tokens
  set status = 'expired'
  where profile_id = current_profile.id
    and promotion_id = promotion_row.id
    and status = 'pending'
    and expires_at <= now();

  select *
  into existing_token
  from public.promotion_redemption_tokens
  where profile_id = current_profile.id
    and promotion_id = promotion_row.id
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  select *
  into business_row
  from public.businesses b
  where b.id = promotion_row.business_id
  limit 1;

  if existing_token.id is null then
    insert into public.promotion_redemption_tokens (
      promotion_id,
      profile_id,
      token,
      expires_at
    )
    values (
      promotion_row.id,
      current_profile.id,
      public.generate_promotion_redemption_token(),
      now() + interval '15 minutes'
    )
    returning *
    into created_token;
  else
    created_token := existing_token;
  end if;

  return query
  select
    created_token.id,
    created_token.token,
    'CITIFY:' || created_token.token,
    created_token.expires_at,
    promotion_row.id,
    promotion_row.title,
    coalesce(business_row.name, 'Comercio');
end;
$create_redemption_token$;

create or replace function public.validate_promotion_redemption_token(raw_token text)
returns table (
  status text,
  message text,
  token_id uuid,
  promotion_id uuid,
  promotion_title text,
  neighbor_name text,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $validate_redemption_token$
declare
  v_normalized_token text;
  v_current_profile_id uuid;
  v_current_profile_role public.app_role;
  v_current_profile_business_id uuid;
  v_token_id uuid;
  v_token_profile_id uuid;
  v_token_promotion_id uuid;
  v_token_status text;
  v_token_expires_at timestamptz;
  v_token_redeemed_at timestamptz;
  v_promotion_business_id uuid;
  v_promotion_title text;
  v_promotion_is_active boolean;
  v_promotion_expiration_date date;
  v_neighbor_full_name text;
  v_inserted_redemption_id uuid;
begin
  v_normalized_token := upper(trim(coalesce(raw_token, '')));
  if v_normalized_token like 'CITIFY:%' then
    v_normalized_token := substring(v_normalized_token from 8);
  end if;

  select p.id, p.role, p.business_id
  into v_current_profile_id, v_current_profile_role, v_current_profile_business_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_current_profile_id is null then
    return query select 'forbidden', 'No se encontro el perfil autenticado.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_current_profile_role not in ('negocio_admin', 'super_admin') then
    return query select 'forbidden', 'Solo el negocio puede validar canjes.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select
    t.id,
    t.profile_id,
    t.promotion_id,
    t.status,
    t.expires_at,
    t.redeemed_at
  into
    v_token_id,
    v_token_profile_id,
    v_token_promotion_id,
    v_token_status,
    v_token_expires_at,
    v_token_redeemed_at
  from public.promotion_redemption_tokens t
  where t.token = v_normalized_token
  limit 1;

  if v_token_id is null then
    return query select 'not_found', 'No encontramos ese codigo.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select p.business_id, p.title, p.is_active, p.expiration_date
  into v_promotion_business_id, v_promotion_title, v_promotion_is_active, v_promotion_expiration_date
  from public.promotions p
  where p.id = v_token_promotion_id
  limit 1;

  select p.full_name
  into v_neighbor_full_name
  from public.profiles p
  where p.id = v_token_profile_id
  limit 1;

  if v_current_profile_role = 'negocio_admin' and v_promotion_business_id <> v_current_profile_business_id then
    return query
    select
      'forbidden',
      'Ese codigo pertenece a otro negocio.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      v_token_redeemed_at;
    return;
  end if;

  if exists (
    select 1
    from public.promotion_redemptions pr
    where pr.profile_id = v_token_profile_id
      and pr.promotion_id = v_token_promotion_id
  ) or v_token_status = 'redeemed' then
    update public.promotion_redemption_tokens t
    set status = 'redeemed',
        redeemed_at = coalesce(t.redeemed_at, now()),
        redeemed_by_business_id = coalesce(t.redeemed_by_business_id, v_promotion_business_id)
    where t.id = v_token_id;

    return query
    select
      'already_used',
      'Esta promocion ya habia sido canjeada por este vecino.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      coalesce(v_token_redeemed_at, now());
    return;
  end if;

  if v_token_status <> 'pending' or v_token_expires_at <= now() then
    update public.promotion_redemption_tokens t
    set status = 'expired'
    where t.id = v_token_id
      and t.status = 'pending';

    return query
    select
      'expired',
      'El codigo expiro. Pidele al vecino que vuelva a abrir el QR.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      null::timestamptz;
    return;
  end if;

  if not v_promotion_is_active or v_promotion_expiration_date < current_date then
    return query
    select
      'promotion_unavailable',
      'La promocion ya no esta disponible para canje.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      null::timestamptz;
    return;
  end if;

  insert into public.promotion_redemptions (
    profile_id,
    promotion_id,
    status,
    redeemed_at,
    created_at
  )
  values (
    v_token_profile_id,
    v_token_promotion_id,
    'redeemed',
    now(),
    now()
  )
  on conflict (profile_id, promotion_id) do nothing
  returning id
  into v_inserted_redemption_id;

  if v_inserted_redemption_id is null then
    update public.promotion_redemption_tokens t
    set status = 'redeemed',
        redeemed_at = coalesce(t.redeemed_at, now()),
        redeemed_by_business_id = coalesce(t.redeemed_by_business_id, v_promotion_business_id)
    where t.id = v_token_id;

    return query
    select
      'already_used',
      'Esta promocion ya habia sido canjeada por este vecino.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      coalesce(v_token_redeemed_at, now());
    return;
  end if;

  update public.promotion_redemption_tokens t
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_by_business_id = v_promotion_business_id
  where t.id = v_token_id;

  return query
  select
    'redeemed',
    'Canje validado correctamente.',
    v_token_id,
    v_token_promotion_id,
    v_promotion_title,
    coalesce(v_neighbor_full_name, 'Vecino'),
    now();
end;
$validate_redemption_token$;

grant execute on function public.create_promotion_redemption_token(uuid) to authenticated;
grant execute on function public.validate_promotion_redemption_token(text) to authenticated;




-- Migration: 20260421_iadmin_collections.sql

-- IAdmin Fase 4: cobranzas reales con N° de recibo secuencial
-- Idempotente. Aditiva. No rompe datos existentes.

-- ----------------------------------------------------------------------------
-- 1. Numeracion de recibos por administracion
-- ----------------------------------------------------------------------------
alter table public.iadmin_administrations
  add column if not exists receipt_prefix text not null default '01',
  add column if not exists receipt_next_number integer not null default 1;

-- Funcion atomica que devuelve el proximo N° y lo incrementa.
-- Usa language sql para evitar el parser de plpgsql con SELECT INTO.
create or replace function public.iadmin_next_receipt_number(admin_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  update public.iadmin_administrations
    set receipt_next_number = receipt_next_number + 1
    where id = admin_id
    returning coalesce(receipt_prefix, '01') || '-' || lpad((receipt_next_number - 1)::text, 4, '0');
$$;

-- ----------------------------------------------------------------------------
-- 2. Ampliacion de iadmin_payments
-- ----------------------------------------------------------------------------
alter table public.iadmin_payments
  add column if not exists administration_id uuid references public.iadmin_administrations(id) on delete cascade,
  add column if not exists managed_property_id uuid references public.iadmin_managed_properties(id) on delete cascade,
  add column if not exists cash_account_id uuid references public.iadmin_cash_accounts(id) on delete set null,
  add column if not exists bank_movement_id uuid references public.iadmin_bank_movements(id) on delete set null,
  add column if not exists liquidation_run_id uuid references public.iadmin_liquidation_runs(id) on delete set null,
  add column if not exists receipt_number text,
  add column if not exists due_label text,
  add column if not exists surcharge_amount numeric(14,2) not null default 0,
  add column if not exists notes text,
  add column if not exists is_void boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Unique receipt_number por administracion cuando no es void
create unique index if not exists iadmin_payments_receipt_unique
  on public.iadmin_payments (administration_id, receipt_number)
  where receipt_number is not null and is_void = false;

create index if not exists iadmin_payments_item_idx
  on public.iadmin_payments (liquidation_item_id)
  where is_void = false;
create index if not exists iadmin_payments_unit_idx
  on public.iadmin_payments (unit_id, paid_at desc);
create index if not exists iadmin_payments_admin_idx
  on public.iadmin_payments (administration_id, paid_at desc);

-- ----------------------------------------------------------------------------
-- 3. RLS sobre iadmin_payments (si no existia ya)
-- ----------------------------------------------------------------------------
alter table public.iadmin_payments enable row level security;

drop policy if exists "iadmin_payments select" on public.iadmin_payments;
create policy "iadmin_payments select" on public.iadmin_payments
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  );

drop policy if exists "iadmin_payments write" on public.iadmin_payments;
create policy "iadmin_payments write" on public.iadmin_payments
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Capacidades nuevas
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('collections.register', 'Registrar pagos de vecinos'),
  ('collections.void',     'Anular pagos')
on conflict (code) do update set description = excluded.description;




-- Migration: 20260422_iadmin_simplifications.sql

-- IAdmin simplificaciones: cuentas default + proveedor con categoria memorizada
-- Idempotente. Aditiva.

-- ----------------------------------------------------------------------------
-- 1. Proveedor memoriza categoria por defecto
-- ----------------------------------------------------------------------------
alter table public.iadmin_providers
  add column if not exists default_category text,
  add column if not exists default_description text;

-- ----------------------------------------------------------------------------
-- 2. Trigger: al crear un managed_property, crear 2 cuentas default
-- ----------------------------------------------------------------------------
create or replace function public.iadmin_create_default_cash_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
  values
    (new.id, 'Caja operativa', 'cash',  true, 'Cuenta creada automaticamente al dar de alta el consorcio.'),
    (new.id, 'Banco principal', 'bank', true, 'Cuenta creada automaticamente. Completa los datos bancarios desde Cuentas.')
  on conflict (managed_property_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists iadmin_mp_default_accounts on public.iadmin_managed_properties;
create trigger iadmin_mp_default_accounts
  after insert on public.iadmin_managed_properties
  for each row execute function public.iadmin_create_default_cash_accounts();

-- ----------------------------------------------------------------------------
-- 3. Back-fill: si hay managed_properties sin cuentas, crearselas
-- ----------------------------------------------------------------------------
insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
select mp.id, 'Caja operativa', 'cash', true, 'Cuenta creada automaticamente.'
from public.iadmin_managed_properties mp
where not exists (
  select 1 from public.iadmin_cash_accounts ca
  where ca.managed_property_id = mp.id and ca.name = 'Caja operativa'
)
on conflict (managed_property_id, name) do nothing;

insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
select mp.id, 'Banco principal', 'bank', true, 'Cuenta creada automaticamente.'
from public.iadmin_managed_properties mp
where not exists (
  select 1 from public.iadmin_cash_accounts ca
  where ca.managed_property_id = mp.id and ca.name = 'Banco principal'
)
on conflict (managed_property_id, name) do nothing;




-- Migration: 20260423_iadmin_share_tokens.sql

-- IAdmin Fase 4b: tokens públicos para compartir liquidación con el vecino
-- Idempotente. Aditiva.

create extension if not exists "pgcrypto";

create table if not exists public.iadmin_item_share_tokens (
  id uuid primary key default gen_random_uuid(),
  liquidation_item_id uuid not null references public.iadmin_liquidation_items(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  access_count integer not null default 0,
  last_accessed_at timestamptz
);

create index if not exists iadmin_item_share_tokens_item_idx
  on public.iadmin_item_share_tokens (liquidation_item_id) where revoked_at is null;

-- RLS
alter table public.iadmin_item_share_tokens enable row level security;

drop policy if exists "iadmin_share_tokens select" on public.iadmin_item_share_tokens;
create policy "iadmin_share_tokens select" on public.iadmin_item_share_tokens
  for select to authenticated
  using (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  );

drop policy if exists "iadmin_share_tokens write" on public.iadmin_item_share_tokens;
create policy "iadmin_share_tokens write" on public.iadmin_item_share_tokens
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  );

-- Capacidad nueva
insert into public.iadmin_capabilities (code, description) values
  ('liquidations.share', 'Compartir la liquidacion con el vecino (link publico)')
on conflict (code) do update set description = excluded.description;




-- Migration: 20260424_iadmin_recurring_reminders.sql

-- IAdmin: facturas recurrentes + recordatorios automaticos
-- Idempotente. Aditiva.

-- ----------------------------------------------------------------------------
-- 1. Facturas recurrentes: flag + monto tipico en iadmin_providers
-- ----------------------------------------------------------------------------
alter table public.iadmin_providers
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_amount numeric(14,2),
  add column if not exists recurring_kind public.iadmin_expense_kind not null default 'ordinaria';

create index if not exists iadmin_providers_recurring_idx
  on public.iadmin_providers (administration_id) where is_recurring = true;

-- ----------------------------------------------------------------------------
-- 2. Recordatorios
-- ----------------------------------------------------------------------------
create table if not exists public.iadmin_reminders (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid references public.iadmin_managed_properties(id) on delete cascade,
  liquidation_item_id uuid not null references public.iadmin_liquidation_items(id) on delete cascade,
  reminder_kind text not null check (reminder_kind in ('pre_due', 'overdue_first', 'overdue_second', 'overdue_heavy')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  message_body text,
  amount_due numeric(14,2),
  due_label text,
  due_date date,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  notes text
);

-- Evitar duplicar el mismo recordatorio el mismo dia para el mismo item
create unique index if not exists iadmin_reminders_daily_unique
  on public.iadmin_reminders (liquidation_item_id, reminder_kind, (date(generated_at)));

create index if not exists iadmin_reminders_admin_status_idx
  on public.iadmin_reminders (administration_id, status);
create index if not exists iadmin_reminders_property_status_idx
  on public.iadmin_reminders (managed_property_id, status);

alter table public.iadmin_reminders enable row level security;

drop policy if exists "iadmin_reminders select" on public.iadmin_reminders;
create policy "iadmin_reminders select" on public.iadmin_reminders
  for select to authenticated
  using (public.iadmin_user_belongs_to(administration_id));

drop policy if exists "iadmin_reminders write" on public.iadmin_reminders;
create policy "iadmin_reminders write" on public.iadmin_reminders
  for all to authenticated
  using (public.iadmin_user_belongs_to(administration_id))
  with check (public.iadmin_user_belongs_to(administration_id));

-- ----------------------------------------------------------------------------
-- 3. Capacidades nuevas
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('expenses.recurring.manage', 'Marcar proveedores como recurrentes y clonar gastos'),
  ('reminders.generate',        'Generar recordatorios automaticos'),
  ('reminders.send',            'Marcar recordatorios como enviados')
on conflict (code) do update set description = excluded.description;




-- Migration: 20260425_units_roles_building_info.sql

-- Base operativa: propietarios, membresias por unidad e informacion general del edificio.

alter type public.app_role add value if not exists 'propietario';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'unit_profile_relationship') then
    create type public.unit_profile_relationship as enum ('propietario', 'vecino_principal', 'vecino_adicional');
  end if;
end
$$;

create table if not exists public.unit_profile_memberships (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.iadmin_units(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  relationship_type public.unit_profile_relationship not null,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists unit_profile_memberships_unit_idx
  on public.unit_profile_memberships (unit_id);
create index if not exists unit_profile_memberships_building_idx
  on public.unit_profile_memberships (building_id);
create index if not exists unit_profile_memberships_profile_idx
  on public.unit_profile_memberships (profile_id);

create unique index if not exists unit_profile_memberships_active_profile_unit_rel_uidx
  on public.unit_profile_memberships (unit_id, profile_id, relationship_type)
  where active;

create unique index if not exists unit_profile_memberships_principal_neighbor_uidx
  on public.unit_profile_memberships (unit_id)
  where active and relationship_type = 'vecino_principal';

create unique index if not exists unit_profile_memberships_primary_owner_uidx
  on public.unit_profile_memberships (unit_id)
  where active and relationship_type = 'propietario' and is_primary;

create table if not exists public.building_information (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  content text not null,
  visible_to text not null default 'residentes' check (visible_to in ('residentes', 'vecinos', 'propietarios')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists building_information_building_idx
  on public.building_information (building_id, is_active, sort_order);

drop trigger if exists set_unit_profile_memberships_updated_at on public.unit_profile_memberships;
create trigger set_unit_profile_memberships_updated_at
before update on public.unit_profile_memberships
for each row execute function public.set_updated_at();

drop trigger if exists set_building_information_updated_at on public.building_information;
create trigger set_building_information_updated_at
before update on public.building_information
for each row execute function public.set_updated_at();

create or replace function public.iadmin_unit_building_id(target_unit_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select mp.building_id
  from public.iadmin_units u
  join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
  where u.id = target_unit_id
  limit 1
$$;

create or replace function public.current_user_building_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.building_id from public.profiles p where p.id = auth.uid() limit 1),
    (
      select m.building_id
      from public.unit_profile_memberships m
      where m.profile_id = auth.uid()
        and m.active
      order by
        case m.relationship_type
          when 'vecino_principal' then 1
          when 'vecino_adicional' then 2
          when 'propietario' then 3
          else 4
        end,
        m.created_at asc
      limit 1
    )
  )
$$;

create or replace function public.current_user_has_unit_membership(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = target_unit_id
      and m.profile_id = auth.uid()
      and m.active
  )
$$;

create or replace function public.current_user_has_building_membership(target_building_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_profile_memberships m
    where m.building_id = target_building_id
      and m.profile_id = auth.uid()
      and m.active
  )
$$;

create or replace function public.current_user_is_principal_neighbor(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = target_unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'vecino_principal'
      and m.active
  )
$$;

create or replace function public.current_user_owns_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = target_unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'propietario'
      and m.active
  )
$$;

create or replace function public.current_user_owns_liquidation_run(target_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.iadmin_liquidation_items li
    join public.unit_profile_memberships m on m.unit_id = li.unit_id
    where li.liquidation_run_id = target_run_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'propietario'
      and m.active
  )
$$;

create or replace function public.unit_additional_neighbors_count(target_unit_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.unit_profile_memberships m
  where m.unit_id = target_unit_id
    and m.relationship_type = 'vecino_adicional'
    and m.active
$$;

create or replace function public.user_has_building_access(target_building_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_role text;
begin
  v_current_role := public.current_user_role()::text;

  if v_current_role = 'super_admin' then
    return true;
  end if;

  if v_current_role = 'consorcio_admin' then
    return exists (
      select 1
      from public.building_admin_assignments
      where profile_id = auth.uid()
        and building_id = target_building_id
    )
    or exists (
      select 1
      from public.iadmin_managed_properties mp
      where mp.building_id = target_building_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    );
  end if;

  if v_current_role in ('vecino', 'propietario') then
    return public.current_user_building_id() = target_building_id
      or public.current_user_has_building_membership(target_building_id);
  end if;

  return false;
end;
$$;

create or replace function public.can_manage_unit_membership(target_unit_id uuid, target_relationship public.unit_profile_relationship)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_building_id uuid;
begin
  v_role := public.current_user_role()::text;
  v_building_id := public.iadmin_unit_building_id(target_unit_id);

  if v_role = 'super_admin' then
    return true;
  end if;

  if v_role = 'consorcio_admin' then
    return public.user_has_building_access(v_building_id);
  end if;

  if v_role = 'vecino'
    and target_relationship = 'vecino_adicional'
    and public.current_user_is_principal_neighbor(target_unit_id)
    and public.unit_additional_neighbors_count(target_unit_id) < 4
  then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.validate_unit_profile_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_building uuid;
  v_profile_role text;
  v_profile_building_id uuid;
begin
  v_expected_building := public.iadmin_unit_building_id(new.unit_id);
  if v_expected_building is null then
    raise exception 'La unidad no existe o no esta vinculada a un edificio.';
  end if;

  if new.building_id <> v_expected_building then
    raise exception 'La unidad no pertenece al edificio indicado.';
  end if;

  select p.role::text, p.building_id
  into v_profile_role, v_profile_building_id
  from public.profiles p
  where p.id = new.profile_id;

  if v_profile_role is null then
    raise exception 'El perfil indicado no existe.';
  end if;

  if new.relationship_type = 'propietario' and v_profile_role <> 'propietario' then
    raise exception 'Una membresia de propietario requiere un perfil propietario.';
  end if;

  if new.relationship_type in ('vecino_principal', 'vecino_adicional') and v_profile_role <> 'vecino' then
    raise exception 'Una membresia vecinal requiere un perfil vecino.';
  end if;

  if v_profile_building_id is not null and v_profile_building_id <> new.building_id then
    raise exception 'El perfil indicado pertenece a otro edificio.';
  end if;

  if new.relationship_type = 'vecino_adicional'
    and new.active
    and (
      select count(*)::integer
      from public.unit_profile_memberships m
      where m.unit_id = new.unit_id
        and m.relationship_type = 'vecino_adicional'
        and m.active
        and (tg_op = 'INSERT' or m.id <> new.id)
    ) >= 4
  then
    raise exception 'La unidad ya tiene 4 vecinos adicionales activos.';
  end if;

  if new.relationship_type <> 'propietario' then
    new.is_primary := false;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_unit_profile_membership on public.unit_profile_memberships;
create trigger validate_unit_profile_membership
before insert or update on public.unit_profile_memberships
for each row execute function public.validate_unit_profile_membership();

-- Backfill liviano desde perfiles existentes cuando ya existe una unidad IAdmin compatible.
insert into public.unit_profile_memberships (
  unit_id,
  building_id,
  profile_id,
  relationship_type,
  active,
  created_by_profile_id
)
select distinct on (p.id)
  u.id,
  mp.building_id,
  p.id,
  'vecino_principal'::public.unit_profile_relationship,
  true,
  p.id
from public.profiles p
join public.iadmin_managed_properties mp on mp.building_id = p.building_id
join public.iadmin_units u on u.managed_property_id = mp.id
where p.role::text = 'vecino'
  and p.building_id is not null
  and p.unit is not null
  and (
    lower(u.code) = lower(p.unit)
    or lower(u.code) = lower(concat_ws('', p.floor, p.unit))
    or lower(u.code) = lower(concat_ws('-', p.floor, p.unit))
  )
on conflict do nothing;

alter table public.unit_profile_memberships enable row level security;
alter table public.building_information enable row level security;

drop policy if exists "unit memberships select scoped" on public.unit_profile_memberships;
create policy "unit memberships select scoped"
on public.unit_profile_memberships for select
to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_role()::text = 'super_admin'
  or public.user_has_building_access(building_id)
  or public.current_user_has_unit_membership(unit_id)
);

drop policy if exists "unit memberships insert scoped" on public.unit_profile_memberships;
create policy "unit memberships insert scoped"
on public.unit_profile_memberships for insert
to authenticated
with check (
  public.can_manage_unit_membership(unit_id, relationship_type)
);

drop policy if exists "unit memberships update scoped" on public.unit_profile_memberships;
create policy "unit memberships update scoped"
on public.unit_profile_memberships for update
to authenticated
using (
  public.current_user_role()::text = 'super_admin'
  or (
    public.current_user_role()::text = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
  or (
    relationship_type = 'vecino_adicional'
    and public.current_user_is_principal_neighbor(unit_id)
  )
)
with check (
  public.current_user_role()::text = 'super_admin'
  or (
    public.current_user_role()::text = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
  or (
    relationship_type = 'vecino_adicional'
    and public.current_user_is_principal_neighbor(unit_id)
  )
);

drop policy if exists "building information select scoped" on public.building_information;
create policy "building information select scoped"
on public.building_information for select
to authenticated
using (
  is_active
  and (
    public.current_user_role()::text = 'super_admin'
    or public.user_has_building_access(building_id)
  )
  and (
    visible_to = 'residentes'
    or (visible_to = 'vecinos' and public.current_user_role()::text = 'vecino')
    or (visible_to = 'propietarios' and public.current_user_role()::text = 'propietario')
    or public.current_user_role()::text in ('super_admin', 'consorcio_admin')
  )
);

drop policy if exists "building information write scoped" on public.building_information;
create policy "building information write scoped"
on public.building_information for all
to authenticated
using (
  public.current_user_role()::text = 'super_admin'
  or (
    public.current_user_role()::text = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
)
with check (
  public.current_user_role()::text = 'super_admin'
  or (
    public.current_user_role()::text = 'consorcio_admin'
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "Profiles select by role scope" on public.profiles;
create policy "Profiles select by role scope"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or public.current_user_role()::text = 'super_admin'
  or (
    public.current_user_role()::text = 'consorcio_admin'
    and (
      (building_id is not null and public.user_has_building_access(building_id))
      or exists (
        select 1
        from public.unit_profile_memberships m
        where m.profile_id = profiles.id
          and public.user_has_building_access(m.building_id)
      )
    )
  )
  or exists (
    select 1
    from public.unit_profile_memberships mine
    join public.unit_profile_memberships theirs on theirs.unit_id = mine.unit_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = profiles.id
      and mine.active
      and theirs.active
  )
);

drop policy if exists "Marketplace scoped read" on public.marketplace_items;
create policy "Marketplace scoped read"
on public.marketplace_items for select
to authenticated
using (
  public.current_user_role()::text = 'super_admin'
  or public.current_user_role()::text = 'negocio_admin'
  or (
    public.current_user_role()::text = 'vecino'
    and public.user_has_building_access(building_id)
  )
);

drop policy if exists "iadmin_managed_properties resident select" on public.iadmin_managed_properties;
create policy "iadmin_managed_properties resident select"
on public.iadmin_managed_properties for select
to authenticated
using (
  public.current_user_has_building_membership(building_id)
);

drop policy if exists "iadmin_units resident select" on public.iadmin_units;
create policy "iadmin_units resident select"
on public.iadmin_units for select
to authenticated
using (
  public.current_user_has_unit_membership(id)
);

drop policy if exists "iadmin_unit_holders resident select" on public.iadmin_unit_holders;
create policy "iadmin_unit_holders resident select"
on public.iadmin_unit_holders for select
to authenticated
using (
  public.current_user_has_unit_membership(unit_id)
);

drop policy if exists "iadmin_liquidation_runs owner select" on public.iadmin_liquidation_runs;
create policy "iadmin_liquidation_runs owner select"
on public.iadmin_liquidation_runs for select
to authenticated
using (
  exists (
    select 1
    from public.iadmin_liquidation_items li
    join public.unit_profile_memberships m on m.unit_id = li.unit_id
    where li.liquidation_run_id = public.iadmin_liquidation_runs.id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'propietario'
      and m.active
  )
);

drop policy if exists "iadmin_liquidation_items owner select" on public.iadmin_liquidation_items;
create policy "iadmin_liquidation_items owner select"
on public.iadmin_liquidation_items for select
to authenticated
using (
  exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = public.iadmin_liquidation_items.unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'propietario'
      and m.active
  )
);

drop policy if exists "iadmin_payments owner select" on public.iadmin_payments;
create policy "iadmin_payments owner select"
on public.iadmin_payments for select
to authenticated
using (
  unit_id is not null
  and exists (
    select 1
    from public.unit_profile_memberships m
    where m.unit_id = public.iadmin_payments.unit_id
      and m.profile_id = auth.uid()
      and m.relationship_type = 'propietario'
      and m.active
  )
);

drop policy if exists "Saved promotions own rows" on public.saved_promotions;
create policy "Saved promotions own rows"
on public.saved_promotions for all
to authenticated
using (
  public.current_user_role()::text = 'super_admin'
  or (
    profile_id = auth.uid()
    and public.current_user_role()::text = 'vecino'
  )
)
with check (
  public.current_user_role()::text = 'super_admin'
  or (
    profile_id = auth.uid()
    and public.current_user_role()::text = 'vecino'
  )
);

drop policy if exists "Redemptions own rows" on public.promotion_redemptions;
create policy "Redemptions own rows"
on public.promotion_redemptions for all
to authenticated
using (
  public.current_user_role()::text = 'super_admin'
  or (
    profile_id = auth.uid()
    and public.current_user_role()::text = 'vecino'
  )
  or (
    public.current_user_role()::text = 'negocio_admin'
    and exists (
      select 1
      from public.promotions p
      where p.id = public.promotion_redemptions.promotion_id
        and p.business_id = public.current_user_business_id()
    )
  )
)
with check (
  public.current_user_role()::text = 'super_admin'
  or (
    profile_id = auth.uid()
    and public.current_user_role()::text = 'vecino'
  )
);

create or replace function public.create_promotion_redemption_token(target_promotion_id uuid)
returns table (
  id uuid,
  token text,
  qr_value text,
  expires_at timestamptz,
  promotion_id uuid,
  promotion_title text,
  business_name text
)
language plpgsql
security definer
set search_path = public
as $create_redemption_token$
declare
  current_profile public.profiles%rowtype;
  promotion_row public.promotions%rowtype;
  business_row public.businesses%rowtype;
  existing_token public.promotion_redemption_tokens%rowtype;
  created_token public.promotion_redemption_tokens%rowtype;
  v_current_building_id uuid;
begin
  select *
  into current_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if current_profile.id is null then
    raise exception 'No se encontro el perfil autenticado.';
  end if;

  if current_profile.role::text not in ('vecino', 'super_admin') then
    raise exception 'Solo vecinos pueden solicitar cupones QR.';
  end if;

  v_current_building_id := public.current_user_building_id();

  select *
  into promotion_row
  from public.promotions p
  where p.id = target_promotion_id
  limit 1;

  if promotion_row.id is null then
    raise exception 'La promocion no existe.';
  end if;

  if not promotion_row.is_active or promotion_row.expiration_date < current_date then
    raise exception 'La promocion ya no esta disponible.';
  end if;

  if promotion_row.building_id is not null and promotion_row.building_id <> v_current_building_id and current_profile.role::text <> 'super_admin' then
    raise exception 'La promocion no esta disponible para tu edificio.';
  end if;

  if exists (
    select 1
    from public.promotion_redemptions pr
    where pr.profile_id = current_profile.id
      and pr.promotion_id = promotion_row.id
  ) then
    raise exception 'Esta promocion ya fue usada por este vecino.';
  end if;

  update public.promotion_redemption_tokens t
  set status = 'expired'
  where t.profile_id = current_profile.id
    and t.promotion_id = promotion_row.id
    and t.status = 'pending'
    and t.expires_at <= now();

  select *
  into existing_token
  from public.promotion_redemption_tokens t
  where t.profile_id = current_profile.id
    and t.promotion_id = promotion_row.id
    and t.status = 'pending'
    and t.expires_at > now()
  order by t.created_at desc
  limit 1;

  select *
  into business_row
  from public.businesses b
  where b.id = promotion_row.business_id
  limit 1;

  if existing_token.id is null then
    insert into public.promotion_redemption_tokens (
      promotion_id,
      profile_id,
      token,
      expires_at
    )
    values (
      promotion_row.id,
      current_profile.id,
      public.generate_promotion_redemption_token(),
      now() + interval '15 minutes'
    )
    returning *
    into created_token;
  else
    created_token := existing_token;
  end if;

  return query
  select
    created_token.id,
    created_token.token,
    'CITIFY:' || created_token.token,
    created_token.expires_at,
    promotion_row.id,
    promotion_row.title,
    coalesce(business_row.name, 'Comercio');
end;
$create_redemption_token$;




-- Migration: 20260426_superadmin_create_consorcio.sql

create or replace function public.superadmin_create_consorcio(
  building_name text,
  building_address text,
  building_total_units integer,
  building_latitude numeric,
  building_longitude numeric,
  administration_name text,
  administration_legal_name text default null,
  administration_tax_id text default null,
  administration_contact_email text default null,
  administration_contact_phone text default null,
  property_display_name text default null,
  property_kind public.iadmin_property_kind default 'consorcio',
  property_tax_id text default null,
  property_managed_since date default null,
  property_management_fee_pct numeric default null,
  property_notes text default null,
  admin_profile_id uuid default null,
  creator_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id uuid;
  v_administration_id uuid;
  v_managed_property_id uuid;
  v_existing_building_id uuid;
  v_admin_role public.app_role;
  v_has_assignments boolean;
  v_has_grants boolean;
  v_normalized_name text := regexp_replace(lower(trim(coalesce(building_name, ''))), '\s+', ' ', 'g');
  v_normalized_address text := regexp_replace(lower(trim(coalesce(building_address, ''))), '\s+', ' ', 'g');
begin
  if trim(coalesce(building_name, '')) = '' then
    raise exception 'El nombre del edificio es obligatorio.';
  end if;

  if trim(coalesce(building_address, '')) = '' then
    raise exception 'La direccion del edificio es obligatoria.';
  end if;

  if building_total_units is null or building_total_units < 0 then
    raise exception 'La cantidad total de unidades es invalida.';
  end if;

  if trim(coalesce(administration_name, '')) = '' then
    raise exception 'El nombre de la administracion es obligatorio.';
  end if;

  if admin_profile_id is null then
    raise exception 'Debes indicar un administrador inicial.';
  end if;

  if property_management_fee_pct is not null and (property_management_fee_pct < 0 or property_management_fee_pct > 100) then
    raise exception 'El fee de administracion debe estar entre 0 y 100.';
  end if;

  select b.id
  into v_existing_building_id
  from public.buildings b
  where regexp_replace(lower(trim(coalesce(b.name, ''))), '\s+', ' ', 'g') = v_normalized_name
    and regexp_replace(lower(trim(coalesce(b.address, ''))), '\s+', ' ', 'g') = v_normalized_address
  limit 1;

  if v_existing_building_id is not null then
    raise exception 'Ya existe un edificio con el mismo nombre y direccion.';
  end if;

  select p.role
  into v_admin_role
  from public.profiles p
  where p.id = admin_profile_id;

  if v_admin_role is null then
    raise exception 'El administrador inicial no existe.';
  end if;

  if v_admin_role <> 'consorcio_admin' then
    raise exception 'El administrador inicial debe tener rol consorcio_admin.';
  end if;

  with inserted_building as (
    insert into public.buildings (
      name,
      address,
      total_units,
      latitude,
      longitude
    )
    values (
      trim(building_name),
      trim(building_address),
      building_total_units,
      building_latitude,
      building_longitude
    )
    returning id
  )
  select id
  into v_building_id
  from inserted_building;

  with inserted_administration as (
    insert into public.iadmin_administrations (
      name,
      legal_name,
      tax_id,
      contact_email,
      contact_phone,
      is_active
    )
    values (
      trim(administration_name),
      nullif(trim(coalesce(administration_legal_name, '')), ''),
      nullif(trim(coalesce(administration_tax_id, '')), ''),
      nullif(trim(coalesce(administration_contact_email, '')), ''),
      nullif(trim(coalesce(administration_contact_phone, '')), ''),
      true
    )
    returning id
  )
  select id
  into v_administration_id
  from inserted_administration;

  with inserted_property as (
    insert into public.iadmin_managed_properties (
      administration_id,
      building_id,
      display_name,
      property_kind,
      tax_id,
      managed_since,
      management_fee_pct,
      notes,
      is_active
    )
    values (
      v_administration_id,
      v_building_id,
      coalesce(nullif(trim(coalesce(property_display_name, '')), ''), trim(building_name)),
      property_kind,
      nullif(trim(coalesce(property_tax_id, '')), ''),
      property_managed_since,
      property_management_fee_pct,
      nullif(trim(coalesce(property_notes, '')), ''),
      true
    )
    returning id
  )
  select id
  into v_managed_property_id
  from inserted_property;

  select exists(
    select 1
    from public.building_admin_assignments
    where profile_id = admin_profile_id
  )
  into v_has_assignments;

  insert into public.building_admin_assignments (
    profile_id,
    building_id,
    is_primary
  )
  values (
    admin_profile_id,
    v_building_id,
    not v_has_assignments
  );

  if not v_has_assignments then
    update public.profiles
    set building_id = v_building_id
    where id = admin_profile_id;
  end if;

  select exists(
    select 1
    from public.iadmin_role_grants
    where profile_id = admin_profile_id
  )
  into v_has_grants;

  insert into public.iadmin_role_grants (
    administration_id,
    profile_id,
    operational_role,
    is_primary
  )
  values (
    v_administration_id,
    admin_profile_id,
    'titular',
    not v_has_grants
  );

  insert into public.iadmin_audit_logs (
    administration_id,
    actor_profile_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    v_administration_id,
    creator_profile_id,
    'iadmin_managed_properties',
    v_managed_property_id,
    'property.created',
    jsonb_build_object(
      'building_id', v_building_id,
      'administration_id', v_administration_id,
      'admin_profile_id', admin_profile_id
    )
  );

  return jsonb_build_object(
    'building_id', v_building_id,
    'administration_id', v_administration_id,
    'managed_property_id', v_managed_property_id
  );
end;
$$;

revoke all on function public.superadmin_create_consorcio(
  text,
  text,
  integer,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  public.iadmin_property_kind,
  text,
  date,
  numeric,
  text,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.superadmin_create_consorcio(
  text,
  text,
  integer,
  numeric,
  numeric,
  text,
  text,
  text,
  text,
  text,
  text,
  public.iadmin_property_kind,
  text,
  date,
  numeric,
  text,
  uuid,
  uuid
) to service_role;




-- Migration: 20260505_fix_promotion_qr_ambiguous_id.sql

create or replace function public.create_promotion_redemption_token(target_promotion_id uuid)
returns table (
  id uuid,
  token text,
  qr_value text,
  expires_at timestamptz,
  promotion_id uuid,
  promotion_title text,
  business_name text
)
language plpgsql
security definer
set search_path = public
as $create_redemption_token$
declare
  current_profile public.profiles%rowtype;
  promotion_row public.promotions%rowtype;
  business_row public.businesses%rowtype;
  existing_token public.promotion_redemption_tokens%rowtype;
  created_token public.promotion_redemption_tokens%rowtype;
  v_current_building_id uuid;
begin
  select *
  into current_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if current_profile.id is null then
    raise exception 'No se encontro el perfil autenticado.';
  end if;

  if current_profile.role::text not in ('vecino', 'super_admin') then
    raise exception 'Solo vecinos pueden solicitar cupones QR.';
  end if;

  v_current_building_id := public.current_user_building_id();

  select *
  into promotion_row
  from public.promotions p
  where p.id = target_promotion_id
  limit 1;

  if promotion_row.id is null then
    raise exception 'La promocion no existe.';
  end if;

  if not promotion_row.is_active or promotion_row.expiration_date < current_date then
    raise exception 'La promocion ya no esta disponible.';
  end if;

  if promotion_row.building_id is not null and promotion_row.building_id <> v_current_building_id and current_profile.role::text <> 'super_admin' then
    raise exception 'La promocion no esta disponible para tu edificio.';
  end if;

  if exists (
    select 1
    from public.promotion_redemptions pr
    where pr.profile_id = current_profile.id
      and pr.promotion_id = promotion_row.id
  ) then
    raise exception 'Esta promocion ya fue usada por este vecino.';
  end if;

  update public.promotion_redemption_tokens t
  set status = 'expired'
  where t.profile_id = current_profile.id
    and t.promotion_id = promotion_row.id
    and t.status = 'pending'
    and t.expires_at <= now();

  select *
  into existing_token
  from public.promotion_redemption_tokens t
  where t.profile_id = current_profile.id
    and t.promotion_id = promotion_row.id
    and t.status = 'pending'
    and t.expires_at > now()
  order by t.created_at desc
  limit 1;

  select *
  into business_row
  from public.businesses b
  where b.id = promotion_row.business_id
  limit 1;

  if existing_token.id is null then
    insert into public.promotion_redemption_tokens (
      promotion_id,
      profile_id,
      token,
      expires_at
    )
    values (
      promotion_row.id,
      current_profile.id,
      public.generate_promotion_redemption_token(),
      now() + interval '15 minutes'
    )
    returning *
    into created_token;
  else
    created_token := existing_token;
  end if;

  return query
  select
    created_token.id,
    created_token.token,
    'CITIFY:' || created_token.token,
    created_token.expires_at,
    promotion_row.id,
    promotion_row.title,
    coalesce(business_row.name, 'Comercio');
end;
$create_redemption_token$;

grant execute on function public.create_promotion_redemption_token(uuid) to authenticated;




-- Migration: 20260505_fix_promotion_qr_missing_generator.sql

create or replace function public.generate_promotion_redemption_token()
returns text
language plpgsql
as $generate_token$
begin
  return upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
end;
$generate_token$;


