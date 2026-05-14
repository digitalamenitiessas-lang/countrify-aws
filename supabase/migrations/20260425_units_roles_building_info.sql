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
