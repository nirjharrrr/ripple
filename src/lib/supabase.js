// Ripple v2 — Supabase client.
// Reads the project URL + anon key from Vite env (see .env.example / docs/SUPABASE_V2.md).
// The anon key is safe to ship in the client; Row Level Security enforces access.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL || '';
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured() {
  return Boolean(URL && ANON);
}

// A single shared client. Sessions persist + auto-refresh in localStorage.
export const supabase = isSupabaseConfigured()
  ? createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } }, // gentle on the free tier
    })
  : null;
