-- IAdmin Fase 3e: cuentas bancarias / caja por consorcio + pagos a proveedores
-- Idempotente. No rompe datos existentes.

-- ----------------------------------------------------------------------------
-- 1. iadmin_cash_accounts: una cuenta por consorcio (banco, caja chica, reserva)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_cash_account_kind') then
    create type public.iadmin_cash_account_kind as enum ('bank', 'cash', 'reserve', 'other');
  end if;
end
$$;

create table if not exists public.iadmin_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  name text not null,
  kind public.iadmin_cash_account_kind not null default 'bank',
  bank_name text,
  account_number text,
  cbu text,
  alias text,
  opening_balance numeric(14,2) not null default 0,
  opening_balance_at date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (managed_property_id, name)
);

create index if not exists iadmin_cash_accounts_property_idx
  on public.iadmin_cash_accounts (managed_property_id);
create index if not exists iadmin_cash_accounts_active_idx
  on public.iadmin_cash_accounts (is_active) where is_active = true;

-- Trigger updated_at
do $$
begin
  execute 'drop trigger if exists set_iadmin_cash_accounts_updated_at on public.iadmin_cash_accounts';
  execute 'create trigger set_iadmin_cash_accounts_updated_at before update on public.iadmin_cash_accounts for each row execute function public.set_updated_at()';
end
$$;

-- ----------------------------------------------------------------------------
-- 2. iadmin_bank_movements: ya existe, ampliamos con cash_account_id + expense_id
-- ----------------------------------------------------------------------------
alter table public.iadmin_bank_movements
  add column if not exists cash_account_id uuid references public.iadmin_cash_accounts(id) on delete set null,
  add column if not exists expense_id uuid references public.iadmin_expenses(id) on delete set null,
  add column if not exists movement_kind text not null default 'manual',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Constraint: movement_kind valido
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'iadmin_bank_movements_kind_check'
  ) then
    alter table public.iadmin_bank_movements
      add constraint iadmin_bank_movements_kind_check
      check (movement_kind in ('manual', 'expense_payment', 'collection', 'transfer', 'adjustment', 'opening'));
  end if;
end
$$;

create index if not exists iadmin_bank_movements_cash_account_idx
  on public.iadmin_bank_movements (cash_account_id);
create index if not exists iadmin_bank_movements_expense_idx
  on public.iadmin_bank_movements (expense_id);
create index if not exists iadmin_bank_movements_date_idx
  on public.iadmin_bank_movements (movement_date desc);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.iadmin_cash_accounts enable row level security;

drop policy if exists "iadmin_cash_accounts select" on public.iadmin_cash_accounts;
create policy "iadmin_cash_accounts select" on public.iadmin_cash_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

drop policy if exists "iadmin_cash_accounts write" on public.iadmin_cash_accounts;
create policy "iadmin_cash_accounts write" on public.iadmin_cash_accounts
  for all to authenticated
  using (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  )
  with check (
    exists (
      select 1 from public.iadmin_managed_properties mp
      where mp.id = managed_property_id
        and public.iadmin_user_belongs_to(mp.administration_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Capacidades
-- ----------------------------------------------------------------------------
insert into public.iadmin_capabilities (code, description) values
  ('cash_accounts.manage', 'Gestionar cuentas bancarias y caja'),
  ('cash_accounts.view',   'Ver cuentas bancarias y movimientos'),
  ('expenses.mark_paid',   'Marcar gasto como pagado al proveedor')
on conflict (code) do update set description = excluded.description;
