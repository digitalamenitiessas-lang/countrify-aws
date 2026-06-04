-- IAdmin ledger foundation:
--   * configuracion operativa persistente por consorcio
--   * ledger / cuenta corriente por unidad
--   * aplicaciones explicitas de pagos contra deuda

do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_ledger_entry_type') then
    create type public.iadmin_ledger_entry_type as enum (
      'expensa_ordinaria',
      'expensa_extraordinaria',
      'saldo_anterior_migrado',
      'recargo_mora',
      'pago',
      'ajuste_manual',
      'anulacion'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'iadmin_ledger_entry_status') then
    create type public.iadmin_ledger_entry_status as enum (
      'open',
      'partially_paid',
      'paid',
      'void'
    );
  end if;
end
$$;

alter table public.iadmin_managed_properties
  add column if not exists operational_settings jsonb not null default '{}'::jsonb;

create table if not exists public.iadmin_unit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid not null references public.iadmin_managed_properties(id) on delete cascade,
  unit_id uuid not null references public.iadmin_units(id) on delete cascade,
  accounting_period_id uuid references public.iadmin_accounting_periods(id) on delete set null,
  liquidation_run_id uuid references public.iadmin_liquidation_runs(id) on delete set null,
  liquidation_item_id uuid references public.iadmin_liquidation_items(id) on delete set null,
  payment_id uuid references public.iadmin_payments(id) on delete set null,
  entry_type public.iadmin_ledger_entry_type not null,
  origin_type text,
  origin_id uuid,
  description text,
  due_date date,
  amount numeric(14,2) not null check (amount >= 0),
  balance_open numeric(14,2) not null default 0 check (balance_open >= 0),
  status public.iadmin_ledger_entry_status not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text
);

create index if not exists iadmin_ledger_admin_idx
  on public.iadmin_unit_ledger_entries (administration_id, created_at desc);
create index if not exists iadmin_ledger_unit_idx
  on public.iadmin_unit_ledger_entries (unit_id, created_at asc);
create index if not exists iadmin_ledger_property_idx
  on public.iadmin_unit_ledger_entries (managed_property_id, created_at desc);
create index if not exists iadmin_ledger_run_idx
  on public.iadmin_unit_ledger_entries (liquidation_run_id);
create index if not exists iadmin_ledger_item_idx
  on public.iadmin_unit_ledger_entries (liquidation_item_id);
create index if not exists iadmin_ledger_payment_idx
  on public.iadmin_unit_ledger_entries (payment_id);
create index if not exists iadmin_ledger_open_idx
  on public.iadmin_unit_ledger_entries (administration_id, unit_id, due_date, created_at)
  where status in ('open', 'partially_paid');

create unique index if not exists iadmin_ledger_run_charge_unique
  on public.iadmin_unit_ledger_entries (liquidation_item_id, entry_type)
  where entry_type in ('expensa_ordinaria', 'expensa_extraordinaria', 'saldo_anterior_migrado');

create table if not exists public.iadmin_payment_applications (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references public.iadmin_administrations(id) on delete cascade,
  payment_id uuid not null references public.iadmin_payments(id) on delete cascade,
  payment_entry_id uuid not null references public.iadmin_unit_ledger_entries(id) on delete cascade,
  applied_to_entry_id uuid not null references public.iadmin_unit_ledger_entries(id) on delete cascade,
  unit_id uuid not null references public.iadmin_units(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text
);

create index if not exists iadmin_payment_applications_payment_idx
  on public.iadmin_payment_applications (payment_id, created_at asc)
  where voided_at is null;
create index if not exists iadmin_payment_applications_target_idx
  on public.iadmin_payment_applications (applied_to_entry_id, created_at asc)
  where voided_at is null;

alter table public.iadmin_unit_ledger_entries enable row level security;
alter table public.iadmin_payment_applications enable row level security;

drop policy if exists "iadmin_ledger select" on public.iadmin_unit_ledger_entries;
create policy "iadmin_ledger select" on public.iadmin_unit_ledger_entries
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  );

drop policy if exists "iadmin_ledger write" on public.iadmin_unit_ledger_entries;
create policy "iadmin_ledger write" on public.iadmin_unit_ledger_entries
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  );

drop policy if exists "iadmin_payment_applications select" on public.iadmin_payment_applications;
create policy "iadmin_payment_applications select" on public.iadmin_payment_applications
  for select to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  );

drop policy if exists "iadmin_payment_applications write" on public.iadmin_payment_applications;
create policy "iadmin_payment_applications write" on public.iadmin_payment_applications
  for all to authenticated
  using (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  )
  with check (
    public.current_user_role() = 'super_admin'
    or public.iadmin_user_belongs_to(administration_id)
  );
