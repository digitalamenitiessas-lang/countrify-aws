-- IAdmin Fase 4: cobranzas reales con N° de recibo secuencial
-- Idempotente. Aditiva. No rompe datos existentes.

-- ----------------------------------------------------------------------------
-- 1. Numeracion de recibos por administracion
-- ----------------------------------------------------------------------------
alter table public.iadmin_administrations
  add column if not exists receipt_prefix text not null default '01',
  add column if not exists receipt_next_number integer not null default 1;

-- Funcion atomica que devuelve el proximo N° y lo incrementa.
-- Usa language sql para evitar el parser de plpgsql con SELECT INTO.
create or replace function public.iadmin_next_receipt_number(admin_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  update public.iadmin_administrations
    set receipt_next_number = receipt_next_number + 1
    where id = admin_id
    returning coalesce(receipt_prefix, '01') || '-' || lpad((receipt_next_number - 1)::text, 4, '0');
$$;

-- ----------------------------------------------------------------------------
-- 2. Ampliacion de iadmin_payments
-- ----------------------------------------------------------------------------
alter table public.iadmin_payments
  add column if not exists administration_id uuid references public.iadmin_administrations(id) on delete cascade,
  add column if not exists managed_property_id uuid references public.iadmin_managed_properties(id) on delete cascade,
  add column if not exists cash_account_id uuid references public.iadmin_cash_accounts(id) on delete set null,
  add column if not exists bank_movement_id uuid references public.iadmin_bank_movements(id) on delete set null,
  add column if not exists liquidation_run_id uuid references public.iadmin_liquidation_runs(id) on delete set null,
  add column if not exists receipt_number text,
  add column if not exists due_label text,
  add column if not exists surcharge_amount numeric(14,2) not null default 0,
  add column if not exists notes text,
  add column if not exists is_void boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists void_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Unique receipt_number por administracion cuando no es void
create unique index if not exists iadmin_payments_receipt_unique
  on public.iadmin_payments (administration_id, receipt_number)
  where receipt_number is not null and is_void = false;

create index if not exists iadmin_payments_item_idx
  on public.iadmin_payments (liquidation_item_id)
  where is_void = false;
create index if not exists iadmin_payments_unit_idx
  on public.iadmin_payments (unit_id, paid_at desc);
create index if not exists iadmin_payments_admin_idx
  on public.iadmin_payments (administration_id, paid_at desc);

-- ----------------------------------------------------------------------------
-- 3. RLS sobre iadmin_payments (si no existia ya)
-- ----------------------------------------------------------------------------
alter table public.iadmin_payments enable row level security;

drop policy if exists "iadmin_payments select" on public.iadmin_payments;
create policy "iadmin_payments select" on public.iadmin_payments
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  );

drop policy if exists "iadmin_payments write" on public.iadmin_payments;
create policy "iadmin_payments write" on public.iadmin_payments
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  )
  with check (
    public.current_user_role() = 'super_admin'
    or (administration_id is not null and public.iadmin_user_belongs_to(administration_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Capacidades nuevas
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('collections.register', 'Registrar pagos de vecinos'),
  ('collections.void',     'Anular pagos')
on conflict (code) do update set description = excluded.description;
