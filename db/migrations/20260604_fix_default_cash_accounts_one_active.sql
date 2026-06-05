-- Fix de compatibilidad: el trigger countrify.iadmin_create_default_cash_accounts
-- (pre-fork) creaba DOS cuentas activas por consorcio ('Caja operativa' y
-- 'Banco principal'). El refactor agrego la constraint
-- iadmin_cash_accounts_one_active_per_property (una sola cuenta activa por
-- propiedad), por lo que el alta de consorcio fallaba con
-- "duplicate key value violates unique constraint".
--
-- Dejamos activa solo 'Caja operativa'; 'Banco principal' se crea inactiva y se
-- activa manualmente desde Cuentas cuando se cargan los datos bancarios.

create or replace function countrify.iadmin_create_default_cash_accounts()
returns trigger
language plpgsql
security definer
set search_path = countrify, public
as $$
begin
  insert into countrify.iadmin_cash_accounts (managed_property_id, name, kind, is_active, notes)
  values
    (new.id, 'Caja operativa', 'cash',  true,  'Cuenta creada automaticamente al dar de alta el consorcio.'),
    (new.id, 'Banco principal', 'bank', false, 'Cuenta creada automaticamente. Completa los datos bancarios y activala desde Cuentas.')
  on conflict (managed_property_id, name) do nothing;
  return new;
end;
$$;
