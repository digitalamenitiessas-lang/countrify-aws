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
