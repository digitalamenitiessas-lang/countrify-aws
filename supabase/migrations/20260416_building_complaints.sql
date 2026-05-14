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
