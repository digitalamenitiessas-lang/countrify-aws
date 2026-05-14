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
