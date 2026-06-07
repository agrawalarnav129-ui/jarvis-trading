import { RefreshCw, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { fmt, fmtInt, signColor, arrow } from "../lib/format";
import { Card, Section, Skeleton, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";

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

function StatusRow() {
  const regime = useFetch(() => api.regime(), []);
  const fii = useFetch(() => api.fiiDii(), []);
  const movers = useFetch(() => api.movers(), [], 90_000);
  const r = regime.data;
  const f = fii.data;
  const m = movers.data;
  const regimeColor: Record<string, string> = { BULLISH: "text-up", BEARISH: "text-down", NEUTRAL: "text-gold" };
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
      <Card>
        <div className="label">Market Regime</div>
        {r ? (
          <>
            <div className={`font-display text-lg mt-1 ${regimeColor[r.regime] ?? "text-txt"}`}>{r.regime}</div>
            <div className="font-mono text-[0.62rem] text-muted mt-1">ADX {fmt(r.adx, 1)} · Max {r.max_positions} · R:R {r.min_rr}:1</div>
          </>
        ) : <div className="font-mono text-[0.66rem] text-faint mt-2">{regime.error ? "Unavailable" : "Loading…"}</div>}
      </Card>
      <Card>
        <div className="label">FII / DII Flows (₹ Cr){f?.date ? ` · ${f.date}` : ""}</div>
        {f?.available ? (
          <div className="flex gap-5 mt-1.5">
            <div><div className="text-[0.55rem] font-mono text-faint">FII</div><div className={`font-display text-base ${signColor(f.fii?.net ?? 0)}`}>{(f.fii?.net ?? 0) >= 0 ? "+" : ""}{fmtInt(f.fii?.net ?? 0)}</div></div>
            <div><div className="text-[0.55rem] font-mono text-faint">DII</div><div className={`font-display text-base ${signColor(f.dii?.net ?? 0)}`}>{(f.dii?.net ?? 0) >= 0 ? "+" : ""}{fmtInt(f.dii?.net ?? 0)}</div></div>
          </div>
        ) : <div className="font-mono text-[0.66rem] text-faint mt-2">Confirm manually.</div>}
      </Card>
      <Card className="col-span-2 lg:col-span-1">
        <div className="label">Nifty Breadth</div>
        {m?.available ? (
          <div className="flex gap-5 mt-1.5">
            <div><div className="text-[0.55rem] font-mono text-faint">Gainers</div><div className="font-display text-base text-up">{m.gainers.length}+</div></div>
            <div><div className="text-[0.55rem] font-mono text-faint">Losers</div><div className="font-display text-base text-down">{m.losers.length}+</div></div>
          </div>
        ) : <div className="font-mono text-[0.66rem] text-faint mt-2">Market closed.</div>}
      </Card>
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

function NewsPanel() {
  const { data, loading } = useFetch(() => api.news(), [], 300_000);
  if (loading) return <Skeleton h={260} />;
  const items = data?.news ?? [];
  if (!items.length) return <Empty msg="News feed unavailable." />;
  return (
    <Card className="max-h-[460px] overflow-y-auto scroll-thin">
      {items.map((n, idx) => (
        <a key={idx} href={n.link} target="_blank" rel="noreferrer"
           className="block py-2 border-b border-line/50 last:border-0 group cursor-pointer">
          <div className="text-[0.78rem] text-txt leading-snug group-hover:text-brandbright transition-colors">{n.title}</div>
          <div className="label mt-1 flex items-center gap-1">{n.source} · {n.published_str}
            <ExternalLink size={9} className="opacity-50" /></div>
        </a>
      ))}
    </Card>
  );
}

function CalendarPanel() {
  const { data, loading } = useFetch(() => api.calendar(), []);
  if (loading) return <Skeleton h={260} />;
  const macro = data?.macro ?? [];
  const corp = data?.corporate ?? [];
  const impactColor: Record<string, string> = { HIGH: "text-down", MED: "text-gold" };
  return (
    <Card className="max-h-[460px] overflow-y-auto scroll-thin">
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
    </Card>
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

export default function Dashboard() {
  const movers = useFetch(() => api.movers(), [], 90_000);
  const go = useSymbolNav();
  return (
    <div>
      <Section title="Market Pulse · Live Indices"><IndexStrip /></Section>
      <Section title="Status"><StatusRow /></Section>
      <Section title="Sector Heatmap"><SectorHeatmap /></Section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-4">
          <Section title="Market News"><NewsPanel /></Section>
        </div>
        <div className="lg:col-span-5">
          <Section title="Top Gainers & Losers · NIFTY" right={
            <button onClick={() => movers.reload()} className="text-faint hover:text-brand transition-colors cursor-pointer" aria-label="Refresh">
              <RefreshCw size={13} /></button>
          }>
            <div className="grid grid-cols-2 gap-2.5">
              <div><div className="label text-up mb-1">▲ Gainers</div><Card>{<MoversTable rows={movers.data?.gainers ?? []} up onSym={go} />}</Card></div>
              <div><div className="label text-down mb-1">▼ Losers</div><Card>{<MoversTable rows={movers.data?.losers ?? []} up={false} onSym={go} />}</Card></div>
            </div>
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section title="Economic & Events Calendar"><CalendarPanel /></Section>
        </div>
      </div>
    </div>
  );
}
