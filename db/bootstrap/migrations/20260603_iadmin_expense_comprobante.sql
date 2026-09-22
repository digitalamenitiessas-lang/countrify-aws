-- GENERADO por scripts/db/build-schema.mjs desde db/migrations/20260603_iadmin_expense_comprobante.sql

-- Comprobante del gasto (tipo + número), para mostrarlo en el detalle de
-- egresos de la caja / liquidación, igual que el PDF de referencia.
-- Idempotente. El pago desde una cuenta ya se modela con iadmin_bank_movements
-- (movement_kind = 'expense_payment', expense_id + cash_account_id), así que
-- acá solo agregamos los campos de comprobante en el gasto.

alter table countrify.iadmin_expenses
  add column if not exists document_type text,
  add column if not exists document_number text;
