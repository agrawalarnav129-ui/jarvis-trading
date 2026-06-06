// AXIOM API client — talks to the FastAPI backend.
const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export interface IndexItem { name: string; last: number; change: number; pct: number; }
export interface Mover { symbol: string; ltp: number; change: number; pct: number; }
export interface NewsItem { title: string; link: string; source: string; published_str: string; }
export interface CalEvent { date: string | null; date_str: string; event?: string; symbol?: string; purpose?: string; company?: string; impact?: string; note?: string; }
export interface Regime { regime: string; nifty_close: number; ema50: number; ema200: number; adx: number; max_positions: number; min_rr: number; reason: string; }
export interface FiiDii { available: boolean; date?: string; fii?: { net: number }; dii?: { net: number }; note?: string; }
export interface ClockData { iso: string; ist: string; date: string; market_open: boolean; }

export const api = {
  clock: () => get<ClockData>("/api/clock"),
  indices: () => get<{ indices: IndexItem[] }>("/api/market/indices"),
  movers: () => get<{ available: boolean; gainers: Mover[]; losers: Mover[] }>("/api/market/movers"),
  news: () => get<{ news: NewsItem[] }>("/api/news"),
  calendar: () => get<{ corporate: CalEvent[]; macro: CalEvent[] }>("/api/calendar"),
  fiiDii: () => get<FiiDii>("/api/fii-dii"),
  regime: () => get<Regime>("/api/regime"),
  watchlist: () => get<{ watchlist: any[] }>("/api/watchlist"),
  screener: () => get<{ results: any[] }>("/api/screener"),
  backtest: (symbol: string, rr = 2.5) =>
    get<{ symbol: string; metrics: Record<string, number>; trades: any[]; equity: number[] }>(
      `/api/backtest?symbol=${encodeURIComponent(symbol)}&rr=${rr}`),
  assistant: async (message: string, history: { role: string; text: string }[]) => {
    const r = await fetch(`${BASE}/api/assistant`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!r.ok) throw new Error(`assistant -> ${r.status}`);
    return (await r.json()) as { reply: string };
  },
};

export { BASE as API_BASE };
