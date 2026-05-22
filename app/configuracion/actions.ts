'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { getEmailNotificationsPrefs, setEmailNotificationsPrefs } from '@/lib/db/profiles'

const preferencesSchema = z.object({
  complaints: z.boolean(),
  liquidations: z.boolean(),
  announcements: z.boolean(),
  promotions: z.boolean(),
})

export type EmailPreferences = z.infer<typeof preferencesSchema>

function sourceFromRole(role: string): 'primary' | 'business' {
  return role === 'negocio_admin' ? 'business' : 'primary'
}

export async function getEmailPreferencesAction(): Promise<EmailPreferences> {
  const { profile } = await requireProfile(undefined, { allowMustChange: true })
  const stored = await getEmailNotificationsPrefs(profile.id, sourceFromRole(profile.role))
  return preferencesSchema.parse({
    complaints: stored.complaints ?? true,
    liquidations: stored.liquidations ?? true,
    announcements: stored.announcements ?? true,
    promotions: stored.promotions ?? false,
  })
}

export async function updateEmailPreferencesAction(input: EmailPreferences) {
  const { profile } = await requireProfile()
  const parsed = preferencesSchema.parse(input)
  await setEmailNotificationsPrefs(profile.id, sourceFromRole(profile.role), parsed)
  revalidatePath('/configuracion')
  return { ok: true }
}
