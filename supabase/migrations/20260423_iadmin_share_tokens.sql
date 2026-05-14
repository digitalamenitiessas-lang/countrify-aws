-- IAdmin Fase 4b: tokens públicos para compartir liquidación con el vecino
-- Idempotente. Aditiva.

create extension if not exists "pgcrypto";

create table if not exists public.iadmin_item_share_tokens (
  id uuid primary key default gen_random_uuid(),
  liquidation_item_id uuid not null references public.iadmin_liquidation_items(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  access_count integer not null default 0,
  last_accessed_at timestamptz
);

create index if not exists iadmin_item_share_tokens_item_idx
  on public.iadmin_item_share_tokens (liquidation_item_id) where revoked_at is null;

-- RLS
alter table public.iadmin_item_share_tokens enable row level security;

drop policy if exists "iadmin_share_tokens select" on public.iadmin_item_share_tokens;
create policy "iadmin_share_tokens select" on public.iadmin_item_share_tokens
  for select to authenticated
  using (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  );

drop policy if exists "iadmin_share_tokens write" on public.iadmin_item_share_tokens;
create policy "iadmin_share_tokens write" on public.iadmin_item_share_tokens
  for all to authenticated
  using (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  )
  with check (
    exists (
      select 1
      from public.iadmin_liquidation_items li
      join public.iadmin_liquidation_runs lr on lr.id = li.liquidation_run_id
      where li.id = liquidation_item_id
        and public.iadmin_user_belongs_to(lr.administration_id)
    )
  );

-- Capacidad nueva
insert into public.iadmin_capabilities (code, description) values
  ('liquidations.share', 'Compartir la liquidacion con el vecino (link publico)')
on conflict (code) do update set description = excluded.description;
