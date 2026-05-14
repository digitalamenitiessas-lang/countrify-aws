-- CITIFY + IAdmin full bundle. Orden por dependencias. Idempotente.


-- ==========================================================
-- 20260415_initial.sql
-- ==========================================================
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

insert into storage.buckets (id, name, public)
values
  ('business-logos', 'business-logos', true),
  ('promotion-images', 'promotion-images', true),
  ('marketplace-images', 'marketplace-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can view storage assets" on storage.objects;
create policy "Public can view storage assets" on storage.objects
for select to public
using (bucket_id in ('business-logos', 'promotion-images', 'marketplace-images'));

drop policy if exists "Business logo uploads" on storage.objects;
create policy "Business logo uploads" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'business-logos'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
);

drop policy if exists "Business logo updates" on storage.objects;
create policy "Business logo updates" on storage.objects
for update to authenticated
using (
  bucket_id = 'business-logos'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
)
with check (
  bucket_id = 'business-logos'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
);

drop policy if exists "Promotion image uploads" on storage.objects;
create policy "Promotion image uploads" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'promotion-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
);

drop policy if exists "Promotion image updates" on storage.objects;
create policy "Promotion image updates" on storage.objects
for update to authenticated
using (
  bucket_id = 'promotion-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
)
with check (
  bucket_id = 'promotion-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'negocio_admin'
      and (storage.foldername(name))[2] = public.current_user_business_id()::text
    )
  )
);

drop policy if exists "Marketplace image uploads" on storage.objects;
create policy "Marketplace image uploads" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'marketplace-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'vecino'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);

drop policy if exists "Marketplace image updates" on storage.objects;
create policy "Marketplace image updates" on storage.objects
for update to authenticated
using (
  bucket_id = 'marketplace-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'vecino'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
)
with check (
  bucket_id = 'marketplace-images'
  and (
    public.current_user_role() = 'super_admin'
    or (
      public.current_user_role() = 'vecino'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);


-- ==========================================================
-- 20260416_consorcio_multi_building.sql
-- ==========================================================
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


-- ==========================================================
-- 20260416_building_complaints.sql
-- ==========================================================
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


-- ==========================================================
-- 20260417_complaint_cases.sql
-- ==========================================================
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


-- ==========================================================
-- 20260418_complaint_case_mentions.sql
-- ==========================================================
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


-- ==========================================================
-- 20260417_iadmin_core.sql
-- ==========================================================
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

  select operational_role into v_role
  from public.iadmin_role_grants
  where administration_id = target_admin_id and profile_id = auth.uid()
  limit 1;

  if v_role is null then
    return false;
  end if;

  select granted into v_override
  from public.iadmin_role_capabilities
  where administration_id = target_admin_id
    and operational_role = v_role
    and capability_code = target_capability
  limit 1;

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

