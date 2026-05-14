-- Cleanup + re-bootstrap limpio para IAdmin
-- Idempotente. Borra toda la data iadmin_* y la recrea sin duplicados.
-- No toca buildings, profiles ni otras tablas del producto base.

-- 1. Borrar toda la data iadmin_* (cascade desde iadmin_administrations)
delete from public.iadmin_administrations;
delete from public.iadmin_audit_logs where administration_id is null;

-- 2. Asegurar rol del usuario
insert into public.profiles (id, email, full_name, avatar_text, role)
select u.id, u.email,
       coalesce(u.raw_user_meta_data->>'full_name', 'Administrador'),
       'AD',
       'consorcio_admin'::public.app_role
from auth.users u
where u.email = 'administrador@citify.test'
on conflict (id) do update
  set role = 'consorcio_admin'::public.app_role;

-- 3. Administracion Demo unica
insert into public.iadmin_administrations (name, legal_name, tax_id, contact_email, contact_phone, is_active)
values ('Administracion Demo', 'Administracion Demo SRL', '30-12345678-9', 'ops@demo.admin', '+54 9 11 5555-0000', true);

-- 4. Managed properties usando el building MAS VIEJO por nombre
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
cross join (
  select distinct on (name) id, name
  from public.buildings
  where name in ('Torre del Parque', 'Edificio Central')
  order by name, created_at asc
) b
where a.name = 'Administracion Demo';

-- 5. Role grant titular
insert into public.iadmin_role_grants (administration_id, profile_id, operational_role, is_primary)
select a.id, p.id, 'titular', true
from public.iadmin_administrations a, public.profiles p
where a.name = 'Administracion Demo'
  and p.email = 'administrador@citify.test';

-- 6. Unidades con alicuotas que suman 100%
insert into public.iadmin_units (managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active)
select mp.id, u.code, u.kind::public.iadmin_unit_kind, u.floor,
       u.surface_m2::numeric, u.prorata_coefficient::numeric, true
from public.iadmin_managed_properties mp
join public.buildings b on b.id = mp.building_id
join (values
  -- Torre del Parque: 0.125 + 0.125 + 0.200 + 0.200 + 0.350 = 1.000
  ('Torre del Parque', '1A', 'departamento', '1',  65.00, 0.125),
  ('Torre del Parque', '1B', 'departamento', '1',  65.00, 0.125),
  ('Torre del Parque', '2A', 'departamento', '2',  80.00, 0.200),
  ('Torre del Parque', '2B', 'departamento', '2',  80.00, 0.200),
  ('Torre del Parque', 'PH', 'departamento', 'PH', 120.00, 0.350),
  -- Edificio Central: 0.33 + 0.33 + 0.34 = 1.00
  ('Edificio Central', '101', 'departamento', '10', 55.00, 0.33),
  ('Edificio Central', '102', 'departamento', '10', 55.00, 0.33),
  ('Edificio Central', 'L1',  'local',        'PB', 40.00, 0.34)
) as u(building_name, code, kind, floor, surface_m2, prorata_coefficient)
  on u.building_name = b.name;

-- 7. Un titular activo
insert into public.iadmin_unit_holders (unit_id, full_name, holder_kind, email, start_date, is_active)
select u.id, 'Juan Perez', 'propietario'::public.iadmin_holder_kind, 'juan.perez@demo.test',
       (current_date - interval '1 year')::date, true
from public.iadmin_units u
join public.iadmin_managed_properties mp on mp.id = u.managed_property_id
join public.buildings b on b.id = mp.building_id
where b.name = 'Torre del Parque' and u.code = '1A';

-- 8. Periodo contable del mes en curso, abierto
insert into public.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
select mp.id, extract(year from now())::int, extract(month from now())::int, 'open'::public.iadmin_period_status
from public.iadmin_managed_properties mp
join public.buildings b on b.id = mp.building_id
where b.name = 'Torre del Parque';

-- 9. Proveedor
insert into public.iadmin_providers (administration_id, name, tax_id, category, email, is_active)
select a.id, 'Ascensores Uno SA', '30-99999999-9', 'Mantenimiento',
       'facturacion@ascensoresuno.test', true
from public.iadmin_administrations a
where a.name = 'Administracion Demo';

-- 10. Gasto pending_review
insert into public.iadmin_expenses (
  administration_id, managed_property_id, accounting_period_id, provider_id,
  category, description, amount, currency, issued_at, status, created_by
)
select
  a.id, mp.id, ap.id, pr.id,
  'Mantenimiento', 'Factura mensual mantenimiento ascensor torre norte',
  185000.00, 'ARS',
  (current_date - interval '5 days')::date,
  'pending_review'::public.iadmin_expense_status,
  p.id
from public.iadmin_administrations a
join public.iadmin_managed_properties mp on mp.administration_id = a.id
join public.buildings b on b.id = mp.building_id
join public.iadmin_accounting_periods ap on ap.managed_property_id = mp.id
join public.iadmin_providers pr on pr.administration_id = a.id and pr.name = 'Ascensores Uno SA'
join public.profiles p on p.email = 'administrador@citify.test'
where a.name = 'Administracion Demo' and b.name = 'Torre del Parque';

-- Verificacion
select
  (select count(*) from public.iadmin_administrations) as admins,
  (select count(*) from public.iadmin_managed_properties) as props,
  (select count(*) from public.iadmin_units) as units,
  (select count(*) from public.iadmin_providers) as providers,
  (select count(*) from public.iadmin_expenses) as expenses,
  (select count(*) from public.iadmin_role_grants
     join public.profiles on profiles.id = iadmin_role_grants.profile_id
     where profiles.email = 'administrador@citify.test') as my_grants;
-- Esperado: 1 admin, 2 props, 8 units, 1 provider, 1 expense, 1 grant
