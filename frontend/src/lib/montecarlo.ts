// Client-side Monte-Carlo risk engine + Kelly / risk-of-ruin. Pure math, runs
// instantly in the browser so the sliders feel live.

export interface MCInput {
  winRate: number;   // 0..1
  payoff: number;    // avg win / avg loss (R multiple on wins; losses = -1R)
  riskPct: number;   // % of equity risked per trade
  trades: number;    // trades per simulated path
  sims: number;      // number of paths
  startEquity: number;
}

export interface MCResult {
  paths: number[][];          // a few sample equity curves (for plotting)
  finals: number[];           // final equity of every sim (sorted asc)
  median: number; p5: number; p95: number; mean: number;
  maxDDs: number[];           // max drawdown % per sim (sorted asc)
  medianMaxDD: number; worstDD: number;
  riskOfRuin: number;         // P(equity drops below ruinLevel) %
  profitProb: number;         // P(final > start) %
  kelly: number;              // optimal fraction (0..1)
  expectancyR: number;        // expected R per trade
}

// Mulberry32 — deterministic, fast PRNG so results are stable per input.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function kellyFraction(winRate: number, payoff: number): number {
  if (payoff <= 0) return 0;
  return Math.max(0, winRate - (1 - winRate) / payoff);
}

export function simulate(inp: MCInput, ruinDrawdown = 0.5): MCResult {
  const { winRate, payoff, riskPct, trades, sims, startEquity } = inp;
  const rand = rng(0xA1014);
  const riskFrac = riskPct / 100;
  const finals: number[] = [];
  const maxDDs: number[] = [];
  const paths: number[][] = [];
  let ruined = 0, profitable = 0;
  const keepPaths = Math.min(40, sims);

  for (let s = 0; s < sims; s++) {
    let eq = startEquity, peak = startEquity, maxDD = 0;
    const path = s < keepPaths ? [eq] : null;
    let didRuin = false;
    for (let t = 0; t < trades; t++) {
      const win = rand() < winRate;
      // risk a fixed fraction of current equity; win pays payoff×risk, loss = −risk
      eq += eq * riskFrac * (win ? payoff : -1);
      if (eq <= 0) { eq = 0; }
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (!didRuin && dd >= ruinDrawdown) { didRuin = true; }
      path?.push(eq);
    }
    if (didRuin) ruined++;
    if (eq > startEquity) profitable++;
    finals.push(eq);
    maxDDs.push(maxDD * 100);
    if (path) paths.push(path);
  }

  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const mean = finals.reduce((a, b) => a + b, 0) / finals.length;

  return {
    paths, finals,
    median: q(finals, 0.5), p5: q(finals, 0.05), p95: q(finals, 0.95), mean,
    maxDDs, medianMaxDD: q(maxDDs, 0.5), worstDD: maxDDs[maxDDs.length - 1],
    riskOfRuin: (ruined / sims) * 100,
    profitProb: (profitable / sims) * 100,
    kelly: kellyFraction(winRate, payoff),
    expectancyR: winRate * payoff - (1 - winRate),
  };
}
