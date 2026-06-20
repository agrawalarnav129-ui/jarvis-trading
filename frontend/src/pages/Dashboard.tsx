import { useEffect, useState, lazy, Suspense } from "react";
import { RefreshCw, ExternalLink, ChevronRight, CalendarClock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { fmt, fmtInt, signColor, arrow } from "../lib/format";
import { Card, Panel, Skeleton, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";
import { listWatch } from "../lib/watchlist";
import GlobalMacro from "../components/GlobalMacro";
import LiveNews from "../components/LiveNews";
import LiveVideo from "../components/LiveVideo";
const WorldMap = lazy(() => import("../components/WorldMap"));

function IndexStrip() {
  const { data, loading } = useFetch(() => api.indices(), [], 90_000);
  if (loading) return <Skeleton h={84} />;
  const items = data?.indices ?? [];
  if (!items.length) return <Empty msg="Index feed unavailable." />;
  return (
    <div className="flex gap-2.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1">
      {items.map((i) => {
        const up = i.pct >= 0;
        return (
          <div key={i.name} className="card px-3 py-2.5 min-w-[148px] flex-shrink-0"
               style={{ borderLeft: `2px solid ${up ? "#22c55e" : "#ef4444"}` }}>
            <div className="label">{i.name}</div>
            <div className="font-display text-base text-txt mt-1 tabular-nums">{fmt(i.last)}</div>
            <div className={`font-mono text-xs mt-0.5 ${signColor(i.pct)}`}>{arrow(i.pct)} {fmt(i.change)} ({i.pct >= 0 ? "+" : ""}{fmt(i.pct)}%)</div>
          </div>
        );
      })}
    </div>
  );
}

function EventGuard() {
  const nav = useNavigate();
  const [syms, setSyms] = useState<string[]>([]);
  useEffect(() => { listWatch().then(setSyms); }, []);
  const events = useFetch(() => (syms.length ? api.eventsWatch(syms, 10) : Promise.resolve(null)), [syms.join(",")]);
  const ev = events.data;
  if (!ev?.any) return null;
  return (
    <div onClick={() => nav("/watchlist")} className="card mb-3 border-l-2 border-l-gold cursor-pointer hover:bg-elevated/40 transition-colors px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1.5"><CalendarClock size={13} className="text-gold" /><span className="label text-gold">Event Guard · next 10 days</span><ChevronRight size={12} className="text-faint ml-auto" /></div>
      <div className="flex flex-wrap gap-1.5">
        {ev.flagged.slice(0, 8).map((e, i) => (
          <span key={`f${i}`} className="text-[0.62rem] font-mono text-gold bg-gold/10 border border-gold/30 rounded px-1.5 py-0.5">⚠ {e.symbol} · {e.purpose || "event"} · {e.date_str}</span>
        ))}
        {ev.macro.slice(0, 4).map((e, i) => (
          <span key={`m${i}`} className="text-[0.62rem] font-mono text-down bg-down/10 border border-down/30 rounded px-1.5 py-0.5">{e.event} · {e.date_str}</span>
        ))}
      </div>
    </div>
  );
}

function MarketBreadth() {
  const { data, loading } = useFetch(() => api.breadth(), [], 600_000);
  if (loading) return <Skeleton h={84} />;
  if (!data || !data.available) return <Empty msg={data?.note || "Breadth needs the closes cache."} />;
  const healthColor = data.health === "Risk-On" ? "text-up" : data.health === "Risk-Off" ? "text-down" : "text-gold";
  const Tile = ({ label, value, color = "text-txt", sub }: any) => (
    <div className="card px-3 py-2.5 min-w-[130px] flex-shrink-0"><div className="label">{label}</div>
      <div className={`font-display text-base mt-1 tabular-nums ${color}`}>{value}</div>{sub && <div className="font-mono text-[0.56rem] text-faint mt-0.5">{sub}</div>}</div>
  );
  return (
    <div className="flex gap-2.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1">
      <div className="card px-3 py-2.5 min-w-[150px] flex-shrink-0" style={{ borderLeft: `2px solid ${data.health === "Risk-On" ? "#22c55e" : data.health === "Risk-Off" ? "#ef4444" : "#fbbf24"}` }}>
        <div className="label">Market Health</div><div className={`font-display text-base mt-1 ${healthColor}`}>{data.health}</div>
        <div className="font-mono text-[0.56rem] text-faint mt-0.5">score {data.score}/100 · {data.universe} stk</div>
      </div>
      <Tile label="Above 50-DMA" value={`${data.pct_above_ema50}%`} color={data.pct_above_ema50 >= 50 ? "text-up" : "text-down"} />
      <Tile label="Above 200-DMA" value={`${data.pct_above_ema200}%`} color={data.pct_above_ema200 >= 50 ? "text-up" : "text-down"} />
      <Tile label="Advancers / Decliners" value={`${data.advancers} / ${data.decliners}`} color={data.advancers >= data.decliners ? "text-up" : "text-down"} />
      <Tile label="New Highs / Lows" value={`${data.new_highs} / ${data.new_lows}`} color={data.new_highs >= data.new_lows ? "text-up" : "text-down"} sub="52-week" />
    </div>
  );
}

function QuantSignals() {
  const nav = useNavigate();
  const gex = useFetch(() => api.gex("NIFTY"), [], 300_000);
  const g = gex.data;
  const Tile = ({ label, value, color = "text-txt", sub }: { label: string; value: string; color?: string; sub?: string }) => (
    <div className="card px-3 py-2.5 min-w-[140px] flex-shrink-0">
      <div className="label">{label}</div>
      <div className={`font-display text-base mt-1 tabular-nums ${color}`}>{value}</div>
      {sub && <div className="font-mono text-[0.58rem] text-faint mt-0.5">{sub}</div>}
    </div>
  );
  if (gex.loading) return <Skeleton h={84} />;
  if (!g || !g.available)
    return <Empty msg={g?.note || "Quant signals need an option snapshot — refresh it from the Options page."} />;
  const pos = g.total_gex >= 0;
  return (
    <div onClick={() => nav("/quant")} className="cursor-pointer group">
      <div className="flex gap-2.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1">
        <div className="card px-3 py-2.5 min-w-[150px] flex-shrink-0" style={{ borderLeft: `2px solid ${pos ? "#22c55e" : "#ef4444"}` }}>
          <div className="label">NIFTY Gamma</div>
          <div className={`font-display text-base mt-1 ${pos ? "text-up" : "text-down"}`}>{pos ? "Positive" : "Negative"}</div>
          <div className="font-mono text-[0.58rem] text-faint mt-0.5">{pos ? "Mean-reverting" : "Trend-amplifying"}</div>
        </div>
        <Tile label="Zero-Gamma Flip" value={g.zero_gamma ? fmtInt(g.zero_gamma) : "—"} color="text-gold" sub={`spot ${fmtInt(g.spot)}`} />
        <Tile label="Call Wall ↑res" value={g.call_wall ? fmtInt(g.call_wall) : "—"} color="text-down" />
        <Tile label="Put Wall ↓sup" value={g.put_wall ? fmtInt(g.put_wall) : "—"} color="text-up" />
        <div className="card px-3 py-2.5 min-w-[120px] flex-shrink-0 flex items-center justify-center text-faint group-hover:text-brand transition-colors">
          <span className="font-mono text-[0.62rem]">Quant Lab</span><ChevronRight size={13} />
        </div>
      </div>
    </div>
  );
}

function RotationSignals() {
  const nav = useNavigate();
  const rrg = useFetch(() => api.rrg([], 8), []);
  const d = rrg.data;
  const QUAD: [string, string][] = [["Leading", "#22c55e"], ["Improving", "#22d3ee"], ["Weakening", "#fbbf24"], ["Lagging", "#ef4444"]];
  if (rrg.loading) return <Skeleton h={84} />;
  if (!d || !d.available) return <Empty msg={d?.note || "Rotation needs cached closes + NIFTY benchmark."} />;
  return (
    <div onClick={() => nav("/quant")} className="cursor-pointer group">
      <div className="flex gap-2.5 overflow-x-auto scroll-thin pb-1 -mx-1 px-1">
        {QUAD.map(([q, c]) => {
          const members = d.points.filter((p) => p.quadrant === q).map((p) => p.symbol);
          return (
            <div key={q} className="card px-3 py-2.5 min-w-[150px] flex-shrink-0" style={{ borderLeft: `2px solid ${c}` }}>
              <div className="label" style={{ color: c }}>{q}</div>
              <div className="font-mono text-[0.72rem] text-txt mt-1 truncate">{members.slice(0, 3).join(", ") || "—"}</div>
              <div className="font-mono text-[0.56rem] text-faint mt-0.5">{members.length} name{members.length === 1 ? "" : "s"}</div>
            </div>
          );
        })}
        <div className="card px-3 py-2.5 min-w-[110px] flex-shrink-0 flex items-center justify-center text-faint group-hover:text-brand transition-colors">
          <span className="font-mono text-[0.62rem]">Rotation</span><ChevronRight size={13} />
        </div>
      </div>
    </div>
  );
}

function MoversTable({ rows, up, onSym }: { rows: { symbol: string; ltp: number; pct: number }[]; up: boolean; onSym: (s: string) => void }) {
  if (!rows.length) return <Empty msg="No data (market closed?)." />;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.symbol} onClick={() => onSym(r.symbol)} className="flex items-center justify-between py-1.5 border-b border-line/60 last:border-0 cursor-pointer hover:bg-elevated/40 -mx-1 px-1 rounded transition-colors">
          <span className="font-mono text-xs text-txt">{r.symbol}</span>
          <span className="font-mono text-[0.7rem] text-muted">₹{fmt(r.ltp, 1)}</span>
          <span className={`font-mono text-xs w-16 text-right ${up ? "text-up" : "text-down"}`}>{r.pct >= 0 ? "+" : ""}{fmt(r.pct)}%</span>
        </div>
      ))}
    </div>
  );
}

function CalendarPanel() {
  const { data, loading } = useFetch(() => api.calendar(), []);
  if (loading) return <Skeleton h={260} />;
  const macro = data?.macro ?? [];
  const corp = data?.corporate ?? [];
  const impactColor: Record<string, string> = { HIGH: "text-down", MED: "text-gold" };
  return (
    <div className="max-h-[420px] overflow-y-auto scroll-thin px-3">
      <div className="label mb-1.5">Macro & Market</div>
      {macro.map((e, i) => (
        <div key={i} className="flex justify-between items-start py-1.5 border-b border-line/50">
          <div><div className="text-[0.76rem] text-txt">{e.event}</div><div className="label mt-0.5 normal-case tracking-normal text-faint">{e.note}</div></div>
          <span className={`font-mono text-[0.62rem] ${impactColor[e.impact ?? ""] ?? "text-muted"}`}>{e.date_str}</span>
        </div>
      ))}
      <div className="label mt-3 mb-1.5">Results & Board Meetings</div>
      {corp.length ? corp.map((e, i) => (
        <div key={i} className="flex justify-between items-center py-1.5 border-b border-line/50 last:border-0">
          <div><span className="font-mono text-xs text-txt">{e.symbol}</span><span className="text-[0.6rem] text-faint ml-2">{e.purpose}</span></div>
          <span className="font-mono text-[0.62rem] text-gold">{e.date_str}</span>
        </div>
      )) : <Empty msg="No upcoming events." />}
    </div>
  );
}

function SectorHeatmap() {
  const { data, loading } = useFetch(() => api.sectors(), [], 180_000);
  if (loading) return <Skeleton h={90} />;
  const items = data?.sectors ?? [];
  if (!items.length) return <Empty msg="Sector data unavailable." />;
  const tile = (pct: number) => {
    const a = Math.min(Math.abs(pct) / 3, 1) * 0.55 + 0.08;
    return pct >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`;
  };
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {items.map((s) => (
        <div key={s.sector} className="rounded-lg p-2.5 border border-line/60" style={{ background: tile(s.pct) }}>
          <div className="font-mono text-[0.62rem] text-txt/90 truncate">{s.sector}</div>
          <div className={`font-display text-sm mt-1 ${s.pct >= 0 ? "text-up" : "text-down"}`}>{s.pct >= 0 ? "+" : ""}{fmt(s.pct)}%</div>
        </div>
      ))}
    </div>
  );
}

// WorldMonitor-style status ribbon: one dense strip of the key reads.
function CommandRibbon() {
  const regime = useFetch(() => api.regime(), []);
  const breadth = useFetch(() => api.breadth(), [], 600_000);
  const macro = useFetch(() => api.globalMacro(), [], 300_000);
  const fii = useFetch(() => api.fiiDii(), []);
  const seg = (label: string, value: string, color: string) => (
    <div className="flex items-center gap-1.5 px-3 shrink-0">
      <span className="label text-faint">{label}</span>
      <span className={`font-mono text-[0.72rem] font-semibold ${color}`}>{value}</span>
    </div>
  );
  const rc: Record<string, string> = { BULLISH: "text-up", BEARISH: "text-down", NEUTRAL: "text-gold" };
  const tc = (t?: string) => (t === "Risk-On" ? "text-up" : t === "Risk-Off" ? "text-down" : "text-gold");
  const f = fii.data;
  const mi = (l: string) => macro.data?.indices?.find((x) => x.label === l)?.pct;
  const spx = mi("S&P 500"); const vix = mi("VIX");
  return (
    <div className="card mb-3 flex items-stretch overflow-x-auto scroll-thin divide-x divide-line/70 h-11">
      <div className="flex items-center gap-1.5 px-3 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" style={{ boxShadow: "0 0 6px currentColor" }} />
        <span className="font-display text-[0.7rem] tracking-[0.2em] text-brand">SITREP</span>
      </div>
      {seg("REGIME", regime.data?.regime ?? "—", rc[regime.data?.regime ?? ""] ?? "text-faint")}
      {seg("GLOBAL", macro.data?.available ? `${macro.data.risk_tone} ${macro.data.risk_score}` : "—", tc(macro.data?.risk_tone))}
      {seg("S&P", spx == null ? "—" : `${spx >= 0 ? "+" : ""}${spx}%`, spx == null ? "text-faint" : spx >= 0 ? "text-up" : "text-down")}
      {seg("VIX", vix == null ? "—" : `${vix}`, vix == null ? "text-faint" : vix >= 0 ? "text-down" : "text-up")}
      {seg("BREADTH", breadth.data?.available ? `${breadth.data.health} ${breadth.data.score}` : "—", tc(breadth.data?.health))}
      {seg("ADV/DEC", breadth.data?.available ? `${breadth.data.advancers}/${breadth.data.decliners}` : "—", (breadth.data?.advancers ?? 0) >= (breadth.data?.decliners ?? 0) ? "text-up" : "text-down")}
      {f?.available && seg("FII", `${(f.fii?.net ?? 0) >= 0 ? "+" : ""}${fmtInt(f.fii?.net ?? 0)}`, signColor(f.fii?.net ?? 0))}
      {f?.available && seg("DII", `${(f.dii?.net ?? 0) >= 0 ? "+" : ""}${fmtInt(f.dii?.net ?? 0)}`, signColor(f.dii?.net ?? 0))}
    </div>
  );
}

export default function Dashboard() {
  const movers = useFetch(() => api.movers(), [], 90_000);
  const go = useSymbolNav();
  return (
    <div>
      <CommandRibbon />
      <EventGuard />

      {/* Hero: live global markets globe */}
      <div className="mb-3">
        <Suspense fallback={<div className="card h-[460px] animate-pulse" />}>
          <WorldMap />
        </Suspense>
      </div>

      {/* Signal strips */}
      <div className="grid grid-cols-1 gap-3 mb-3">
        <Panel title="Indian Indices · Live" status="info" bodyClass="p-2"><IndexStrip /></Panel>
        <Panel title="Market Breadth · Internals" status="info" bodyClass="p-2"><MarketBreadth /></Panel>
        <Panel title="NIFTY Gamma · Options Structure" status="info" bodyClass="p-2"><QuantSignals /></Panel>
        <Panel title="Sector Rotation · vs NIFTY" status="info" bodyClass="p-2"><RotationSignals /></Panel>
      </div>

      {/* Live TV + News */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-3">
        <div className="lg:col-span-7"><LiveVideo /></div>
        <div className="lg:col-span-5"><LiveNews /></div>
      </div>

      {/* Intel grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-6"><GlobalMacro /></div>
        <div className="lg:col-span-6">
          <Panel title="Economic & Events Calendar" status="warn" bodyClass="p-0"><CalendarPanel /></Panel>
        </div>

        <div className="lg:col-span-7">
          <Panel title="Top Gainers & Losers · NIFTY" status="normal"
            right={<button onClick={() => movers.reload()} className="text-faint hover:text-brand transition-colors cursor-pointer" aria-label="Refresh"><RefreshCw size={12} /></button>}>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="label text-up mb-1">▲ Gainers</div><MoversTable rows={movers.data?.gainers ?? []} up onSym={go} /></div>
              <div><div className="label text-down mb-1">▼ Losers</div><MoversTable rows={movers.data?.losers ?? []} up={false} onSym={go} /></div>
            </div>
          </Panel>
        </div>
        <div className="lg:col-span-5">
          <Panel title="Sector Heatmap · NSE" status="info"><SectorHeatmap /></Panel>
        </div>
      </div>
    </div>
  );
}
