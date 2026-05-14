alter table public.promotions
  add column if not exists published_month date,
  add column if not exists source_promotion_id uuid references public.promotions(id) on delete set null;

update public.promotions
set published_month = date_trunc('month', coalesce(created_at, now()))::date
where published_month is null;

alter table public.promotions
  alter column published_month set default date_trunc('month', now())::date;

alter table public.promotions
  alter column published_month set not null;

create index if not exists promotions_business_month_idx on public.promotions (business_id, published_month desc);
create index if not exists promotions_source_idx on public.promotions (source_promotion_id);

delete from public.promotion_redemptions pr
where exists (
  select 1
  from public.promotion_redemptions newer
  where newer.profile_id = pr.profile_id
    and newer.promotion_id = pr.promotion_id
    and (
      newer.redeemed_at > pr.redeemed_at
      or (newer.redeemed_at = pr.redeemed_at and newer.created_at > pr.created_at)
      or (newer.redeemed_at = pr.redeemed_at and newer.created_at = pr.created_at and newer.id > pr.id)
    )
);

create unique index if not exists promotion_redemptions_profile_promotion_uidx
  on public.promotion_redemptions (profile_id, promotion_id);

create table if not exists public.promotion_redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'redeemed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_business_id uuid references public.businesses(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists promotion_redemption_tokens_lookup_idx
  on public.promotion_redemption_tokens (promotion_id, profile_id, status, expires_at desc);

create unique index if not exists promotion_redemption_tokens_pending_uidx
  on public.promotion_redemption_tokens (promotion_id, profile_id)
  where status = 'pending';

alter table public.promotion_redemption_tokens enable row level security;

drop policy if exists "Promotion redemption tokens scoped read" on public.promotion_redemption_tokens;
create policy "Promotion redemption tokens scoped read" on public.promotion_redemption_tokens
for select to authenticated
using (
  profile_id = auth.uid()
  or public.current_user_role() = 'super_admin'
  or (
    public.current_user_role() = 'negocio_admin'
    and exists (
      select 1
      from public.promotions p
      where p.id = public.promotion_redemption_tokens.promotion_id
        and p.business_id = public.current_user_business_id()
    )
  )
);

create or replace function public.generate_promotion_redemption_token()
returns text
language plpgsql
as $generate_token$
begin
  return upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
end;
$generate_token$;

create or replace function public.create_promotion_redemption_token(target_promotion_id uuid)
returns table (
  id uuid,
  token text,
  qr_value text,
  expires_at timestamptz,
  promotion_id uuid,
  promotion_title text,
  business_name text
)
language plpgsql
security definer
set search_path = public
as $create_redemption_token$
declare
  current_profile public.profiles%rowtype;
  promotion_row public.promotions%rowtype;
  business_row public.businesses%rowtype;
  existing_token public.promotion_redemption_tokens%rowtype;
  created_token public.promotion_redemption_tokens%rowtype;
begin
  select *
  into current_profile
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if current_profile.id is null then
    raise exception 'No se encontro el perfil autenticado.';
  end if;

  if current_profile.role not in ('vecino', 'super_admin') then
    raise exception 'Solo vecinos pueden solicitar cupones QR.';
  end if;

  select *
  into promotion_row
  from public.promotions p
  where p.id = target_promotion_id
  limit 1;

  if promotion_row.id is null then
    raise exception 'La promocion no existe.';
  end if;

  if not promotion_row.is_active or promotion_row.expiration_date < current_date then
    raise exception 'La promocion ya no esta disponible.';
  end if;

  if promotion_row.building_id is not null and promotion_row.building_id <> current_profile.building_id and current_profile.role <> 'super_admin' then
    raise exception 'La promocion no esta disponible para tu edificio.';
  end if;

  if exists (
    select 1
    from public.promotion_redemptions
    where profile_id = current_profile.id
      and promotion_id = promotion_row.id
  ) then
    raise exception 'Esta promocion ya fue usada por este vecino.';
  end if;

  update public.promotion_redemption_tokens
  set status = 'expired'
  where profile_id = current_profile.id
    and promotion_id = promotion_row.id
    and status = 'pending'
    and expires_at <= now();

  select *
  into existing_token
  from public.promotion_redemption_tokens
  where profile_id = current_profile.id
    and promotion_id = promotion_row.id
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;

  select *
  into business_row
  from public.businesses b
  where b.id = promotion_row.business_id
  limit 1;

  if existing_token.id is null then
    insert into public.promotion_redemption_tokens (
      promotion_id,
      profile_id,
      token,
      expires_at
    )
    values (
      promotion_row.id,
      current_profile.id,
      public.generate_promotion_redemption_token(),
      now() + interval '15 minutes'
    )
    returning *
    into created_token;
  else
    created_token := existing_token;
  end if;

  return query
  select
    created_token.id,
    created_token.token,
    'CITIFY:' || created_token.token,
    created_token.expires_at,
    promotion_row.id,
    promotion_row.title,
    coalesce(business_row.name, 'Comercio');
end;
$create_redemption_token$;

create or replace function public.validate_promotion_redemption_token(raw_token text)
returns table (
  status text,
  message text,
  token_id uuid,
  promotion_id uuid,
  promotion_title text,
  neighbor_name text,
  redeemed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $validate_redemption_token$
declare
  v_normalized_token text;
  v_current_profile_id uuid;
  v_current_profile_role public.app_role;
  v_current_profile_business_id uuid;
  v_token_id uuid;
  v_token_profile_id uuid;
  v_token_promotion_id uuid;
  v_token_status text;
  v_token_expires_at timestamptz;
  v_token_redeemed_at timestamptz;
  v_promotion_business_id uuid;
  v_promotion_title text;
  v_promotion_is_active boolean;
  v_promotion_expiration_date date;
  v_neighbor_full_name text;
  v_inserted_redemption_id uuid;
begin
  v_normalized_token := upper(trim(coalesce(raw_token, '')));
  if v_normalized_token like 'CITIFY:%' then
    v_normalized_token := substring(v_normalized_token from 8);
  end if;

  select p.id, p.role, p.business_id
  into v_current_profile_id, v_current_profile_role, v_current_profile_business_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_current_profile_id is null then
    return query select 'forbidden', 'No se encontro el perfil autenticado.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_current_profile_role not in ('negocio_admin', 'super_admin') then
    return query select 'forbidden', 'Solo el negocio puede validar canjes.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select
    t.id,
    t.profile_id,
    t.promotion_id,
    t.status,
    t.expires_at,
    t.redeemed_at
  into
    v_token_id,
    v_token_profile_id,
    v_token_promotion_id,
    v_token_status,
    v_token_expires_at,
    v_token_redeemed_at
  from public.promotion_redemption_tokens t
  where t.token = v_normalized_token
  limit 1;

  if v_token_id is null then
    return query select 'not_found', 'No encontramos ese codigo.', null::uuid, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  select p.business_id, p.title, p.is_active, p.expiration_date
  into v_promotion_business_id, v_promotion_title, v_promotion_is_active, v_promotion_expiration_date
  from public.promotions p
  where p.id = v_token_promotion_id
  limit 1;

  select p.full_name
  into v_neighbor_full_name
  from public.profiles p
  where p.id = v_token_profile_id
  limit 1;

  if v_current_profile_role = 'negocio_admin' and v_promotion_business_id <> v_current_profile_business_id then
    return query
    select
      'forbidden',
      'Ese codigo pertenece a otro negocio.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      v_token_redeemed_at;
    return;
  end if;

  if exists (
    select 1
    from public.promotion_redemptions pr
    where pr.profile_id = v_token_profile_id
      and pr.promotion_id = v_token_promotion_id
  ) or v_token_status = 'redeemed' then
    update public.promotion_redemption_tokens t
    set status = 'redeemed',
        redeemed_at = coalesce(t.redeemed_at, now()),
        redeemed_by_business_id = coalesce(t.redeemed_by_business_id, v_promotion_business_id)
    where t.id = v_token_id;

    return query
    select
      'already_used',
      'Esta promocion ya habia sido canjeada por este vecino.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      coalesce(v_token_redeemed_at, now());
    return;
  end if;

  if v_token_status <> 'pending' or v_token_expires_at <= now() then
    update public.promotion_redemption_tokens t
    set status = 'expired'
    where t.id = v_token_id
      and t.status = 'pending';

    return query
    select
      'expired',
      'El codigo expiro. Pidele al vecino que vuelva a abrir el QR.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      null::timestamptz;
    return;
  end if;

  if not v_promotion_is_active or v_promotion_expiration_date < current_date then
    return query
    select
      'promotion_unavailable',
      'La promocion ya no esta disponible para canje.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      null::timestamptz;
    return;
  end if;

  insert into public.promotion_redemptions (
    profile_id,
    promotion_id,
    status,
    redeemed_at,
    created_at
  )
  values (
    v_token_profile_id,
    v_token_promotion_id,
    'redeemed',
    now(),
    now()
  )
  on conflict (profile_id, promotion_id) do nothing
  returning id
  into v_inserted_redemption_id;

  if v_inserted_redemption_id is null then
    update public.promotion_redemption_tokens t
    set status = 'redeemed',
        redeemed_at = coalesce(t.redeemed_at, now()),
        redeemed_by_business_id = coalesce(t.redeemed_by_business_id, v_promotion_business_id)
    where t.id = v_token_id;

    return query
    select
      'already_used',
      'Esta promocion ya habia sido canjeada por este vecino.',
      v_token_id,
      v_token_promotion_id,
      v_promotion_title,
      coalesce(v_neighbor_full_name, 'Vecino'),
      coalesce(v_token_redeemed_at, now());
    return;
  end if;

  update public.promotion_redemption_tokens t
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_by_business_id = v_promotion_business_id
  where t.id = v_token_id;

  return query
  select
    'redeemed',
    'Canje validado correctamente.',
    v_token_id,
    v_token_promotion_id,
    v_promotion_title,
    coalesce(v_neighbor_full_name, 'Vecino'),
    now();
end;
$validate_redemption_token$;

grant execute on function public.create_promotion_redemption_token(uuid) to authenticated;
grant execute on function public.validate_promotion_redemption_token(text) to authenticated;
