import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client using the service role key.
 * Server-side ONLY — never import from client components.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
