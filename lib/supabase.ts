import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase access.
 *
 * Only route handlers touch this. The service-role key bypasses row-level
 * security, so it must never reach the browser — the site's shared-password
 * gate is what decides who may call the sync routes, and every table has RLS
 * enabled with no public policy so nothing else can read them.
 */

export class SyncNotConfiguredError extends Error {
  constructor() {
    super(
      "Sync is not set up. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your environment, and run supabase/schema.sql in the Supabase SQL editor.",
    );
    this.name = "SyncNotConfiguredError";
  }
}

export function syncConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!syncConfigured()) throw new SyncNotConfiguredError();
  if (!cached) {
    cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/**
 * Everyone past the password gate is the same reader, so one profile is
 * enough. It is a setting rather than a constant only so a second reader
 * could be given their own shelf without any schema change.
 */
export function profileId(): string {
  return process.env.SYNC_PROFILE || "default";
}
