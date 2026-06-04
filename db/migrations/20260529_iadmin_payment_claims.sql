-- Payment claims: el vecino reporta que pagó (transferencia/efectivo) y sube un
-- comprobante. El admin del consorcio luego valida y, al validar, se crea el
-- pago real en iadmin_payments. Mientras está pendiente, no afecta el saldo.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'iadmin_payment_claim_status') then
    create type countrify.iadmin_payment_claim_status as enum (
      'pending',
      'validated',
      'rejected'
    );
  end if;
end
$$;

create table if not exists countrify.iadmin_payment_claims (
  id uuid primary key default gen_random_uuid(),
  administration_id uuid not null references countrify.iadmin_administrations(id) on delete cascade,
  managed_property_id uuid not null references countrify.iadmin_managed_properties(id) on delete cascade,
  unit_id uuid not null references countrify.iadmin_units(id) on delete cascade,
  liquidation_item_id uuid references countrify.iadmin_liquidation_items(id) on delete set null,
  reporter_profile_id uuid not null references countrify.profiles(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at_claimed date not null,
  method text,
  reference text,
  notes text,
  document_object_key text,
  status countrify.iadmin_payment_claim_status not null default 'pending',
  validated_by uuid references countrify.profiles(id) on delete set null,
  validated_at timestamptz,
  rejected_reason text,
  payment_id uuid references countrify.iadmin_payments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists iadmin_payment_claims_admin_pending_idx
  on countrify.iadmin_payment_claims (administration_id, status, created_at desc);

create index if not exists iadmin_payment_claims_unit_idx
  on countrify.iadmin_payment_claims (unit_id, created_at desc);

create index if not exists iadmin_payment_claims_reporter_idx
  on countrify.iadmin_payment_claims (reporter_profile_id, created_at desc);

alter table countrify.iadmin_payment_claims enable row level security;

-- Lectura: el reportante (vecino dueño del claim), miembros de la admin del
-- consorcio y super_admin.
drop policy if exists "iadmin_payment_claims select" on countrify.iadmin_payment_claims;
create policy "iadmin_payment_claims select" on countrify.iadmin_payment_claims
  for select to authenticated
  using (
    countrify.current_user_role() = 'super_admin'
    or countrify.iadmin_user_belongs_to(administration_id)
    or reporter_profile_id = auth.uid()
  );

-- Insert: solo el vecino (reporter_profile_id = auth.uid()) o el admin.
drop policy if exists "iadmin_payment_claims insert" on countrify.iadmin_payment_claims;
create policy "iadmin_payment_claims insert" on countrify.iadmin_payment_claims
  for insert to authenticated
  with check (
    countrify.current_user_role() = 'super_admin'
    or countrify.iadmin_user_belongs_to(administration_id)
    or reporter_profile_id = auth.uid()
  );

-- Update: solo admin/super (validar/rechazar). El vecino no edita su claim
-- una vez enviado.
drop policy if exists "iadmin_payment_claims update" on countrify.iadmin_payment_claims;
create policy "iadmin_payment_claims update" on countrify.iadmin_payment_claims
  for update to authenticated
  using (
    countrify.current_user_role() = 'super_admin'
    or countrify.iadmin_user_belongs_to(administration_id)
  )
  with check (
    countrify.current_user_role() = 'super_admin'
    or countrify.iadmin_user_belongs_to(administration_id)
  );
