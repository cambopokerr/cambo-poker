import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Public project settings. The anon key is safe in a browser app: row-level security decides what it can touch. */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://fbqpmzzqkyoemurmhnbu.supabase.co";
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZicXBtenpxa3lvZW11cm1obmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMjExNDcsImV4cCI6MjEwNzY5NzE0N30.w7y0nL9fkuSmcuMZoX4zrg71MoOTlVifwS75y6NAEg8";

/** Set VITE_LOCAL_ONLY=1 to run against browser storage with no sign-in (handy for development). */
export const REMOTE_ENABLED = import.meta.env.VITE_LOCAL_ONLY !== "1" && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
