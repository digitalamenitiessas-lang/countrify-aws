  -- Mock data para probar roles, unidades, propietarios y vecinos familiares.
  --
  -- Ejecutar despues de las migraciones IAdmin existentes y:
  --   supabase/migrations/20260425_units_roles_building_info.sql
  --
  -- Password de todos los usuarios mock:
  --   Test1234!
  --
  -- Usuarios principales:
  --   superadmin@citify.test
  --   consorcio@citify.test
  --   propietario.torre@citify.test
  --   vecino.principal@citify.test
  --   familiar1@citify.test ... familiar4@citify.test
  --   propietario.central@citify.test
  --   vecino.central@citify.test

  create extension if not exists "pgcrypto";

  do $mock_units_roles$
  declare
    admin_id uuid;
    torre_id uuid;
    central_id uuid;
    torre_property_id uuid;
    central_property_id uuid;
    consorcio_admin_id uuid;
    super_admin_id uuid;
    owner_torre_id uuid;
    neighbor_main_id uuid;
    family_1_id uuid;
    family_2_id uuid;
    family_3_id uuid;
    family_4_id uuid;
    owner_central_id uuid;
    neighbor_central_id uuid;
    unit_1a_id uuid;
    unit_2a_id uuid;
    unit_101_id uuid;
    period_id uuid;
    run_id uuid;
    item_1a_id uuid;
    item_2a_id uuid;
    payment_1a_id uuid;
    current_year integer := extract(year from now())::integer;
    current_month integer := extract(month from now())::integer;
    changed_rows integer;
  begin
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'app_role'
        and e.enumlabel = 'propietario'
    ) then
      raise exception 'Primero ejecuta 20260425_units_roles_building_info.sql para crear el rol propietario.';
    end if;

    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'unit_profile_memberships'
    ) then
      raise exception 'Primero ejecuta 20260425_units_roles_building_info.sql para crear unit_profile_memberships.';
    end if;

    -- Edificios base.
    select id into torre_id from public.buildings where name = 'Torre del Parque' limit 1;
    if torre_id is null then
      insert into public.buildings (name, address, total_units)
      values ('Torre del Parque', 'Av. Libertador 1234, CABA', 120)
      returning id into torre_id;
    end if;

    select id into central_id from public.buildings where name = 'Edificio Central' limit 1;
    if central_id is null then
      insert into public.buildings (name, address, total_units)
      values ('Edificio Central', 'Calle Corrientes 500, CABA', 85)
      returning id into central_id;
    end if;

    -- Usuarios auth.
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    select
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      seed.email,
      crypt('Test1234!', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', seed.full_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    from (
      values
        ('superadmin@citify.test', 'Super Admin CITIFY'),
        ('consorcio@citify.test', 'Admin Consorcio Demo'),
        ('propietario.torre@citify.test', 'Maria Propietaria Torre'),
        ('vecino.principal@citify.test', 'Juan Vecino Principal'),
        ('familiar1@citify.test', 'Ana Familiar Uno'),
        ('familiar2@citify.test', 'Tomas Familiar Dos'),
        ('familiar3@citify.test', 'Luz Familiar Tres'),
        ('familiar4@citify.test', 'Nico Familiar Cuatro'),
        ('propietario.central@citify.test', 'Diego Propietario Central'),
        ('vecino.central@citify.test', 'Carla Vecina Central')
    ) as seed(email, full_name)
    where not exists (
      select 1
      from auth.users existing
      where lower(existing.email) = lower(seed.email)
    );

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      created_at,
      updated_at,
      last_sign_in_at
    )
    select
      gen_random_uuid(),
      users.id,
      jsonb_build_object('sub', users.id::text, 'email', users.email),
      'email',
      users.email,
      now(),
      now(),
      now()
    from auth.users as users
    where users.email in (
      'superadmin@citify.test',
      'consorcio@citify.test',
      'propietario.torre@citify.test',
      'vecino.principal@citify.test',
      'familiar1@citify.test',
      'familiar2@citify.test',
      'familiar3@citify.test',
      'familiar4@citify.test',
      'propietario.central@citify.test',
      'vecino.central@citify.test'
    )
    on conflict (provider, provider_id) do nothing;

    insert into public.profiles (id, email, full_name, avatar_text)
    select
      users.id,
      users.email,
      coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1)),
      upper(left(coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1), 'U'), 2))
    from auth.users as users
    where users.email in (
      'superadmin@citify.test',
      'consorcio@citify.test',
      'propietario.torre@citify.test',
      'vecino.principal@citify.test',
      'familiar1@citify.test',
      'familiar2@citify.test',
      'familiar3@citify.test',
      'familiar4@citify.test',
      'propietario.central@citify.test',
      'vecino.central@citify.test'
    )
    on conflict (id) do nothing;

    select id into super_admin_id from auth.users where email = 'superadmin@citify.test' limit 1;
    select id into consorcio_admin_id from auth.users where email = 'consorcio@citify.test' limit 1;
    select id into owner_torre_id from auth.users where email = 'propietario.torre@citify.test' limit 1;
    select id into neighbor_main_id from auth.users where email = 'vecino.principal@citify.test' limit 1;
    select id into family_1_id from auth.users where email = 'familiar1@citify.test' limit 1;
    select id into family_2_id from auth.users where email = 'familiar2@citify.test' limit 1;
    select id into family_3_id from auth.users where email = 'familiar3@citify.test' limit 1;
    select id into family_4_id from auth.users where email = 'familiar4@citify.test' limit 1;
    select id into owner_central_id from auth.users where email = 'propietario.central@citify.test' limit 1;
    select id into neighbor_central_id from auth.users where email = 'vecino.central@citify.test' limit 1;

    update public.profiles
    set full_name = 'Super Admin CITIFY',
        role = 'super_admin',
        avatar_text = 'SA',
        building_id = null,
        business_id = null,
        floor = null,
        unit = null,
        phone = '+54 11 4000-0000'
    where id = super_admin_id;

    update public.profiles
    set full_name = 'Admin Consorcio Demo',
        role = 'consorcio_admin',
        avatar_text = 'CD',
        building_id = torre_id,
        business_id = null,
        floor = null,
        unit = null,
        phone = '+54 11 4000-2000'
    where id = consorcio_admin_id;

    update public.profiles
    set full_name = 'Maria Propietaria Torre',
        role = 'propietario',
        avatar_text = 'MP',
        building_id = torre_id,
        floor = '1',
        unit = '1A',
        phone = '+54 11 4000-3001'
    where id = owner_torre_id;

    update public.profiles
    set full_name = 'Juan Vecino Principal',
        role = 'vecino',
        avatar_text = 'JV',
        building_id = torre_id,
        floor = '1',
        unit = '1A',
        phone = '+54 11 4000-3002'
    where id = neighbor_main_id;

    update public.profiles
    set role = 'vecino',
        building_id = torre_id,
        floor = '1',
        unit = '1A',
        business_id = null,
        avatar_text = case email
          when 'familiar1@citify.test' then 'AF'
          when 'familiar2@citify.test' then 'TF'
          when 'familiar3@citify.test' then 'LF'
          when 'familiar4@citify.test' then 'NF'
          else avatar_text
        end,
        phone = case email
          when 'familiar1@citify.test' then '+54 11 4000-3003'
          when 'familiar2@citify.test' then '+54 11 4000-3004'
          when 'familiar3@citify.test' then '+54 11 4000-3005'
          when 'familiar4@citify.test' then '+54 11 4000-3006'
          else phone
        end
    where email in (
      'familiar1@citify.test',
      'familiar2@citify.test',
      'familiar3@citify.test',
      'familiar4@citify.test'
    );

    update public.profiles
    set full_name = 'Diego Propietario Central',
        role = 'propietario',
        avatar_text = 'DP',
        building_id = central_id,
        floor = '10',
        unit = '101',
        phone = '+54 11 4000-4001'
    where id = owner_central_id;

    update public.profiles
    set full_name = 'Carla Vecina Central',
        role = 'vecino',
        avatar_text = 'CV',
        building_id = central_id,
        floor = '10',
        unit = '101',
        phone = '+54 11 4000-4002'
    where id = neighbor_central_id;

    -- Administracion e IAdmin.
    select id into admin_id from public.iadmin_administrations where name = 'Administracion Demo' limit 1;
    if admin_id is null then
      insert into public.iadmin_administrations (
        name,
        legal_name,
        tax_id,
        contact_email,
        contact_phone,
        is_active,
        legal_info
      )
      values (
        'Administracion Demo',
        'Administracion Demo SRL',
        '30-12345678-9',
        'ops@demo.admin',
        '+54 9 11 5555-0000',
        true,
        jsonb_build_object(
          'bank',
          jsonb_build_object(
            'name', 'Banco Demo',
            'alias', 'CITIFY.DEMO',
            'cbu', '0000003100000000000001',
            'account', 'CC 0001'
          ),
          'footerNotes',
          'Datos de prueba para validar propietario, expensas e informacion general.'
        )
      )
      returning id into admin_id;
    end if;

    insert into public.iadmin_role_grants (administration_id, profile_id, operational_role, is_primary)
    values (admin_id, consorcio_admin_id, 'titular', true)
    on conflict (administration_id, profile_id) do update
    set operational_role = excluded.operational_role,
        is_primary = true;

    insert into public.building_admin_assignments (profile_id, building_id, is_primary)
    values
      (consorcio_admin_id, torre_id, true),
      (consorcio_admin_id, central_id, false)
    on conflict (profile_id, building_id) do update
    set is_primary = excluded.is_primary;

    insert into public.iadmin_managed_properties (
      administration_id,
      building_id,
      display_name,
      property_kind,
      tax_id,
      managed_since,
      management_fee_pct,
      legal_info,
      is_active
    )
    values
      (
        admin_id,
        torre_id,
        'Torre del Parque',
        'consorcio',
        '30-11111111-1',
        current_date - interval '2 years',
        5.0,
        jsonb_build_object(
          'amenities',
          jsonb_build_array(
            jsonb_build_object('name', 'Pileta', 'price', 'Incluida', 'deposit', 'Sin deposito'),
            jsonb_build_object('name', 'SUM', 'price', '$ 25.000', 'deposit', '$ 15.000')
          ),
          'collectionSchedule',
          'Expensas disponibles desde el dia 5 de cada mes.'
        ),
        true
      ),
      (
        admin_id,
        central_id,
        'Edificio Central',
        'edificio',
        '30-22222222-2',
        current_date - interval '1 year',
        4.5,
        '{}'::jsonb,
        true
      )
    on conflict (administration_id, building_id) do update
    set display_name = excluded.display_name,
        property_kind = excluded.property_kind,
        tax_id = excluded.tax_id,
        is_active = true,
        legal_info = excluded.legal_info;

    select id into torre_property_id
    from public.iadmin_managed_properties
    where administration_id = admin_id
      and building_id = torre_id
    limit 1;

    select id into central_property_id
    from public.iadmin_managed_properties
    where administration_id = admin_id
      and building_id = central_id
    limit 1;

    insert into public.iadmin_units (managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active)
    values
      (torre_property_id, '1A', 'departamento', '1', 65.00, 0.125, true),
      (torre_property_id, '2A', 'departamento', '2', 80.00, 0.150, true),
      (torre_property_id, 'PH', 'departamento', 'PH', 120.00, 0.200, true),
      (central_property_id, '101', 'departamento', '10', 55.00, 0.330, true)
    on conflict (managed_property_id, code) do update
    set kind = excluded.kind,
        floor = excluded.floor,
        surface_m2 = excluded.surface_m2,
        prorata_coefficient = excluded.prorata_coefficient,
        is_active = true;

    select id into unit_1a_id from public.iadmin_units where managed_property_id = torre_property_id and code = '1A' limit 1;
    select id into unit_2a_id from public.iadmin_units where managed_property_id = torre_property_id and code = '2A' limit 1;
    select id into unit_101_id from public.iadmin_units where managed_property_id = central_property_id and code = '101' limit 1;

    -- Vinculos unidad-perfil. Primero aseguramos unicidad funcional.
    update public.unit_profile_memberships
    set active = false
    where unit_id = unit_1a_id
      and relationship_type = 'vecino_principal'
      and profile_id <> neighbor_main_id
      and active;

    update public.unit_profile_memberships
    set active = false
    where unit_id = unit_101_id
      and relationship_type = 'vecino_principal'
      and profile_id <> neighbor_central_id
      and active;

    update public.unit_profile_memberships
    set active = false,
        is_primary = false
    where unit_id = unit_1a_id
      and relationship_type = 'propietario'
      and profile_id <> owner_torre_id
      and is_primary
      and active;

    update public.unit_profile_memberships
    set active = false,
        is_primary = false
    where unit_id = unit_101_id
      and relationship_type = 'propietario'
      and profile_id <> owner_central_id
      and is_primary
      and active;

    -- Propietario Torre 1A.
    update public.unit_profile_memberships
    set active = true,
        is_primary = true,
        building_id = torre_id
    where unit_id = unit_1a_id
      and profile_id = owner_torre_id
      and relationship_type = 'propietario';
    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      insert into public.unit_profile_memberships (unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id)
      values (unit_1a_id, torre_id, owner_torre_id, 'propietario', true, true, super_admin_id);
    end if;

    -- Vecino principal Torre 1A.
    update public.unit_profile_memberships
    set active = true,
        is_primary = false,
        building_id = torre_id
    where unit_id = unit_1a_id
      and profile_id = neighbor_main_id
      and relationship_type = 'vecino_principal';
    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      insert into public.unit_profile_memberships (unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id)
      values (unit_1a_id, torre_id, neighbor_main_id, 'vecino_principal', false, true, super_admin_id);
    end if;

    -- 4 familiares/convivientes: el quinto deberia bloquearse si intentas crearlo desde UI.
    update public.unit_profile_memberships
    set active = false,
        is_primary = false
    where unit_id = unit_1a_id
      and relationship_type = 'vecino_adicional'
      and profile_id not in (family_1_id, family_2_id, family_3_id, family_4_id)
      and active;

    update public.unit_profile_memberships
    set active = true,
        is_primary = false,
        building_id = torre_id
    where unit_id = unit_1a_id
      and profile_id in (family_1_id, family_2_id, family_3_id, family_4_id)
      and relationship_type = 'vecino_adicional';

    insert into public.unit_profile_memberships (unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id)
    select unit_1a_id, torre_id, seed.profile_id, 'vecino_adicional'::public.unit_profile_relationship, false, true, neighbor_main_id
    from (
      values
        (family_1_id),
        (family_2_id),
        (family_3_id),
        (family_4_id)
    ) as seed(profile_id)
    where not exists (
      select 1
      from public.unit_profile_memberships existing
      where existing.unit_id = unit_1a_id
        and existing.profile_id = seed.profile_id
        and existing.relationship_type = 'vecino_adicional'
    );

    -- Propietario + vecino en otro edificio para validar aislamiento.
    update public.unit_profile_memberships
    set active = true,
        is_primary = true,
        building_id = central_id
    where unit_id = unit_101_id
      and profile_id = owner_central_id
      and relationship_type = 'propietario';
    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      insert into public.unit_profile_memberships (unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id)
      values (unit_101_id, central_id, owner_central_id, 'propietario', true, true, super_admin_id);
    end if;

    update public.unit_profile_memberships
    set active = true,
        is_primary = false,
        building_id = central_id
    where unit_id = unit_101_id
      and profile_id = neighbor_central_id
      and relationship_type = 'vecino_principal';
    get diagnostics changed_rows = row_count;
    if changed_rows = 0 then
      insert into public.unit_profile_memberships (unit_id, building_id, profile_id, relationship_type, is_primary, active, created_by_profile_id)
      values (unit_101_id, central_id, neighbor_central_id, 'vecino_principal', false, true, super_admin_id);
    end if;

    -- Titulares IAdmin asociados a propietarios.
    insert into public.iadmin_unit_holders (unit_id, profile_id, full_name, holder_kind, email, phone, start_date, is_active)
    select unit_1a_id, owner_torre_id, 'Maria Propietaria Torre', 'propietario', 'propietario.torre@citify.test', '+54 11 4000-3001', current_date - interval '18 months', true
    where not exists (
      select 1 from public.iadmin_unit_holders
      where unit_id = unit_1a_id and profile_id = owner_torre_id and holder_kind = 'propietario'
    );

    insert into public.iadmin_unit_holders (unit_id, profile_id, full_name, holder_kind, email, phone, start_date, is_active)
    select unit_101_id, owner_central_id, 'Diego Propietario Central', 'propietario', 'propietario.central@citify.test', '+54 11 4000-4001', current_date - interval '1 year', true
    where not exists (
      select 1 from public.iadmin_unit_holders
      where unit_id = unit_101_id and profile_id = owner_central_id and holder_kind = 'propietario'
    );

    -- Informacion general del edificio.
    insert into public.building_information (building_id, title, category, content, visible_to, sort_order, created_by_profile_id, updated_by_profile_id)
    select torre_id, 'Horarios de pileta', 'Amenities', 'La pileta abre de martes a domingo de 9:00 a 20:00. Menores siempre acompanados por un adulto.', 'residentes', 10, consorcio_admin_id, consorcio_admin_id
    where not exists (
      select 1 from public.building_information where building_id = torre_id and title = 'Horarios de pileta'
    );

    insert into public.building_information (building_id, title, category, content, visible_to, sort_order, created_by_profile_id, updated_by_profile_id)
    select torre_id, 'Uso del SUM', 'Amenities', 'El SUM se reserva con 72 horas de anticipacion. La musica fuerte esta permitida hasta las 00:00.', 'residentes', 20, consorcio_admin_id, consorcio_admin_id
    where not exists (
      select 1 from public.building_information where building_id = torre_id and title = 'Uso del SUM'
    );

    insert into public.building_information (building_id, title, category, content, visible_to, sort_order, created_by_profile_id, updated_by_profile_id)
    select torre_id, 'Contacto administracion', 'Contactos', 'Guardia: +54 11 4000-9000. Administracion: ops@demo.admin.', 'propietarios', 30, consorcio_admin_id, consorcio_admin_id
    where not exists (
      select 1 from public.building_information where building_id = torre_id and title = 'Contacto administracion'
    );

    insert into public.building_information (building_id, title, category, content, visible_to, sort_order, created_by_profile_id, updated_by_profile_id)
    select central_id, 'Reglas de convivencia', 'Normas', 'Horario de silencio de 22:00 a 8:00. Reclamos por espacios comunes desde Expedientes.', 'residentes', 10, consorcio_admin_id, consorcio_admin_id
    where not exists (
      select 1 from public.building_information where building_id = central_id and title = 'Reglas de convivencia'
    );

    -- Liquidacion emitida para que el propietario vea deuda y pago parcial.
    insert into public.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
    values (torre_property_id, current_year, current_month, 'open')
    on conflict (managed_property_id, period_year, period_month) do update
    set status = excluded.status
    returning id into period_id;

    insert into public.iadmin_liquidation_runs (
      administration_id,
      managed_property_id,
      accounting_period_id,
      status,
      total_expenses,
      total_units,
      generated_by,
      generated_at,
      notes
    )
    values (
      admin_id,
      torre_property_id,
      period_id,
      'issued',
      980000,
      3,
      consorcio_admin_id,
      now() - interval '3 days',
      'Liquidacion mock para probar panel propietario.'
    )
    on conflict (managed_property_id, accounting_period_id) do update
    set status = excluded.status,
        total_expenses = excluded.total_expenses,
        total_units = excluded.total_units,
        generated_by = excluded.generated_by,
        notes = excluded.notes
    returning id into run_id;

    insert into public.iadmin_liquidation_items (
      liquidation_run_id,
      unit_id,
      prorata_coefficient,
      amount
    )
    select run_id, unit_1a_id, 0.125, 122500
    where not exists (
      select 1 from public.iadmin_liquidation_items
      where liquidation_run_id = run_id and unit_id = unit_1a_id
    );

    update public.iadmin_liquidation_items
    set prorata_coefficient = 0.125,
        amount = 122500
    where liquidation_run_id = run_id
      and unit_id = unit_1a_id;

    select id into item_1a_id
    from public.iadmin_liquidation_items
    where liquidation_run_id = run_id
      and unit_id = unit_1a_id
    order by created_at desc
    limit 1;

    insert into public.iadmin_liquidation_items (
      liquidation_run_id,
      unit_id,
      prorata_coefficient,
      amount
    )
    select run_id, unit_2a_id, 0.150, 147000
    where not exists (
      select 1 from public.iadmin_liquidation_items
      where liquidation_run_id = run_id and unit_id = unit_2a_id
    );

    update public.iadmin_liquidation_items
    set prorata_coefficient = 0.150,
        amount = 147000
    where liquidation_run_id = run_id
      and unit_id = unit_2a_id;

    select id into item_2a_id
    from public.iadmin_liquidation_items
    where liquidation_run_id = run_id
      and unit_id = unit_2a_id
    order by created_at desc
    limit 1;

    select id into payment_1a_id
    from public.iadmin_payments
    where reference = 'MOCK-PAGO-1A'
    order by created_at desc
    limit 1;

    if payment_1a_id is null then
      insert into public.iadmin_payments (
        liquidation_item_id,
        unit_id,
        amount,
        paid_at,
        method,
        reference
      )
      values (
        item_1a_id,
        unit_1a_id,
        55000,
        now() - interval '1 day',
        'transferencia',
        'MOCK-PAGO-1A'
      )
      returning id into payment_1a_id;
    else
      update public.iadmin_payments
      set liquidation_item_id = item_1a_id,
          unit_id = unit_1a_id,
          amount = 55000,
          paid_at = now() - interval '1 day',
          method = 'transferencia'
      where id = payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'administration_id'
    ) then
      execute 'update public.iadmin_payments set administration_id = $1 where id = $2'
      using admin_id, payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'managed_property_id'
    ) then
      execute 'update public.iadmin_payments set managed_property_id = $1 where id = $2'
      using torre_property_id, payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'liquidation_run_id'
    ) then
      execute 'update public.iadmin_payments set liquidation_run_id = $1 where id = $2'
      using run_id, payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'surcharge_amount'
    ) then
      execute 'update public.iadmin_payments set surcharge_amount = $1 where id = $2'
      using 0, payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'receipt_number'
    ) then
      execute 'update public.iadmin_payments set receipt_number = $1 where id = $2'
      using 'MOCK-0001', payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'due_label'
    ) then
      execute 'update public.iadmin_payments set due_label = $1 where id = $2'
      using 'Primer vencimiento', payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'notes'
    ) then
      execute 'update public.iadmin_payments set notes = $1 where id = $2'
      using 'Pago parcial mock', payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'is_void'
    ) then
      execute 'update public.iadmin_payments set is_void = $1 where id = $2'
      using false, payment_1a_id;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'iadmin_payments'
        and column_name = 'created_by'
    ) then
      execute 'update public.iadmin_payments set created_by = $1 where id = $2'
      using consorcio_admin_id, payment_1a_id;
    end if;
  end
  $mock_units_roles$;

  select
    p.email,
    p.role,
    p.full_name,
    p.floor,
    p.unit,
    b.name as building_name
  from public.profiles p
  left join public.buildings b on b.id = p.building_id
  where p.email in (
    'superadmin@citify.test',
    'consorcio@citify.test',
    'propietario.torre@citify.test',
    'vecino.principal@citify.test',
    'familiar1@citify.test',
    'familiar2@citify.test',
    'familiar3@citify.test',
    'familiar4@citify.test',
    'propietario.central@citify.test',
    'vecino.central@citify.test'
  )
  order by p.role::text, p.email;
