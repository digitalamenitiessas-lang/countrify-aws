import { pgQuery } from '@/lib/db/postgres'

// ----------------------------------------------------------------------------
// Building announcements — persistencia + read receipts.
// ----------------------------------------------------------------------------

export type AnnouncementRow = {
  id: string
  building_id: string
  building_name: string | null
  author_profile_id: string | null
  author_name: string | null
  title: string
  body: string
  pinned: boolean
  expires_at: string | null
  published_at: string
  created_at: string
  updated_at: string
}

export type AnnouncementRowWithReadCount = AnnouncementRow & {
  read_count: number
}

export type AnnouncementForRecipientRow = AnnouncementRow & {
  is_read: boolean
}

// Para el admin: lista todos los comunicados de los buildings que el admin
// gestiona. Incluye conteo de reads para mostrar engagement.
export async function listAnnouncementsByAdminFromPostgres(input: {
  administrationId: string
  buildingId?: string | null
  limit?: number
}): Promise<AnnouncementRowWithReadCount[]> {
  const result = await pgQuery<AnnouncementRowWithReadCount>(
    `
      select
        a.id,
        a.building_id,
        b.name as building_name,
        a.author_profile_id,
        ap.full_name as author_name,
        a.title,
        a.body,
        a.pinned,
        a.expires_at::text as expires_at,
        a.published_at::text as published_at,
        a.created_at::text as created_at,
        a.updated_at::text as updated_at,
        (select count(*)::int
           from public.building_announcement_reads r
          where r.announcement_id = a.id) as read_count
      from public.building_announcements a
      join public.buildings b on b.id = a.building_id
      join public.iadmin_managed_properties mp on mp.building_id = b.id
      left join public.profiles ap on ap.id = a.author_profile_id
      where mp.administration_id = $1
        and ($2::uuid is null or a.building_id = $2)
      order by a.pinned desc, a.published_at desc
      limit $3
    `,
    [input.administrationId, input.buildingId ?? null, input.limit ?? 100],
  )
  return result.rows
}

// Para el vecino: lista comunicados de SU building (no expirados, mas el
// flag is_read computado del read receipt).
export async function listAnnouncementsForRecipientFromPostgres(input: {
  profileId: string
  buildingId: string
  limit?: number
}): Promise<AnnouncementForRecipientRow[]> {
  const result = await pgQuery<AnnouncementForRecipientRow>(
    `
      select
        a.id,
        a.building_id,
        b.name as building_name,
        a.author_profile_id,
        ap.full_name as author_name,
        a.title,
        a.body,
        a.pinned,
        a.expires_at::text as expires_at,
        a.published_at::text as published_at,
        a.created_at::text as created_at,
        a.updated_at::text as updated_at,
        (r.read_at is not null) as is_read
      from public.building_announcements a
      join public.buildings b on b.id = a.building_id
      left join public.profiles ap on ap.id = a.author_profile_id
      left join public.building_announcement_reads r
        on r.announcement_id = a.id and r.profile_id = $1
      where a.building_id = $2
        and (a.expires_at is null or a.expires_at > now())
      order by a.pinned desc, a.published_at desc
      limit $3
    `,
    [input.profileId, input.buildingId, input.limit ?? 50],
  )
  return result.rows
}

// Conteo rapido de comunicados no leidos para el badge del bottom nav.
export async function countUnreadAnnouncementsForRecipientFromPostgres(input: {
  profileId: string
  buildingId: string
}): Promise<number> {
  const result = await pgQuery<{ c: number }>(
    `
      select count(*)::int as c
        from public.building_announcements a
        left join public.building_announcement_reads r
          on r.announcement_id = a.id and r.profile_id = $1
       where a.building_id = $2
         and (a.expires_at is null or a.expires_at > now())
         and r.read_at is null
    `,
    [input.profileId, input.buildingId],
  )
  return result.rows[0]?.c ?? 0
}

// Para el helper de email: cuando se publica, traemos toda la info del
// comunicado en una query.
export async function getAnnouncementForEmailFromPostgres(
  id: string,
): Promise<AnnouncementRow | null> {
  const result = await pgQuery<AnnouncementRow>(
    `
      select
        a.id,
        a.building_id,
        b.name as building_name,
        a.author_profile_id,
        ap.full_name as author_name,
        a.title,
        a.body,
        a.pinned,
        a.expires_at::text as expires_at,
        a.published_at::text as published_at,
        a.created_at::text as created_at,
        a.updated_at::text as updated_at
      from public.building_announcements a
      join public.buildings b on b.id = a.building_id
      left join public.profiles ap on ap.id = a.author_profile_id
      where a.id = $1
      limit 1
    `,
    [id],
  )
  return result.rows[0] ?? null
}

// Para el helper de email: traer todos los recipients del building (vecinos
// + propietarios + admins NO porque ya saben). Filtra por preference
// 'announcements' y excluye email_blocked.
export type AnnouncementRecipientRow = {
  profile_id: string
  email: string
  full_name: string
  role: string
}

export async function listAnnouncementRecipientsFromPostgres(input: {
  buildingId: string
}): Promise<AnnouncementRecipientRow[]> {
  const result = await pgQuery<AnnouncementRecipientRow>(
    `
      select distinct p.id as profile_id, p.email, p.full_name, p.role::text as role
        from public.profiles p
        left join public.unit_profile_memberships m on m.profile_id = p.id and m.building_id = $1
       where (p.building_id = $1 or m.building_id = $1)
         and p.role = 'vecino'
         and p.email_blocked = false
         and coalesce((p.email_notifications->>'announcements')::boolean, true) = true
         and (m.active is null or m.active = true)
    `,
    [input.buildingId],
  )
  return result.rows
}

// ----- writes -----

export async function insertAnnouncementInPostgres(input: {
  buildingId: string
  authorProfileId: string
  title: string
  body: string
  pinned: boolean
  expiresAt: string | null
}): Promise<{ id: string }> {
  const result = await pgQuery<{ id: string }>(
    `
      insert into public.building_announcements (
        building_id, author_profile_id, title, body, pinned, expires_at
      ) values ($1, $2, $3, $4, $5, $6::timestamptz)
      returning id
    `,
    [
      input.buildingId,
      input.authorProfileId,
      input.title,
      input.body,
      input.pinned,
      input.expiresAt,
    ],
  )
  return result.rows[0]
}

export async function updateAnnouncementInPostgres(input: {
  id: string
  title: string
  body: string
  pinned: boolean
  expiresAt: string | null
}): Promise<void> {
  await pgQuery(
    `
      update public.building_announcements
        set title = $2,
            body = $3,
            pinned = $4,
            expires_at = $5::timestamptz
      where id = $1
    `,
    [input.id, input.title, input.body, input.pinned, input.expiresAt],
  )
}

export async function deleteAnnouncementInPostgres(id: string): Promise<void> {
  await pgQuery(`delete from public.building_announcements where id = $1`, [id])
}

export async function getAnnouncementAdminContextFromPostgres(
  id: string,
): Promise<{ administration_id: string; building_id: string } | null> {
  const result = await pgQuery<{ administration_id: string; building_id: string }>(
    `
      select mp.administration_id, a.building_id
        from public.building_announcements a
        join public.iadmin_managed_properties mp on mp.building_id = a.building_id
       where a.id = $1
       limit 1
    `,
    [id],
  )
  return result.rows[0] ?? null
}

export async function markAnnouncementReadInPostgres(input: {
  announcementId: string
  profileId: string
}): Promise<void> {
  await pgQuery(
    `
      insert into public.building_announcement_reads (announcement_id, profile_id)
      values ($1, $2)
      on conflict (announcement_id, profile_id) do nothing
    `,
    [input.announcementId, input.profileId],
  )
}
