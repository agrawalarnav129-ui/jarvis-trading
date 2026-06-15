// Open-position store for the Live Cockpit — the trade journal holds CLOSED
// trades only, so open risk is tracked separately. Supabase when signed in
// (table: positions), else localStorage.
import { supabase, supabaseEnabled } from "./supabase";

export interface Position {
  id?: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  qty: number;
  opened_at?: string;
}

const LS_KEY = "axiom_positions";
const CAP_KEY = "axiom_capital";

async function hasSession(): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export async function listPositions(): Promise<Position[]> {
  if (await hasSession()) {
    const { data, error } = await supabase!.from("positions").select("*").order("opened_at", { ascending: false });
    if (!error && data) return data as Position[];
  }
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export async function addPosition(p: Position): Promise<void> {
  if (await hasSession()) {
    const { error } = await supabase!.from("positions").insert(p);
    if (!error) return;
  }
  const all = await listPositions();
  all.unshift({ ...p, id: crypto.randomUUID(), opened_at: new Date().toISOString() });
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export async function deletePosition(id: string): Promise<void> {
  if (await hasSession()) {
    const { error } = await supabase!.from("positions").delete().eq("id", id);
    if (!error) return;
  }
  const all = (await listPositions()).filter((p) => p.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function getCapital(): number {
  return Number(localStorage.getItem(CAP_KEY)) || 1_000_000;
}
export function setCapital(v: number): void {
  localStorage.setItem(CAP_KEY, String(v));
}
