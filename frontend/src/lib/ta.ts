// Client-side technical indicators (mirrors utils/indicators.py math) so chart
// indicator toggles are instant — no refetch. Operate on candle arrays, return
// {time,value}[] ready for lightweight-charts series.setData().
import type { Candle } from "./api";

export type LinePoint = { time: number; value: number };
const r = (x: number) => Math.round(x * 100) / 100;

export function ema(candles: Candle[], period: number): LinePoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].c;
  let prev = sum / period;
  const out: LinePoint[] = [{ time: candles[period - 1].t, value: r(prev) }];
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].c * k + prev * (1 - k);
    out.push({ time: candles[i].t, value: r(prev) });
  }
  return out;
}

export function rsi(candles: Candle[], period = 14): LinePoint[] {
  if (candles.length <= period) return [];
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].c - candles[i - 1].c;
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  const val = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  const out: LinePoint[] = [{ time: candles[period].t, value: r(val(avgG, avgL)) }];
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].c - candles[i - 1].c;
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out.push({ time: candles[i].t, value: r(val(avgG, avgL)) });
  }
  return out;
}

export function bollinger(candles: Candle[], period = 20, mult = 2) {
  const mid: LinePoint[] = [], upper: LinePoint[] = [], lower: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].c;
    const m = sum / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (candles[j].c - m) ** 2;
    const sd = Math.sqrt(v / period);
    const t = candles[i].t;
    mid.push({ time: t, value: r(m) });
    upper.push({ time: t, value: r(m + mult * sd) });
    lower.push({ time: t, value: r(m - mult * sd) });
  }
  return { mid, upper, lower };
}

/** Volume histogram points, colored by candle direction. */
export function volume(candles: Candle[]) {
  return candles.map((c) => ({ time: c.t, value: c.v, color: c.c >= c.o ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)" }));
}

// ── EMA over a plain number[] (helper for MACD) ──
function emaArr(vals: number[], period: number): number[] {
  if (vals.length < period) return [];
  const k = 2 / (period + 1);
  let prev = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = new Array(period - 1).fill(NaN);
  out.push(prev);
  for (let i = period; i < vals.length; i++) { prev = vals[i] * k + prev * (1 - k); out.push(prev); }
  return out;
}

/** MACD(12,26,9): line, signal, and histogram (colored). */
export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const closes = candles.map((c) => c.c);
  const ef = emaArr(closes, fast), es = emaArr(closes, slow);
  const line: LinePoint[] = [], macdRaw: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(ef[i]) || isNaN(es[i])) { macdRaw.push(NaN); continue; }
    const m = ef[i] - es[i]; macdRaw.push(m); line.push({ time: candles[i].t, value: r(m) });
  }
  const valid = macdRaw.filter((x) => !isNaN(x));
  const sig = emaArr(valid, signal);
  const signalLine: LinePoint[] = [], hist: { time: number; value: number; color: string }[] = [];
  let vi = 0;
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(macdRaw[i])) continue;
    const s = sig[vi];
    if (!isNaN(s)) {
      signalLine.push({ time: candles[i].t, value: r(s) });
      const h = macdRaw[i] - s;
      hist.push({ time: candles[i].t, value: r(h), color: h >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)" });
    }
    vi++;
  }
  return { line, signal: signalLine, hist };
}

/** Stochastic oscillator %K (smoothed) and %D. */
export function stochastic(candles: Candle[], kP = 14, kSmooth = 3, dP = 3) {
  if (candles.length < kP) return { k: [] as LinePoint[], d: [] as LinePoint[] };
  const rawK: number[] = [];
  for (let i = kP - 1; i < candles.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { hi = Math.max(hi, candles[j].h); lo = Math.min(lo, candles[j].l); }
    rawK.push(hi === lo ? 50 : ((candles[i].c - lo) / (hi - lo)) * 100);
  }
  const sma = (a: number[], p: number) => a.map((_, i) => i < p - 1 ? NaN : a.slice(i - p + 1, i + 1).reduce((x, y) => x + y, 0) / p);
  const kS = sma(rawK, kSmooth), dS = sma(kS, dP);
  const base = kP - 1;
  const k: LinePoint[] = [], d: LinePoint[] = [];
  for (let i = 0; i < rawK.length; i++) {
    const t = candles[base + i].t;
    if (!isNaN(kS[i])) k.push({ time: t, value: r(kS[i]) });
    if (!isNaN(dS[i])) d.push({ time: t, value: r(dS[i]) });
  }
  return { k, d };
}

/** Anchored VWAP from the first bar (typical price × volume, cumulative). */
export function vwap(candles: Candle[]): LinePoint[] {
  let cumPV = 0, cumV = 0;
  return candles.map((c) => {
    const tp = (c.h + c.l + c.c) / 3;
    cumPV += tp * (c.v || 0); cumV += c.v || 0;
    return { time: c.t, value: r(cumV ? cumPV / cumV : c.c) };
  });
}

/** ATR (Wilder) as a plain series. */
function atrArr(candles: Candle[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].h - candles[i].l); continue; }
    const p = candles[i - 1].c;
    tr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - p), Math.abs(candles[i].l - p)));
  }
  const out = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  let a = tr.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  out[period] = a;
  for (let i = period + 1; i < candles.length; i++) { a = (a * (period - 1) + tr[i]) / period; out[i] = a; }
  return out;
}

/** Supertrend(10,3): trend-following line, segmented with direction for coloring. */
export function supertrend(candles: Candle[], period = 10, mult = 3) {
  const atr = atrArr(candles, period);
  const up: LinePoint[] = [], down: LinePoint[] = [];
  let prevST = NaN, prevDir = 1, prevUpper = NaN, prevLower = NaN;
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(atr[i])) continue;
    const c = candles[i], mid = (c.h + c.l) / 2;
    let upper = mid + mult * atr[i], lower = mid - mult * atr[i];
    if (!isNaN(prevUpper)) { upper = upper < prevUpper || candles[i - 1].c > prevUpper ? upper : prevUpper; lower = lower > prevLower || candles[i - 1].c < prevLower ? lower : prevLower; }
    let dir = prevDir;
    if (!isNaN(prevST)) dir = c.c > prevUpper ? 1 : c.c < prevLower ? -1 : prevDir;
    const st = dir === 1 ? lower : upper;
    (dir === 1 ? up : down).push({ time: c.t, value: r(st) });
    prevST = st; prevDir = dir; prevUpper = upper; prevLower = lower;
  }
  return { up, down };
}

/** Heikin-Ashi candles derived from raw OHLC. */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let pO = candles.length ? candles[0].o : 0, pC = candles.length ? candles[0].c : 0;
  for (const c of candles) {
    const ha_c = (c.o + c.h + c.l + c.c) / 4;
    const ha_o = out.length === 0 ? (c.o + c.c) / 2 : (pO + pC) / 2;
    const ha_h = Math.max(c.h, ha_o, ha_c), ha_l = Math.min(c.l, ha_o, ha_c);
    out.push({ t: c.t, o: r(ha_o), h: r(ha_h), l: r(ha_l), c: r(ha_c), v: c.v });
    pO = ha_o; pC = ha_c;
  }
  return out;
}

/** Normalized % change from first close — for compare-overlay lines. */
export function normalized(candles: Candle[]): LinePoint[] {
  if (!candles.length) return [];
  const base = candles[0].c;
  return candles.map((c) => ({ time: c.t, value: r(((c.c - base) / base) * 100) }));
}

export interface SDZone { lo: number; hi: number; touches: number; type: "supply" | "demand"; }

/**
 * Auto supply/demand zones: swing pivots (local extremes over ±k bars) are
 * clustered by price proximity; clusters with 2+ touches become zones.
 * Zones above the last close = supply (resistance), below = demand (support).
 */
export function sdZones(candles: Candle[], k = 8, maxZones = 6): SDZone[] {
  const n = candles.length;
  if (n < k * 2 + 10) return [];
  const pivots: { price: number; idx: number }[] = [];
  for (let i = k; i < n - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (candles[j].h > candles[i].h) isHigh = false;
      if (candles[j].l < candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ price: candles[i].h, idx: i });
    if (isLow) pivots.push({ price: candles[i].l, idx: i });
  }
  if (!pivots.length) return [];

  const last = candles[n - 1].c;
  const band = last * 0.015; // cluster width ≈1.5%
  pivots.sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; lastIdx: number }[] = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && p.price - c.prices[c.prices.length - 1] <= band) {
      c.prices.push(p.price); c.lastIdx = Math.max(c.lastIdx, p.idx);
    } else clusters.push({ prices: [p.price], lastIdx: p.idx });
  }
  return clusters
    .filter((c) => c.prices.length >= 2)
    .map((c) => ({
      lo: r(Math.min(...c.prices)), hi: r(Math.max(...c.prices)),
      touches: c.prices.length,
      type: (Math.min(...c.prices) + Math.max(...c.prices)) / 2 >= last ? "supply" as const : "demand" as const,
      _recency: c.lastIdx,
    }))
    .sort((a: any, b: any) => b.touches - a.touches || b._recency - a._recency)
    .slice(0, maxZones)
    .map(({ lo, hi, touches, type }) => ({ lo, hi, touches, type }));
}
