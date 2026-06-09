import type { Trade } from "./trades";

export interface Bucket { key: string; count: number; wins: number; winRate: number; total: number; }

function group(trades: Trade[], keyFn: (t: Trade) => string): Bucket[] {
  const m = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = keyFn(t) || "—";
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  return [...m.entries()].map(([key, ts]) => {
    const wins = ts.filter((t) => t.pnl > 0).length;
    return { key, count: ts.length, wins, winRate: ts.length ? (wins / ts.length) * 100 : 0, total: ts.reduce((s, t) => s + (t.pnl || 0), 0) };
  }).sort((a, b) => b.total - a.total);
}

export function computeStats(trades: Trade[]) {
  const n = trades.length;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const total = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  // chronological (stored newest-first)
  const chrono = [...trades].reverse();
  let maxWinStreak = 0, maxLossStreak = 0, cw = 0, cl = 0;
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of chrono) {
    if (t.pnl > 0) { cw++; cl = 0; } else if (t.pnl < 0) { cl++; cw = 0; } else { cw = 0; cl = 0; }
    maxWinStreak = Math.max(maxWinStreak, cw);
    maxLossStreak = Math.max(maxLossStreak, cl);
    cum += t.pnl || 0; peak = Math.max(peak, cum); maxDD = Math.min(maxDD, cum - peak);
  }

  const best = trades.reduce<Trade | null>((a, t) => (t.pnl > (a?.pnl ?? -Infinity) ? t : a), null);
  const worst = trades.reduce<Trade | null>((a, t) => (t.pnl < (a?.pnl ?? Infinity) ? t : a), null);

  return {
    n,
    winRate: n ? (wins.length / n) * 100 : 0,
    total,
    expectancy: n ? total / n : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    avgWin, avgLoss,
    payoff: avgLoss ? avgWin / avgLoss : 0,
    maxWinStreak, maxLossStreak, maxDD,
    best, worst,
    bySetup: group(trades, (t) => t.setup_type),
    bySide: group(trades, (t) => t.side),
    byDay: group(trades, (t) => (t.created_at ? new Date(t.created_at).toLocaleDateString("en-US", { weekday: "short" }) : "—")),
  };
}
