// Trade store — persists to Supabase when configured + signed in, else localStorage.
import { supabase, supabaseEnabled } from "./supabase";

export interface Trade {
  id?: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  setup_type: string;
  notes?: string;
  created_at?: string;
}

const LS_KEY = "axiom_trades";

async function hasSession(): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export async function listTrades(): Promise<Trade[]> {
  if (await hasSession()) {
    const { data, error } = await supabase!.from("trades").select("*").order("created_at", { ascending: false });
    if (!error && data) return data as Trade[];
  }
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export async function addTrade(t: Trade): Promise<void> {
  if (await hasSession()) {
    const { error } = await supabase!.from("trades").insert(t);
    if (!error) return;
  }
  const all = await listTrades();
  all.unshift({ ...t, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export async function deleteTrade(id: string): Promise<void> {
  if (await hasSession()) {
    const { error } = await supabase!.from("trades").delete().eq("id", id);
    if (!error) return;
  }
  const all = (await listTrades()).filter((t) => t.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function storageMode(): "supabase" | "local" {
  return supabaseEnabled ? "supabase" : "local";
}
