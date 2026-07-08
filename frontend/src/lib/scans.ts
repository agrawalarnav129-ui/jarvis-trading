// Saved Builder scans — Supabase settings.prefs when signed in (syncs across
// devices, like chart layouts), localStorage otherwise.
import { supabase, supabaseEnabled } from "./supabase";

export interface SavedScan { name: string; universe: string; conditions: any[]; }

const LS_KEY = "axiom_builder_scans";

async function session() {
  if (!supabaseEnabled || !supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function readLocal(): SavedScan[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export async function listScans(): Promise<SavedScan[]> {
  const s = await session();
  if (s) {
    const { data } = await supabase!.from("settings").select("prefs").eq("user_id", s.user.id).maybeSingle();
    const remote = data?.prefs?.builderScans;
    if (Array.isArray(remote)) return remote;
  }
  return readLocal();
}

export async function persistScans(scans: SavedScan[]): Promise<void> {
  localStorage.setItem(LS_KEY, JSON.stringify(scans));   // always keep the local copy
  const s = await session();
  if (!s) return;
  const { data } = await supabase!.from("settings").select("prefs").eq("user_id", s.user.id).maybeSingle();
  const prefs = { ...(data?.prefs ?? {}), builderScans: scans };
  await supabase!.from("settings").upsert({ user_id: s.user.id, prefs });
}
