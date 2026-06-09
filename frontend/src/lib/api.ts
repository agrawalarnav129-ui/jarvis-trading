// AXIOM API client — talks to the FastAPI backend.
const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

// In-memory GET cache so navigation/back and grid panels sharing a symbol
// don't issue duplicate fetches. Short TTL; cleared by bustCache().
const _cache = new Map<string, { ts: number; promise: Promise<any> }>();
const TTL = 25_000;

async function get<T>(path: string): Promise<T> {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.ts < TTL) return hit.promise as Promise<T>;
  const promise = fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } }).then((r) => {
    if (!r.ok) throw new Error(`${path} -> ${r.status}`);
    return r.json();
  }).catch((e) => { _cache.delete(path); throw e; });
  _cache.set(path, { ts: Date.now(), promise });
  return promise as Promise<T>;
}

/** Clear the client GET cache (used by useFetch's reload / pull-to-refresh). */
export function bustCache() { _cache.clear(); }

export interface IndexItem { name: string; last: number; change: number; pct: number; }
export interface Mover { symbol: string; ltp: number; change: number; pct: number; }
export interface NewsItem { title: string; link: string; source: string; published_str: string; }
export interface CalEvent { date: string | null; date_str: string; event?: string; symbol?: string; purpose?: string; company?: string; impact?: string; note?: string; }
export interface Regime { regime: string; nifty_close: number; ema50: number; ema200: number; adx: number; max_positions: number; min_rr: number; reason: string; }
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; }
export interface HistoryResp { symbol: string; interval: string; last: number; change: number; pct: number; rsi: number; adx: number; ema20: number; ema50: number; ema200: number; atr: number; high_52w: number; low_52w: number; candles: Candle[]; }
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
  rsRanking: (by = "rs_20d") => get<{ by: string; results: any[] }>(`/api/rs-ranking?by=${by}`),
  scanCustom: (params: Record<string, string | number | boolean>) => {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return get<{ count: number; results: any[] }>(`/api/scan/custom?${qs}`);
  },
  backtest: (symbol: string, rr = 2.5) =>
    get<{ symbol: string; metrics: Record<string, number>; trades: any[]; equity: number[] }>(
      `/api/backtest?symbol=${encodeURIComponent(symbol)}&rr=${rr}`),
  footprint: (symbol: string, days = 1) =>
    get<{ symbol: string; poc: number; total_delta: number; bars: number; last: number; note: string; profile: { price: number; buy_vol: number; sell_vol: number; delta: number }[] }>(
      `/api/footprint?symbol=${encodeURIComponent(symbol)}&days=${days}`),
  scan: () => get<{ count: number; ist: string; results: { symbol: string; signals: string[]; close: number; rsi: number; adx: number; vol_ratio: number; macd_hist: number }[] }>("/api/scan"),
  history: (symbol: string, period = "6mo", interval = "1d") =>
    get<HistoryResp>(`/api/history?symbol=${encodeURIComponent(symbol)}&period=${period}&interval=${interval}`),
  analysis: (symbol: string) => get<{ symbol: string; analysis: string }>(`/api/analysis?symbol=${encodeURIComponent(symbol)}`),
  sectors: () => get<{ sectors: { sector: string; pct: number }[] }>("/api/sectors"),
  options: (symbol = "NIFTY") => get<{ symbol: string; available?: boolean; note?: string; source?: string; spot: number; expiry: string; pcr: number; total_ce_oi: number; total_pe_oi: number; max_pain: number; support: number; resistance: number; atm_iv: number; chain: { strike: number; ceOI: number; peOI: number }[] }>(`/api/options?symbol=${symbol}`),
  quote: (symbols: string[]) => get<{ quotes: { symbol: string; ltp: number; change: number; pct: number }[] }>(`/api/quote?symbols=${encodeURIComponent(symbols.join(","))}`),
  tasks: (session: string) => get<{ session: string; checklist: string }>(`/api/tasks?session=${encodeURIComponent(session)}`),
  briefing: () => get<{ briefing: string; date: string }>("/api/briefing"),
  sendBriefing: async (briefing: string) => {
    const r = await fetch(`${BASE}/api/briefing/telegram`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ briefing }),
    });
    if (!r.ok) throw new Error(`send -> ${r.status}`);
    return (await r.json()) as { sent: boolean; file: string };
  },
  assistant: async (message: string, history: { role: string; text: string }[]) => {
    const r = await fetch(`${BASE}/api/assistant`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!r.ok) throw new Error(`assistant -> ${r.status}`);
    return (await r.json()) as { reply: string };
  },
  // Streaming chat — calls onToken for each chunk as it arrives.
  assistantStream: async (message: string, history: { role: string; text: string }[], onToken: (t: string) => void) => {
    const r = await fetch(`${BASE}/api/assistant/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    if (!r.ok || !r.body) throw new Error(`stream -> ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      onToken(dec.decode(value, { stream: true }));
    }
  },
};

export { BASE as API_BASE };
