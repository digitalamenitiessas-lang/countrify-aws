-- IAdmin bootstrap para administrador@citify.test
-- Idempotente. Pegar completo en el SQL editor del proyecto Supabase.
-- Requiere:
--   * Migraciones aplicadas (20260415..20260417_iadmin_core)
--   * El usuario administrador@citify.test creado desde Authentication > Users

-- 1. Upgrade rol del profile (cubre caso sin trigger y con trigger)
insert into public.profiles (id, email, full_name, avatar_text, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', 'Administrador'),
  'AD',
  'consorcio_admin'::public.app_role
from auth.users u
where u.email = 'administrador@citify.test'
on conflict (id) do update
  set role = 'consorcio_admin'::public.app_role,
      full_name = excluded.full_name,
      avatar_text = excluded.avatar_text;

-- 2. Edificios base (si no existen)
insert into public.buildings (name, address, total_units)
values
  ('Torre del Parque', 'Av. Libertador 1234, CABA', 120),
  ('Edificio Central', 'Calle Corrientes 500, CABA', 85)
on conflict do nothing;

-- 3. Administracion raiz
insert into public.iadmin_administrations (name, legal_name, tax_id, contact_email, contact_phone, is_active)
select 'Administracion Demo', 'Administracion Demo SRL', '30-12345678-9', 'ops@demo.admin', '+54 9 11 5555-0000', true
where not exists (
  select 1 from public.iadmin_administrations where name = 'Administracion Demo'
);

-- 4. Managed properties (envoltorio de buildings existentes)
insert into public.iadmin_managed_properties (
  administration_id, building_id, display_name, property_kind,
  tax_id, managed_since, management_fee_pct, is_active
)
select
  a.id,
  b.id,
  b.name,
  'consorcio'::public.iadmin_property_kind,
  case when b.name = 'Torre del Parque' then '30-11111111-1' else '30-22222222-2' end,
  (current_date - interval '1 year')::date,
  5.0,
  true
from public.iadmin_administrations a
cross join public.buildings b
where a.name = 'Administracion Demo'
  and b.name in ('Torre del Parque', 'Edificio Central')
on conflict (administration_id, building_id) do update set is_active = true;

-- 5. Role grant titular para administrador@citify.test
insert into public.iadmin_role_grants (administration_id, profile_id, operational_role, is_primary)
select a.id, p.id, 'titular', true
from public.iadmin_administrations a, public.profiles p
where a.name = 'Administracion Demo'
  and p.email = 'administrador@citify.test'
on conflict (administration_id, profile_id) do update
  set operational_role = excluded.operational_role, is_primary = excluded.is_primary;

-- 6. Unidades demo
insert into public.iadmin_units (managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active)
select
  mp.id,
  u.code,
  u.kind::public.iadmin_unit_kind,
  u.floor,
  u.surface_m2::numeric,
  u.prorata_coefficient::numeric,
  true
from public.iadmin_managed_properties mp
join public.buildings b on b.id = mp.building_id
join (values
  ('Torre del Parque', '1A', 'departamento', '1', 65.00, 0.125),
  ('Torre del Parque', '1B', 'departamento', '1', 65.00, 0.125),
  ('Torre del Parque', '2A', 'departamento', '2', 80.00, 0.150),
  ('Torre del Parque', '2B', 'departamento', '2', 80.00, 0.150),
  ('Torre del Parque', 'PH', 'departamento', 'PH', 120.00, 0.200),
  ('Edificio Central', '101', 'departamento', '10', 55.00, 0.33),
  ('Edificio Central', '102', 'departamento', '10', 55.00, 0.33),
  ('Edificio Central', 'L1', 'local', 'PB', 40.00, 0.34)
) as u(building_name, code, kind, floor, surface_m2, prorata_coefficient)
  on u.building_name = b.name
on conflict (managed_property_id, code) do nothing;

-- 7. Titular activo para unidad 1A (Torre del Parque)
insert into public.iadmin_unit_holders (unit_id, full_name, holder_kind, email, start_date, is_active)
select u.id, 'Juan Perez', 'propietario'::public.iadmin_holder_kind, 'juan.perez@demo.test',
       (current_date - interval '1 year')::date, true
from public.iadmin_units u
join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
join public.buildings b on b.id = mp.building_id
where b.name = 'Torre del Parque' and u.code = '1A'
  and not exists (
    select 1 from public.iadmin_unit_holders h
    where h.unit_id = u.id and h.full_name = 'Juan Perez'
  );

-- 8. Periodo contable del mes en curso para Torre del Parque
insert into public.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
select mp.id, extract(year from now())::int, extract(month from now())::int, 'open'::public.iadmin_period_status
from public.iadmin_managed_properties mp
join public.buildings b on b.id = mp.building_id
where b.name = 'Torre del Parque'
on conflict (managed_property_id, period_year, period_month) do nothing;

-- 9. Proveedor
insert into public.iadmin_providers (administration_id, name, tax_id, category, email, is_active)
select a.id, 'Ascensores Uno SA', '30-99999999-9', 'Mantenimiento', 'facturacion@ascensoresuno.test', true
from public.iadmin_administrations a
where a.name = 'Administracion Demo'
  and not exists (
    select 1 from public.iadmin_providers p
    where p.administration_id = a.id and p.name = 'Ascensores Uno SA'
  );

-- 10. Gasto en pending_review
insert into public.iadmin_expenses (
  administration_id, managed_property_id, accounting_period_id, provider_id,
  category, description, amount, currency, issued_at, status, created_by
)
select
  a.id,
  mp.id,
  ap.id,
  pr.id,
  'Mantenimiento',
  'Factura mensual mantenimiento ascensor torre norte',
  185000.00,
  'ARS',
  (current_date - interval '5 days')::date,
  'pending_review'::public.iadmin_expense_status,
  p.id
from public.iadmin_administrations a
join public.iadmin_managed_properties mp on mp.administration_id = a.id
join public.buildings b on b.id = mp.building_id
join public.iadmin_accounting_periods ap on ap.managed_property_id = mp.id
  and ap.period_year = extract(year from now())::int
  and ap.period_month = extract(month from now())::int
join public.iadmin_providers pr on pr.administration_id = a.id and pr.name = 'Ascensores Uno SA'
join public.profiles p on p.email = 'administrador@citify.test'
where a.name = 'Administracion Demo'
  and b.name = 'Torre del Parque'
  and not exists (
    select 1 from public.iadmin_expenses e
    where e.administration_id = a.id
      and e.description = 'Factura mensual mantenimiento ascensor torre norte'
  );

-- 11. Documento del gasto
insert into public.iadmin_expense_documents (expense_id, storage_path, file_name, mime_type, uploaded_by)
select
  e.id,
  e.administration_id::text || '/' || e.id::text || '/factura-demo.pdf',
  'factura-demo.pdf',
  'application/pdf',
  p.id
from public.iadmin_expenses e
join public.profiles p on p.email = 'administrador@citify.test'
where e.description = 'Factura mensual mantenimiento ascensor torre norte'
  and not exists (
    select 1 from public.iadmin_expense_documents d
    where d.expense_id = e.id and d.file_name = 'factura-demo.pdf'
  );

-- 12. Extraccion IA sugerida
insert into public.iadmin_ai_document_extractions (document_id, status, provider, suggested_fields, confidence)
select
  d.id,
  'suggested'::public.iadmin_ai_extraction_status,
  'demo',
  jsonb_build_object(
    'provider_name', 'Ascensores Uno SA',
    'amount', 185000,
    'currency', 'ARS',
    'issued_at', (current_date - interval '5 days')::text,
    'category', 'Mantenimiento'
  ),
  87.50
from public.iadmin_expense_documents d
where d.file_name = 'factura-demo.pdf'
on conflict (document_id) do nothing;
