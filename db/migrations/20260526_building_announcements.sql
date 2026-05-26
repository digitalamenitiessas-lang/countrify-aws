-- Comunicados del consorcio admin a vecinos. Persistencia + read receipts.
-- El AI composer existente sigue como herramienta de redaccion; el publish
-- ahora archiva el comunicado y dispara mail a vecinos del building.

create table if not exists countrify.building_announcements (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references countrify.buildings(id) on delete cascade,
  author_profile_id uuid references countrify.profiles(id) on delete set null,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  expires_at timestamptz,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists building_announcements_building_idx
  on countrify.building_announcements (building_id, published_at desc);
create index if not exists building_announcements_pinned_idx
  on countrify.building_announcements (building_id, pinned)
  where pinned = true;

-- Read receipts. Una row por (announcement, profile) cuando el vecino abre
-- el comunicado.
create table if not exists countrify.building_announcement_reads (
  announcement_id uuid not null references countrify.building_announcements(id) on delete cascade,
  profile_id uuid not null references countrify.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

create index if not exists building_announcement_reads_profile_idx
  on countrify.building_announcement_reads (profile_id);

-- Trigger para updated_at.
create or replace function countrify.set_building_announcements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_building_announcements_updated_at on countrify.building_announcements;
create trigger set_building_announcements_updated_at
  before update on countrify.building_announcements
  for each row execute function countrify.set_building_announcements_updated_at();
