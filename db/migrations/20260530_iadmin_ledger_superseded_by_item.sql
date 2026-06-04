-- Migración: superseded_by_item_id en iadmin_unit_ledger_entries
--
-- Contexto: cuando se emite un período nuevo, los recargos por mora abiertos
-- de períodos anteriores se "absorben" en el `previous_balance` del item
-- nuevo para que aparezcan en el recibo del vecino. Sin esta columna, los
-- recargos viejos seguían `open` en el ledger y se contaban dos veces (en
-- `late_fee_overdue` Y en el `previous_balance` del item nuevo, vía
-- `historical_item_overdue`), inflando el card "Morosidad acumulada" del
-- dashboard.
--
-- Con esta columna:
--   * `emitAndNotify` setea `superseded_by_item_id = <nuevo_item.id>` en
--     cada recargo absorbido.
--   * El materializer (`materializeLateFeesForUnitInPostgres`) ignora los
--     supersedidos cuando computa `existing_surcharge`, así no los re-genera.
--   * El CTE `late_fee_overdue` del overview los excluye.
--   * `on delete set null` en el FK del item: si se borra el item absorbente
--     (típicamente en un re-emit), los recargos vuelven a quedar libres y se
--     re-absorben en la próxima emisión.

alter table countrify.iadmin_unit_ledger_entries
  add column if not exists superseded_by_item_id uuid
  references countrify.iadmin_liquidation_items(id) on delete set null;

create index if not exists iadmin_ledger_superseded_by_item_idx
  on countrify.iadmin_unit_ledger_entries (superseded_by_item_id)
  where superseded_by_item_id is not null;
