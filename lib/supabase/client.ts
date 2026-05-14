'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseEnv, isSupabaseConfigured } from '@/lib/supabase/env'

let browserClient: SupabaseClient | null = null

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null
  }

  if (!browserClient) {
    const { url, anonKey } = getSupabaseEnv()
    browserClient = createBrowserClient(url!, anonKey!)
  }

  return browserClient
}

