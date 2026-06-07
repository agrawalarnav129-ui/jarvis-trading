// Personal watchlist — Supabase when signed in, else localStorage.
import { supabase, supabaseEnabled } from "./supabase";

const LS_KEY = "axiom_watchlist";

async function hasSession(): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

function lsGet(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function lsSet(v: string[]) { localStorage.setItem(LS_KEY, JSON.stringify(v)); }

export async function listWatch(): Promise<string[]> {
  if (await hasSession()) {
    const { data, error } = await supabase!.from("watchlist").select("symbol").order("added_at", { ascending: false });
    if (!error && data) return data.map((r: any) => r.symbol);
  }
  return lsGet();
}

export async function addWatch(symbol: string): Promise<void> {
  const s = symbol.replace(".NS", "").toUpperCase();
  if (await hasSession()) {
    await supabase!.from("watchlist").insert({ symbol: s });
    return;
  }
  const all = lsGet();
  if (!all.includes(s)) lsSet([s, ...all]);
}

export async function removeWatch(symbol: string): Promise<void> {
  const s = symbol.replace(".NS", "").toUpperCase();
  if (await hasSession()) {
    await supabase!.from("watchlist").delete().eq("symbol", s);
    return;
  }
  lsSet(lsGet().filter((x) => x !== s));
}
