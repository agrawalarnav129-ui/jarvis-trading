// Supabase client — used for auth + persistent storage (trades, watchlist, settings).
// Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your env.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  url && anon ? createClient(url, anon) : null;

export const supabaseEnabled = Boolean(url && anon);
