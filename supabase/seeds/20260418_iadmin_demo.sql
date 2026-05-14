-- IAdmin demo seed. Crea:
--   * Administracion "Administracion Demo"
--   * Managed properties atadas a los edificios existentes
--   * Grant de rol 'titular' al consorcio_admin demo (consorcio@citify.test)
--   * Unidades de ejemplo con alicuota
--   * Periodo contable del mes en curso
--   * Proveedor, gasto en borrador y documento con extraccion pendiente
--
-- Requiere haber corrido previamente:
--   supabase/migrations/20260415_initial.sql
--   supabase/migrations/20260416_consorcio_multi_building.sql
--   supabase/migrations/20260417_complaint_cases.sql
--   supabase/migrations/20260418_complaint_case_mentions.sql
--   supabase/migrations/20260417_iadmin_core.sql
--   supabase/seeds/20260416_demo_users.sql

do $$
declare
  admin_id uuid;
  torre_id uuid;
  central_id uuid;
  consorcio_admin_id uuid;
  prop_torre_id uuid;
  prop_central_id uuid;
  unit_a uuid;
  unit_b uuid;
  period_id uuid;
  provider_id uuid;
  expense_id uuid;
  document_id uuid;
  current_year integer := extract(year from now())::integer;
  current_month integer := extract(month from now())::integer;
begin
  select id into torre_id from public.buildings where name = 'Torre del Parque' limit 1;
  select id into central_id from public.buildings where name = 'Edificio Central' limit 1;
  select id into consorcio_admin_id from auth.users where email = 'consorcio@citify.test' limit 1;

  if torre_id is null or central_id is null then
    raise notice 'IAdmin seed: faltan edificios demo, abortando.';
    return;
  end if;

  -- Administracion raiz
  insert into public.iadmin_administrations (name, legal_name, tax_id, contact_email, contact_phone, is_active)
  values ('Administracion Demo', 'Administracion Demo SRL', '30-12345678-9', 'ops@demo.admin', '+54 9 11 5555-0000', true)
  on conflict do nothing;

  select id into admin_id from public.iadmin_administrations where name = 'Administracion Demo' limit 1;

  -- Grant titular al consorcio admin demo (si existe)
  if consorcio_admin_id is not null then
    insert into public.iadmin_role_grants (administration_id, profile_id, operational_role, is_primary)
    values (admin_id, consorcio_admin_id, 'titular', true)
    on conflict (administration_id, profile_id) do update set operational_role = excluded.operational_role, is_primary = true;
  end if;

  -- Managed properties (envoltorio de buildings existentes)
  insert into public.iadmin_managed_properties (administration_id, building_id, display_name, property_kind, tax_id, managed_since, management_fee_pct, is_active)
  values
    (admin_id, torre_id,   'Torre del Parque',   'consorcio', '30-11111111-1', current_date - interval '2 years', 5.0, true),
    (admin_id, central_id, 'Edificio Central',   'edificio',  '30-22222222-2', current_date - interval '1 year',  4.5, true)
  on conflict (administration_id, building_id) do update set is_active = true;

  select id into prop_torre_id from public.iadmin_managed_properties where administration_id = admin_id and building_id = torre_id;
  select id into prop_central_id from public.iadmin_managed_properties where administration_id = admin_id and building_id = central_id;

  -- Unidades de la Torre
  insert into public.iadmin_units (managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active)
  values
    (prop_torre_id, '1A', 'departamento', '1', 65.00, 0.125, true),
    (prop_torre_id, '1B', 'departamento', '1', 65.00, 0.125, true),
    (prop_torre_id, '2A', 'departamento', '2', 80.00, 0.150, true),
    (prop_torre_id, '2B', 'departamento', '2', 80.00, 0.150, true),
    (prop_torre_id, 'PH', 'departamento', 'PH', 120.00, 0.200, true)
  on conflict (managed_property_id, code) do nothing;

  -- Unidades del Central
  insert into public.iadmin_units (managed_property_id, code, kind, floor, surface_m2, prorata_coefficient, is_active)
  values
    (prop_central_id, '101', 'departamento', '10', 55.00, 0.33, true),
    (prop_central_id, '102', 'departamento', '10', 55.00, 0.33, true),
    (prop_central_id, 'L1',  'local',        'PB', 40.00, 0.34, true)
  on conflict (managed_property_id, code) do nothing;

  select id into unit_a from public.iadmin_units where managed_property_id = prop_torre_id and code = '1A';
  select id into unit_b from public.iadmin_units where managed_property_id = prop_torre_id and code = '2A';

  if unit_a is not null then
    insert into public.iadmin_unit_holders (unit_id, full_name, holder_kind, email, start_date, is_active)
    values (unit_a, 'Juan Perez', 'propietario', 'juan.perez@demo.test', current_date - interval '1 year', true)
    on conflict do nothing;
  end if;

  if unit_b is not null then
    insert into public.iadmin_unit_holders (unit_id, full_name, holder_kind, email, phone, start_date, is_active)
    values (unit_b, 'Laura Gomez', 'inquilino', 'laura.gomez@demo.test', '+54 9 11 4444-3333', current_date - interval '6 months', true)
    on conflict do nothing;
  end if;

  -- Periodo contable del mes en curso
  insert into public.iadmin_accounting_periods (managed_property_id, period_year, period_month, status)
  values (prop_torre_id, current_year, current_month, 'open')
  on conflict (managed_property_id, period_year, period_month) do nothing;

  select id into period_id from public.iadmin_accounting_periods
    where managed_property_id = prop_torre_id and period_year = current_year and period_month = current_month;

  -- Proveedor + gasto de ejemplo
  insert into public.iadmin_providers (administration_id, name, tax_id, category, email)
  values (admin_id, 'Ascensores Uno SA', '30-99999999-9', 'Mantenimiento', 'facturacion@ascensoresuno.test')
  on conflict do nothing;

  select id into provider_id from public.iadmin_providers where administration_id = admin_id and name = 'Ascensores Uno SA' limit 1;

  insert into public.iadmin_expenses (
    administration_id, managed_property_id, accounting_period_id, provider_id,
    category, description, amount, currency, issued_at, status, created_by
  )
  values (
    admin_id, prop_torre_id, period_id, provider_id,
    'Mantenimiento', 'Factura mensual mantenimiento ascensor torre norte', 185000.00, 'ARS',
    current_date - interval '5 days', 'pending_review', consorcio_admin_id
  )
  on conflict do nothing
  returning id into expense_id;

  if expense_id is null then
    select id into expense_id from public.iadmin_expenses
      where administration_id = admin_id
        and description = 'Factura mensual mantenimiento ascensor torre norte'
      limit 1;
  end if;

  -- Documento + extraccion IA pendiente
  if expense_id is not null then
    insert into public.iadmin_expense_documents (expense_id, storage_path, file_name, mime_type, uploaded_by)
    values (expense_id, admin_id::text || '/' || expense_id::text || '/factura-demo.pdf', 'factura-demo.pdf', 'application/pdf', consorcio_admin_id)
    on conflict do nothing
    returning id into document_id;

    if document_id is null then
      select id into document_id from public.iadmin_expense_documents
        where expense_id = expense_id and file_name = 'factura-demo.pdf' limit 1;
    end if;

    if document_id is not null then
      insert into public.iadmin_ai_document_extractions (document_id, status, provider, suggested_fields, confidence)
      values (
        document_id,
        'suggested',
        'demo',
        jsonb_build_object(
          'provider_name', 'Ascensores Uno SA',
          'amount', 185000,
          'currency', 'ARS',
          'issued_at', (current_date - interval '5 days')::text,
          'category', 'Mantenimiento'
        ),
        87.50
      )
      on conflict (document_id) do nothing;
    end if;
  end if;
end
$$;
