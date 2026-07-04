import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

if (!supabaseConfigured && import.meta.env.PROD) {
  console.error(
    "[Owlwise] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — add them in Vercel and redeploy."
  );
}

export const supabase = createClient(url ?? "https://placeholder.supabase.co", anon ?? "placeholder");

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
