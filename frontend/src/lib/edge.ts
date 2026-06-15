// "Your Edge" — behavioral leak analytics from the closed-trade journal.
// Works only with fields we actually store (no hold-time/regime), focusing on
// sequence/tilt, position sizing, setup and symbol edge.
import type { Trade } from "./trades";

export interface EdgeBucket { key: string; n: number; winRate: number; expectancy: number; total: number; }

const wr = (ts: Trade[]) => (ts.length ? ts.filter((t) => t.pnl > 0).length / ts.length * 100 : 0);
const exp = (ts: Trade[]) => (ts.length ? ts.reduce((s, t) => s + (t.pnl || 0), 0) / ts.length : 0);

function bucket(ts: Trade[], keyFn: (t: Trade) => string, minN = 1): EdgeBucket[] {
  const m = new Map<string, Trade[]>();
  for (const t of ts) { const k = keyFn(t) || "—"; (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
  return [...m.entries()]
    .map(([key, g]) => ({ key, n: g.length, winRate: wr(g), expectancy: exp(g), total: g.reduce((s, t) => s + t.pnl, 0) }))
    .filter((b) => b.n >= minN)
    .sort((a, b) => b.expectancy - a.expectancy);
}

export function computeEdge(trades: Trade[]) {
  // chronological (store is newest-first)
  const chrono = [...trades].reverse();

  // ── tilt: outcome of the trade AFTER a win vs AFTER a loss ──
  const afterWin: Trade[] = [], afterLoss: Trade[] = [], afterStreak: Trade[] = [];
  let streak = 0;
  for (let i = 1; i < chrono.length; i++) {
    const prev = chrono[i - 1];
    if (prev.pnl < 0) { afterLoss.push(chrono[i]); streak = streak < 0 ? streak - 1 : -1; }
    else if (prev.pnl > 0) { afterWin.push(chrono[i]); streak = streak > 0 ? streak + 1 : 1; }
    if (streak <= -2) afterStreak.push(chrono[i]);
  }

  // ── sizing: position value terciles ──
  const sized = trades.filter((t) => t.entry_price && t.quantity)
    .map((t) => ({ t, val: t.entry_price * t.quantity }))
    .sort((a, b) => a.val - b.val);
  const third = Math.floor(sized.length / 3) || 1;
  const sizeBuckets: EdgeBucket[] = sized.length >= 6 ? [
    { ...stat(sized.slice(0, third).map((x) => x.t)), key: "Small" },
    { ...stat(sized.slice(third, 2 * third).map((x) => x.t)), key: "Medium" },
    { ...stat(sized.slice(2 * third).map((x) => x.t)), key: "Large" },
  ] : [];

  const bySetup = bucket(trades, (t) => t.setup_type, 2);
  const bySymbol = bucket(trades, (t) => t.symbol.replace(".NS", ""), 2);
  const bySide = bucket(trades, (t) => t.side, 1);

  // ── biggest leak: the most negative, statistically-meaningful pattern ──
  const leaks: { label: string; detail: string; severity: number }[] = [];
  if (afterLoss.length >= 3 && afterWin.length >= 3) {
    const dl = exp(afterLoss), dw = exp(afterWin);
    if (dl < 0 && dl < dw)
      leaks.push({ label: "Revenge / tilt", detail: `After a loss your avg P&L is ₹${Math.round(dl)} vs ₹${Math.round(dw)} after a win — you trade worse when stung.`, severity: dw - dl });
  }
  if (afterStreak.length >= 3 && exp(afterStreak) < 0)
    leaks.push({ label: "Losing-streak tilt", detail: `After 2+ straight losses you average ₹${Math.round(exp(afterStreak))} — stop and reset instead.`, severity: -exp(afterStreak) });
  if (sizeBuckets.length === 3) {
    const big = sizeBuckets.find((b) => b.key === "Large")!, sm = sizeBuckets.find((b) => b.key === "Small")!;
    if (big.expectancy < 0 && big.expectancy < sm.expectancy)
      leaks.push({ label: "Oversizing", detail: `Your largest positions average ₹${Math.round(big.expectancy)} vs ₹${Math.round(sm.expectancy)} on small ones — size down.`, severity: sm.expectancy - big.expectancy });
  }
  const worstSetup = bySetup[bySetup.length - 1];
  if (worstSetup && worstSetup.expectancy < 0 && bySetup.length > 1)
    leaks.push({ label: `Setup: ${worstSetup.key}`, detail: `"${worstSetup.key}" loses ₹${Math.abs(Math.round(worstSetup.expectancy))}/trade over ${worstSetup.n} trades — drop or refine it.`, severity: -worstSetup.expectancy });
  const worstSym = bySymbol[bySymbol.length - 1];
  if (worstSym && worstSym.expectancy < 0 && bySymbol.length > 1)
    leaks.push({ label: `Symbol: ${worstSym.key}`, detail: `You're down on ${worstSym.key} (${worstSym.n} trades, ₹${Math.round(worstSym.expectancy)}/trade) — it may not suit your style.`, severity: -worstSym.expectancy });
  leaks.sort((a, b) => b.severity - a.severity);

  return {
    n: trades.length,
    tilt: { afterWin: stat(afterWin), afterLoss: stat(afterLoss), afterStreak: stat(afterStreak) },
    sizeBuckets, bySetup, bySymbol, bySide, leaks,
  };
}

function stat(ts: Trade[]) {
  return { key: "", n: ts.length, winRate: wr(ts), expectancy: exp(ts), total: ts.reduce((s, t) => s + (t.pnl || 0), 0) };
}
