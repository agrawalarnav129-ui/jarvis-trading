import { useMemo, useState } from "react";
import { Activity, Waves, Grid3x3, Dices, Network, Compass } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty, Skeleton } from "../components/ui";
import SymbolSearch from "../components/SymbolSearch";
import { fmt, fmtInt } from "../lib/format";
import { simulate, type MCInput } from "../lib/montecarlo";

type Tab = "gex" | "vol" | "exp" | "mc" | "corr" | "rrg";
const TABS: [Tab, string, any][] = [
  ["rrg", "Rotation", Compass], ["gex", "Gamma (GEX)", Activity], ["vol", "Volatility", Waves],
  ["exp", "Expectancy", Grid3x3], ["mc", "Monte Carlo", Dices], ["corr", "Correlation", Network],
];

// Module-scope so the input isn't recreated each render (would drop focus).
function Slider({ label, val, set, min, max, step, suffix }: { label: string; val: number; set: (v: number) => void; min: number; max: number; step: number; suffix: string }) {
  return (
    <div>
      <div className="flex justify-between label mb-1"><span>{label}</span><span className="text-txt font-mono">{val}{suffix}</span></div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => set(parseFloat(e.target.value))} className="w-full accent-brand cursor-pointer" />
    </div>
  );
}

const heat = (v: number, lo: number, hi: number) => {
  const t = Math.max(-1, Math.min(1, v >= 0 ? v / (hi || 1) : v / Math.abs(lo || 1)));
  return v >= 0 ? `rgba(34,197,94,${0.12 + 0.6 * t})` : `rgba(239,68,68,${0.12 + 0.6 * -t})`;
};

// ── Gamma Exposure ──────────────────────────────────────────────────────────
function GEX() {
  const [sym, setSym] = useState("NIFTY");
  const { data, loading } = useFetch(() => api.gex(sym), [sym]);
  if (loading) return <Skeleton h={320} />;
  if (!data || !data.available) return <Empty msg={data?.note || "Gamma exposure needs an option snapshot — refresh it from the Options page."} />;
  const maxAbs = Math.max(...data.profile.map((p) => Math.abs(p.gex)), 1e-6);
  return (
    <>
      <div className="flex gap-1.5 mb-3">
        {["NIFTY", "BANKNIFTY"].map((s) => (
          <button key={s} onClick={() => setSym(s)} className={`px-2.5 py-1 rounded text-[0.65rem] font-mono cursor-pointer ${sym === s ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{s}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <Card><div className="label">Net GEX · {data.expiry}</div><div className={`font-display text-lg mt-1 ${data.total_gex >= 0 ? "text-up" : "text-down"}`}>{data.total_gex >= 0 ? "+" : ""}{fmt(data.total_gex)}</div></Card>
        <Card><div className="label">Regime</div><div className={`font-mono text-[0.7rem] mt-1.5 ${data.total_gex >= 0 ? "text-up" : "text-down"}`}>{data.regime}</div></Card>
        <Card className="border-l-2 border-l-gold"><div className="label">Zero-Gamma Flip</div><div className="font-display text-lg text-gold mt-1">{data.zero_gamma ? fmtInt(data.zero_gamma) : "—"}</div></Card>
        <Card><div className="label">σ used · {data.dte}d</div><div className="font-display text-lg text-txt mt-1">{data.sigma}%</div></Card>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Card className="border-l-2 border-l-down"><div className="label">Call Wall (resistance)</div><div className="font-display text-lg text-down mt-1">{data.call_wall ? fmtInt(data.call_wall) : "—"}</div></Card>
        <Card className="border-l-2 border-l-up"><div className="label">Put Wall (support)</div><div className="font-display text-lg text-up mt-1">{data.put_wall ? fmtInt(data.put_wall) : "—"}</div></Card>
      </div>
      <Card>
        <div className="label mb-2">Gamma by strike — <span className="text-down">negative</span> / <span className="text-up">positive</span> · spot {fmt(data.spot)}</div>
        <div className="flex flex-col gap-px">
          {data.profile.map((p) => {
            const atSpot = Math.abs(p.strike - data.spot) === Math.min(...data.profile.map((x) => Math.abs(x.strike - data.spot)));
            const w = (Math.abs(p.gex) / maxAbs) * 50;
            return (
              <div key={p.strike} className="flex items-center gap-1 h-3.5 text-[0.55rem] font-mono">
                <div className="flex-1 flex justify-end">{p.gex < 0 && <div style={{ width: `${w}%` }} className="h-2.5 bg-down/55 rounded-l-sm" />}</div>
                <div className={`w-14 text-center ${p.strike === data.zero_gamma ? "text-gold font-bold" : atSpot ? "text-brand" : "text-faint"}`}>{p.strike}</div>
                <div className="flex-1">{p.gex >= 0 && <div style={{ width: `${w}%` }} className="h-2.5 bg-up/55 rounded-r-sm" />}</div>
              </div>
            );
          })}
        </div>
        <div className="text-[0.55rem] text-faint mt-2 font-mono">Source: {data.source} · gamma from realized-vol proxy (no live IV) — read sign &amp; levels, not absolute magnitude.</div>
      </Card>
    </>
  );
}

// ── Volatility Cone ─────────────────────────────────────────────────────────
function VolCone() {
  const [sym, setSym] = useState("RELIANCE.NS");
  const { data, loading } = useFetch(() => api.volCone(sym), [sym]);
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <SymbolSearch value={sym} onPick={setSym} />
        <span className="font-mono text-xs text-txt">{sym.replace(".NS", "")}</span>
        {data?.available && <span className={`ml-auto font-mono text-[0.7rem] ${data.regime === "Elevated" ? "text-down" : data.regime === "Compressed" ? "text-up" : "text-gold"}`}>Vol regime: {data.regime}</span>}
      </div>
      {loading ? <Skeleton h={260} /> : !data || !data.available ? <Empty msg={data?.note || "No data."} /> : (
        <Card>
          <div className="label mb-3">Realized-volatility cone — current vs historical range by lookback window (ann. %)</div>
          <div className="flex flex-col gap-2.5">
            {data.cone.map((c) => {
              const span = c.max - c.min || 1;
              const pos = (v: number) => ((v - c.min) / span) * 100;
              return (
                <div key={c.window} className="flex items-center gap-2 text-[0.6rem] font-mono">
                  <div className="w-10 text-faint text-right">{c.window}d</div>
                  <div className="relative flex-1 h-4 bg-base rounded">
                    <div className="absolute top-1/2 -translate-y-1/2 h-1 bg-line rounded" style={{ left: `${pos(c.p25)}%`, width: `${pos(c.p75) - pos(c.p25)}%` }} />
                    <div className="absolute top-0 bottom-0 w-px bg-faint" style={{ left: `${pos(c.median)}%` }} title={`median ${c.median}`} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ left: `calc(${pos(c.current)}% - 4px)`, background: c.current > c.median ? "#ef4444" : "#22c55e" }} title={`current ${c.current}`} />
                  </div>
                  <div className={`w-12 text-right ${c.current > c.median ? "text-down" : "text-up"}`}>{c.current}%</div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[0.55rem] text-faint mt-3 font-mono"><span>IQR bar · median tick · ● current</span><span>green = below median (cheap vol)</span></div>
        </Card>
      )}
    </>
  );
}

// ── Expectancy Surface ──────────────────────────────────────────────────────
function Expectancy() {
  const [sym, setSym] = useState("RELIANCE.NS");
  const { data, loading } = useFetch(() => api.expectancySurface(sym), [sym]);
  const cell = (stop: number, target: number) => data?.cells.find((c) => c.stop === stop && c.target === target);
  const ext = useMemo(() => {
    const e = (data?.cells || []).map((c) => c.expectancy);
    return { lo: Math.min(0, ...e), hi: Math.max(0, ...e) };
  }, [data]);
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <SymbolSearch value={sym} onPick={setSym} />
        <span className="font-mono text-xs text-txt">{sym.replace(".NS", "")}</span>
        {data?.best && <span className="ml-auto font-mono text-[0.65rem] text-up">Best: {data.best.target}R @ {data.best.stop}×ATR → {data.best.expectancy}R</span>}
      </div>
      {loading ? <Skeleton h={260} /> : !data || !data.available ? <Empty msg={data?.note || "No data."} /> : (
        <Card>
          <div className="label mb-2">Expectancy (R/trade) — breakout backtest over stop(ATR) × target(R:R)</div>
          <div className="overflow-x-auto">
            <table className="text-[0.6rem] font-mono border-collapse">
              <thead><tr><th className="p-1 text-faint">stop↓ / tgt→</th>{data.targets.map((t) => <th key={t} className="p-1 text-faint w-12">{t}R</th>)}</tr></thead>
              <tbody>
                {data.stops.map((s) => (
                  <tr key={s}>
                    <td className="p-1 text-faint">{s}×ATR</td>
                    {data.targets.map((t) => {
                      const c = cell(s, t); const isBest = data.best && c === data.best;
                      return (
                        <td key={t} className={`p-1 text-center rounded ${isBest ? "ring-1 ring-gold" : ""}`}
                          style={{ background: c ? heat(c.expectancy, ext.lo, ext.hi) : undefined }}
                          title={c ? `${c.trades} trades · win ${(c.win_rate * 100).toFixed(0)}%` : ""}>
                          <div className={c && c.expectancy >= 0 ? "text-txt" : "text-txt"}>{c ? c.expectancy.toFixed(2) : "·"}</div>
                          <div className="text-[0.5rem] text-faint">{c?.trades ?? 0}t</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[0.55rem] text-faint mt-2 font-mono">Cell = expectancy in R · small number = trade count · gold ring = best (≥5 trades). Green deeper = higher edge.</div>
        </Card>
      )}
    </>
  );
}

// ── Monte Carlo ─────────────────────────────────────────────────────────────
function MonteCarlo() {
  const [winRate, setWin] = useState(45);
  const [payoff, setPayoff] = useState(2);
  const [riskPct, setRisk] = useState(2);
  const [trades, setTrades] = useState(100);
  const sims = 3000;
  const res = useMemo(() => {
    const inp: MCInput = { winRate: winRate / 100, payoff, riskPct, trades, sims, startEquity: 1_000_000 };
    return simulate(inp);
  }, [winRate, payoff, riskPct, trades]);

  const W = 320, H = 120;
  const allMax = Math.max(...res.paths.flat(), 1);
  const path = (p: number[]) => p.map((v, i) => `${(i / (p.length - 1)) * W},${H - (v / allMax) * H}`).join(" ");

  return (
    <>
      <Card className="mb-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Slider label="Win rate" val={winRate} set={setWin} min={10} max={90} step={1} suffix="%" />
          <Slider label="Payoff (avg win / loss)" val={payoff} set={setPayoff} min={0.5} max={5} step={0.1} suffix="R" />
          <Slider label="Risk per trade" val={riskPct} set={setRisk} min={0.5} max={10} step={0.5} suffix="%" />
          <Slider label="Trades" val={trades} set={setTrades} min={20} max={300} step={10} suffix="" />
        </div>
      </Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <Card><div className="label">Expectancy</div><div className={`font-display text-lg mt-1 ${res.expectancyR >= 0 ? "text-up" : "text-down"}`}>{res.expectancyR >= 0 ? "+" : ""}{res.expectancyR.toFixed(2)}R</div></Card>
        <Card><div className="label">Risk of Ruin (−50%)</div><div className={`font-display text-lg mt-1 ${res.riskOfRuin > 20 ? "text-down" : res.riskOfRuin > 5 ? "text-gold" : "text-up"}`}>{res.riskOfRuin.toFixed(1)}%</div></Card>
        <Card><div className="label">P(profit)</div><div className="font-display text-lg text-txt mt-1">{res.profitProb.toFixed(0)}%</div></Card>
        <Card className="border-l-2 border-l-gold"><div className="label">Kelly fraction</div><div className="font-display text-lg text-gold mt-1">{(res.kelly * 100).toFixed(0)}%</div></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-2"><div className="label">{sims.toLocaleString()} simulated equity paths</div><div className="font-mono text-[0.6rem] text-faint">start ₹10L</div></div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }} preserveAspectRatio="none">
          {res.paths.map((p, i) => <polyline key={i} points={path(p)} fill="none" stroke={p[p.length - 1] >= 1_000_000 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"} strokeWidth={0.6} />)}
        </svg>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <div><div className="label">P5 (bad)</div><div className="font-mono text-xs text-down mt-0.5">₹{fmtInt(res.p5)}</div></div>
          <div><div className="label">Median</div><div className="font-mono text-xs text-txt mt-0.5">₹{fmtInt(res.median)}</div></div>
          <div><div className="label">P95 (good)</div><div className="font-mono text-xs text-up mt-0.5">₹{fmtInt(res.p95)}</div></div>
        </div>
        <div className="text-[0.55rem] text-faint mt-2 font-mono text-center">Median worst drawdown along the way: <span className="text-down">{res.medianMaxDD.toFixed(0)}%</span> · if Kelly &lt; your risk %, you're over-betting.</div>
      </Card>
    </>
  );
}

// ── Correlation Matrix ──────────────────────────────────────────────────────
function Correlation() {
  const { data, loading } = useFetch(() => api.correlation([]), []);
  if (loading) return <Skeleton h={300} />;
  if (!data || !data.available) return <Empty msg={data?.note || "Need a watchlist with cached closes."} />;
  const cc = (v: number) => v >= 0 ? `rgba(239,68,68,${0.1 + 0.55 * v})` : `rgba(34,197,94,${0.1 + 0.55 * -v})`;
  return (
    <>
      <Card className="mb-3"><div className="flex items-center justify-between">
        <div><div className="label">Avg pairwise correlation</div><div className={`font-display text-lg mt-1 ${data.avg_corr > 0.5 ? "text-down" : data.avg_corr < 0.3 ? "text-up" : "text-gold"}`}>{data.avg_corr}</div></div>
        <div className="text-[0.6rem] font-mono text-faint text-right max-w-[55%]">{data.avg_corr > 0.5 ? "Highly correlated — concentrated risk, you're effectively in one bet." : data.avg_corr < 0.3 ? "Well diversified — independent moves." : "Moderate clustering."}<br />{data.bars} bars · {data.symbols.length} symbols</div>
      </div></Card>
      <Card>
        <div className="label mb-2">Return correlation — <span className="text-down">red = move together</span>, <span className="text-up">green = hedge</span></div>
        <div className="overflow-x-auto">
          <table className="text-[0.55rem] font-mono border-collapse">
            <thead><tr><th className="p-1"></th>{data.symbols.map((s) => <th key={s} className="p-1 text-faint align-bottom"><div className="h-12 flex items-end justify-center"><span style={{ writingMode: "vertical-rl" }} className="rotate-180">{s}</span></div></th>)}</tr></thead>
            <tbody>
              {data.matrix.map((row, i) => (
                <tr key={i}>
                  <td className="p-1 text-faint whitespace-nowrap pr-2">{data.symbols[i]}</td>
                  {row.map((v, j) => (
                    <td key={j} className="p-1 text-center w-9 h-7 rounded" style={{ background: i === j ? "rgba(34,211,238,0.15)" : cc(v) }} title={`${data.symbols[i]} vs ${data.symbols[j]}: ${v}`}>
                      <span className={i === j ? "text-brand" : "text-txt"}>{v.toFixed(1)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ── Relative Rotation Graph ─────────────────────────────────────────────────
function RRG() {
  const { data, loading } = useFetch(() => api.rrg([], 8), []);
  const QUAD = [
    { name: "Leading", color: "#22c55e", at: [78, 20] }, { name: "Weakening", color: "#fbbf24", at: [78, 88] },
    { name: "Lagging", color: "#ef4444", at: [10, 88] }, { name: "Improving", color: "#22d3ee", at: [10, 20] },
  ];
  if (loading) return <Skeleton h={360} />;
  if (!data || !data.available) return <Empty msg={data?.note || "Rotation graph needs cached closes + NIFTY benchmark."} />;
  const xs = data.points.flatMap((p) => p.tail.map((t) => t[0]));
  const ys = data.points.flatMap((p) => p.tail.map((t) => t[1]));
  const lo = Math.min(95, ...xs, ...ys), hi = Math.max(105, ...xs, ...ys);
  const sc = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const qcolor = (q: string) => QUAD.find((x) => x.name === q)?.color || "#94a3b8";
  return (
    <Card>
      <div className="label mb-1">Relative Rotation vs NIFTY — tails show 8-day trajectory (rotate clockwise)</div>
      <div className="relative w-full" style={{ aspectRatio: "1/1", maxWidth: 460, margin: "0 auto" }}>
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="50" y="0" width="50" height="50" fill="rgba(34,197,94,0.05)" />
          <rect x="50" y="50" width="50" height="50" fill="rgba(251,191,36,0.05)" />
          <rect x="0" y="50" width="50" height="50" fill="rgba(239,68,68,0.05)" />
          <rect x="0" y="0" width="50" height="50" fill="rgba(34,211,238,0.05)" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="#1e2d44" strokeWidth="0.4" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#1e2d44" strokeWidth="0.4" />
          {QUAD.map((q) => <text key={q.name} x={q.at[0]} y={q.at[1]} fill={q.color} fontSize="3" opacity="0.7" fontFamily="monospace">{q.name}</text>)}
          {data.points.map((p) => {
            const pts = p.tail.map((t) => `${sc(t[0])},${100 - sc(t[1])}`).join(" ");
            const c = qcolor(p.quadrant);
            return (
              <g key={p.symbol}>
                <polyline points={pts} fill="none" stroke={c} strokeWidth="0.5" opacity="0.5" />
                <circle cx={sc(p.x)} cy={100 - sc(p.y)} r="1.6" fill={c} />
                <text x={sc(p.x) + 2} y={100 - sc(p.y) + 1} fill="#cbd5e1" fontSize="2.6" fontFamily="monospace">{p.symbol}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3">
        {QUAD.map((q) => {
          const members = data.points.filter((p) => p.quadrant === q.name).map((p) => p.symbol);
          return <div key={q.name} className="text-[0.6rem] font-mono"><span style={{ color: q.color }}>● {q.name}</span><div className="text-faint mt-0.5 truncate">{members.join(", ") || "—"}</div></div>;
        })}
      </div>
    </Card>
  );
}

export default function Quant() {
  const [tab, setTab] = useState<Tab>("rrg");
  return (
    <Section title="Quant Lab" right={
      <div className="flex gap-0.5 flex-wrap justify-end">
        {TABS.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} title={label}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[0.62rem] font-mono cursor-pointer transition-colors ${tab === t ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>
            <Icon size={12} /><span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    }>
      {tab === "rrg" && <RRG />}
      {tab === "gex" && <GEX />}
      {tab === "vol" && <VolCone />}
      {tab === "exp" && <Expectancy />}
      {tab === "mc" && <MonteCarlo />}
      {tab === "corr" && <Correlation />}
    </Section>
  );
}
