// Save/load the Charts grid layout — Supabase settings.prefs when signed in,
// localStorage otherwise.
import { supabase, supabaseEnabled } from "./supabase";

const LS_KEY = "axiom_chart_layout";

async function session() {
  if (!supabaseEnabled || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function saveLayout(layout: any): Promise<void> {
  const s = await session();
  if (s) {
    // merge into prefs jsonb
    const { data } = await supabase!.from("settings").select("prefs").eq("user_id", s.user.id).maybeSingle();
    const prefs = { ...(data?.prefs ?? {}), charts: layout };
    await supabase!.from("settings").upsert({ user_id: s.user.id, prefs });
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(layout));
}

export async function loadLayout(): Promise<any | null> {
  const s = await session();
  if (s) {
    const { data } = await supabase!.from("settings").select("prefs").eq("user_id", s.user.id).maybeSingle();
    return data?.prefs?.charts ?? null;
  }
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
}
