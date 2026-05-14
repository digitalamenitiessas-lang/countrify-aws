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
