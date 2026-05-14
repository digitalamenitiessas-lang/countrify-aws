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
