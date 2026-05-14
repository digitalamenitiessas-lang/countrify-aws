-- IAdmin simplificaciones: cuentas default + proveedor con categoria memorizada
-- Idempotente. Aditiva.

-- ----------------------------------------------------------------------------
-- 1. Proveedor memoriza categoria por defecto
-- ----------------------------------------------------------------------------
alter table public.iadmin_providers
  add column if not exists default_category text,
  add column if not exists default_description text;

-- ----------------------------------------------------------------------------
-- 2. Trigger: al crear un managed_property, crear 2 cuentas default
-- ----------------------------------------------------------------------------
create or replace function public.iadmin_create_default_cash_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
  values
    (new.id, 'Caja operativa', 'cash',  true, 'Cuenta creada automaticamente al dar de alta el consorcio.'),
    (new.id, 'Banco principal', 'bank', true, 'Cuenta creada automaticamente. Completa los datos bancarios desde Cuentas.')
  on conflict (managed_property_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists iadmin_mp_default_accounts on public.iadmin_managed_properties;
create trigger iadmin_mp_default_accounts
  after insert on public.iadmin_managed_properties
  for each row execute function public.iadmin_create_default_cash_accounts();

-- ----------------------------------------------------------------------------
-- 3. Back-fill: si hay managed_properties sin cuentas, crearselas
-- ----------------------------------------------------------------------------
insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
select mp.id, 'Caja operativa', 'cash', true, 'Cuenta creada automaticamente.'
from public.iadmin_managed_properties mp
where not exists (
  select 1 from public.iadmin_cash_accounts ca
  where ca.managed_property_id = mp.id and ca.name = 'Caja operativa'
)
on conflict (managed_property_id, name) do nothing;

insert into public.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
select mp.id, 'Banco principal', 'bank', true, 'Cuenta creada automaticamente.'
from public.iadmin_managed_properties mp
where not exists (
  select 1 from public.iadmin_cash_accounts ca
  where ca.managed_property_id = mp.id and ca.name = 'Banco principal'
)
on conflict (managed_property_id, name) do nothing;
