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

/** Normalized % change from first close — for compare-overlay lines. */
export function normalized(candles: Candle[]): LinePoint[] {
  if (!candles.length) return [];
  const base = candles[0].c;
  return candles.map((c) => ({ time: c.t, value: r(((c.c - base) / base) * 100) }));
}
