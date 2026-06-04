-- Migración: cargos particulares por unidad (gastos no prorrateados)
--
-- Contexto: hasta ahora todo gasto imputado a un período se prorrateaba entre
-- todas las unidades por su alícuota. Las administraciones reales también
-- cargan gastos que corresponden a UNA sola unidad (ej. VERIFICACION_OBRA,
-- APROBACION_PLANO) y aparecen en la columna "OTROS" del boletín, sumando solo
-- al total de esa unidad.
--
-- Modelo: un gasto particular es un `iadmin_expenses` normal con `unit_id`
-- seteado. `unit_id = null` → prorrateado (comportamiento actual). `unit_id`
-- con valor → va entero a esa unidad como cargo particular.
--
--   * `emitAndNotify` separa gastos prorrateables (unit_id null) de
--     particulares (unit_id set), suma estos por unidad y los guarda en
--     `iadmin_liquidation_items.particular_amount`.
--   * `createLedgerEntriesForIssuedRunInPostgres` inserta un asiento
--     `cargo_particular` por unidad cuando particular_amount > 0, así entra al
--     saldo y arrastra como deuda igual que las expensas.

-- 1. unit_id opcional en gastos. on delete set null: si se borra la unidad,
--    el gasto deja de ser particular (no se pierde el registro contable).
alter table countrify.iadmin_expenses
  add column if not exists unit_id uuid
  references countrify.iadmin_units(id) on delete set null;

create index if not exists iadmin_expenses_unit_idx
  on countrify.iadmin_expenses (unit_id)
  where unit_id is not null;

-- 2. monto particular por item de liquidación (no prorrateado).
alter table countrify.iadmin_liquidation_items
  add column if not exists particular_amount numeric(14,2) not null default 0
  check (particular_amount >= 0);

-- 3. nuevo tipo de asiento en el ledger. ADD VALUE IF NOT EXISTS es seguro
--    mientras no se use el valor en esta misma migración (PG 12+).
alter type countrify.iadmin_ledger_entry_type add value if not exists 'cargo_particular';
