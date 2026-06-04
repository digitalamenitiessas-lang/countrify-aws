-- Enforcar regla de negocio: solo una cuenta de caja/banco activa por consorcio.
-- La cuenta activa es la que se incluye en el mensaje de liquidacion.
-- Si en el futuro queremos multi-cuenta, hay que repensar el mail tambien.

-- Compactar estado actual: si por dato historico existe mas de una cuenta
-- activa por propiedad, dejamos activa solo la mas reciente y archivamos las
-- demas para que el indice unico no falle al crearse.
with ranked as (
  select id,
         row_number() over (
           partition by managed_property_id
           order by created_at desc, id desc
         ) as rk
    from countrify.iadmin_cash_accounts
   where is_active = true
)
update countrify.iadmin_cash_accounts ca
   set is_active = false
  from ranked r
 where ca.id = r.id and r.rk > 1;

create unique index if not exists iadmin_cash_accounts_one_active_per_property
  on countrify.iadmin_cash_accounts (managed_property_id)
  where is_active = true;
