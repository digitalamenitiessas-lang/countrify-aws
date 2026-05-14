-- Demo seed for local/staging testing in Supabase
-- Run this after:
--   supabase/migrations/20260415_initial.sql
--   supabase/migrations/20260416_consorcio_multi_building.sql
--   supabase/migrations/20260417_complaint_cases.sql
--   supabase/migrations/20260418_complaint_case_mentions.sql
--
-- Test password for every seeded user:
--   Test1234!

create extension if not exists "pgcrypto";

do $$
declare
  torre_id uuid;
  central_id uuid;
  bistro_id uuid;
  tech_id uuid;
  super_admin_id uuid;
  negocio_admin_id uuid;
  consorcio_admin_id uuid;
  vecino_1_id uuid;
  vecino_2_id uuid;
  ascensor_reason_id uuid;
  iluminacion_reason_id uuid;
  espacios_reason_id uuid;
  otros_reason_id uuid;
  case_1_id uuid;
  case_2_id uuid;
  case_3_id uuid;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'complaint_reason_catalog'
  ) then
    raise exception 'Debes ejecutar 20260417_complaint_cases.sql antes de 20260416_demo_users.sql.';
  end if;

  insert into public.buildings (name, address, total_units)
  values
    ('Torre del Parque', 'Av. Libertador 1234, CABA', 120),
    ('Edificio Central', 'Calle Corrientes 500, CABA', 85)
  on conflict do nothing;

  select id into torre_id from public.buildings where name = 'Torre del Parque' limit 1;
  select id into central_id from public.buildings where name = 'Edificio Central' limit 1;

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
      ('negocio@citify.test', 'Admin Negocio Demo'),
      ('consorcio@citify.test', 'Admin Consorcio Demo'),
      ('vecino1@citify.test', 'Vecina Demo Uno'),
      ('vecino2@citify.test', 'Vecino Demo Dos')
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
    'negocio@citify.test',
    'consorcio@citify.test',
    'vecino1@citify.test',
    'vecino2@citify.test'
  )
  on conflict (provider, provider_id) do nothing;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_text
  )
  select
    users.id,
    users.email,
    coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1)),
    upper(left(coalesce(users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1), 'U'), 2))
  from auth.users as users
  where users.email in (
    'superadmin@citify.test',
    'negocio@citify.test',
    'consorcio@citify.test',
    'vecino1@citify.test',
    'vecino2@citify.test'
  )
  on conflict (id) do nothing;

  select id into super_admin_id from auth.users where email = 'superadmin@citify.test' limit 1;
  select id into negocio_admin_id from auth.users where email = 'negocio@citify.test' limit 1;
  select id into consorcio_admin_id from auth.users where email = 'consorcio@citify.test' limit 1;
  select id into vecino_1_id from auth.users where email = 'vecino1@citify.test' limit 1;
  select id into vecino_2_id from auth.users where email = 'vecino2@citify.test' limit 1;

  insert into public.businesses (name, category, description, owner_profile_id)
  values
    ('Urban Bistro', 'Gastronomia', 'Restaurante demo para pruebas de promociones y carga de imagenes.', negocio_admin_id),
    ('Tech Haven', 'Tecnologia', 'Comercio demo adicional para poblar la plataforma.', negocio_admin_id)
  on conflict do nothing;

  select id into bistro_id from public.businesses where name = 'Urban Bistro' limit 1;
  select id into tech_id from public.businesses where name = 'Tech Haven' limit 1;
  select id into ascensor_reason_id from public.complaint_reason_catalog where slug = 'ascensor' limit 1;
  select id into iluminacion_reason_id from public.complaint_reason_catalog where slug = 'iluminacion' limit 1;
  select id into espacios_reason_id from public.complaint_reason_catalog where slug = 'espacios_comunes' limit 1;
  select id into otros_reason_id from public.complaint_reason_catalog where slug = 'otros' limit 1;

  update public.businesses
  set owner_profile_id = negocio_admin_id
  where id in (bistro_id, tech_id);

  update public.profiles
  set
    full_name = 'Super Admin CITIFY',
    role = 'super_admin',
    avatar_text = 'SA'
  where id = super_admin_id;

  update public.profiles
  set
    full_name = 'Admin Negocio Demo',
    role = 'negocio_admin',
    avatar_text = 'ND',
    business_id = bistro_id
  where id = negocio_admin_id;

  update public.profiles
  set
    full_name = 'Admin Consorcio Demo',
    role = 'consorcio_admin',
    avatar_text = 'CD',
    building_id = torre_id
  where id = consorcio_admin_id;

  insert into public.building_admin_assignments (profile_id, building_id, is_primary)
  values
    (consorcio_admin_id, torre_id, true),
    (consorcio_admin_id, central_id, false)
  on conflict (profile_id, building_id) do update
  set is_primary = excluded.is_primary;

  update public.profiles
  set
    full_name = 'Vecina Demo Uno',
    role = 'vecino',
    avatar_text = 'V1',
    building_id = torre_id,
    floor = '4',
    unit = 'B',
    phone = '+54 11 4000-1001'
  where id = vecino_1_id;

  update public.profiles
  set
    full_name = 'Vecino Demo Dos',
    role = 'vecino',
    avatar_text = 'V2',
    building_id = central_id,
    floor = '7',
    unit = 'A',
    phone = '+54 11 4000-1002'
  where id = vecino_2_id;

  insert into public.promotions (
    business_id,
    building_id,
    title,
    description,
    discount,
    category,
    expiration_date,
    is_active
  )
  values
    (
      bistro_id,
      null,
      '20% en brunch de fin de semana',
      'Promocion general para probar la landing, el panel de negocio y la billetera de cupones.',
      '20%',
      'Gastronomia',
      current_date + interval '90 days',
      true
    ),
    (
      bistro_id,
      torre_id,
      '2x1 exclusivo Torre del Parque',
      'Promocion exclusiva para validar RLS por edificio y vista vecinal filtrada.',
      '2x1',
      'Gastronomia',
      current_date + interval '60 days',
      true
    ),
    (
      tech_id,
      null,
      '10% en accesorios',
      'Promocion secundaria para poblar la grilla publica y el panel super admin.',
      '10%',
      'Tecnologia',
      current_date + interval '120 days',
      true
    )
  on conflict do nothing;

  insert into public.marketplace_items (
    seller_profile_id,
    building_id,
    title,
    description,
    price,
    condition,
    is_active
  )
  values
    (
      vecino_1_id,
      torre_id,
      'Silla ergonomica demo',
      'Publicacion de prueba para validar marketplace e imagenes.',
      45000,
      'Como Nuevo',
      true
  )
  on conflict do nothing;

  insert into public.complaint_cases (
    building_id,
    author_profile_id,
    title,
    description,
    status,
    other_reason_text,
    resolved_at
  )
  select *
  from (
    values
      (
        torre_id,
        vecino_1_id,
        'Ascensor principal con ruidos',
        'Hace dos dias que el ascensor de la torre hace un ruido fuerte al frenar entre pisos.',
        'nuevo'::public.complaint_case_status,
        null::text,
        null::timestamptz
      ),
      (
        torre_id,
        vecino_1_id,
        'Luces del hall intermitentes',
        'Las luces del hall de entrada se apagan a veces durante la noche.',
        'en_desarrollo'::public.complaint_case_status,
        'Sucede mas seguido cerca del ascensor del fondo.',
        null::timestamptz
      ),
      (
        central_id,
        vecino_2_id,
        'Puerta del SUM no cierra bien',
        'La puerta del salon de usos multiples queda trabada cuando hay humedad.',
        'resuelto'::public.complaint_case_status,
        null::text,
        now() - interval '2 days'
      )
  ) as seed(building_id, author_profile_id, title, description, status, other_reason_text, resolved_at)
  where not exists (
    select 1
    from public.complaint_cases existing
    where existing.building_id = seed.building_id
      and existing.author_profile_id = seed.author_profile_id
      and existing.title = seed.title
  );

  select id into case_1_id from public.complaint_cases where title = 'Ascensor principal con ruidos' limit 1;
  select id into case_2_id from public.complaint_cases where title = 'Luces del hall intermitentes' limit 1;
  select id into case_3_id from public.complaint_cases where title = 'Puerta del SUM no cierra bien' limit 1;

  insert into public.complaint_case_reasons (case_id, reason_id)
  values
    (case_1_id, ascensor_reason_id),
    (case_2_id, iluminacion_reason_id),
    (case_2_id, otros_reason_id),
    (case_3_id, espacios_reason_id)
  on conflict do nothing;

  insert into public.complaint_case_messages (case_id, author_profile_id, message, message_type)
  values
    (case_1_id, vecino_1_id, 'Lo reporte porque ya se detuvo dos veces esta semana.', 'comment'),
    (case_2_id, consorcio_admin_id, 'Ya avisamos al electricista y quedo en agenda para esta tarde. @Vecina Demo Uno (4 - B), si vuelve a pasar avisanos por aca.', 'status_note'),
    (case_3_id, consorcio_admin_id, 'Se ajusto el marco y quedo funcionando correctamente.', 'status_note')
  on conflict do nothing;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'complaint_case_message_mentions'
  ) then
    insert into public.complaint_case_message_mentions (message_id, mentioned_profile_id)
    select messages.id, vecino_1_id
    from public.complaint_case_messages messages
    where messages.case_id = case_2_id
      and messages.author_profile_id = consorcio_admin_id
      and messages.message like '%@Vecina Demo Uno%'
    on conflict do nothing;
  end if;
end
$$;

select
  email,
  role,
  full_name,
  building_id,
  business_id
from public.profiles
where email like '%@citify.test'
order by email;
