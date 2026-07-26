import { useState } from "react";
import { Bot, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Panel, Empty, Skeleton } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";
import EquityChart from "../components/EquityChart";
import { fmt, fmtInt } from "../lib/format";

export default function Paper() {
  const go = useSymbolNav();
  const { data, loading } = useFetch(() => api.paper(), [], 300_000);
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <Section title="Paper Trading · Autopilot"><Skeleton h={260} /></Section>;
  if (!data?.available)
    return (
      <Section title="Paper Trading · Autopilot">
        <Empty msg={data?.note || "No paper portfolios yet."} />
        <Card className="mt-3">
          <div className="label mb-1.5">How it works</div>
          <div className="text-[0.74rem] text-muted leading-relaxed">
            Enable 🔔 on any saved scan in <span className="text-brand">Screener → Builder</span>. Every 15 minutes
            during market hours, AXIOM takes that scan's new signals into a virtual portfolio using your rulebook —
            2% risk per trade, 1.5×ATR stop, 2R target, max 5 open — and tracks the result forward.
            Within weeks you get a genuine live track record, not a backtest.
          </div>
        </Card>
      </Section>
    );

  return (
    <Section title="Paper Trading · Autopilot" right={<span className="label">{data.portfolios.length} strateg{data.portfolios.length === 1 ? "y" : "ies"}</span>}>
      <div className="flex flex-col gap-3">
        {data.portfolios.map((p) => {
          const expanded = open === p.name;
          const totalR = p.total_r + p.open_r;
          return (
            <Panel key={p.name} title={p.name} status={totalR >= 0 ? "up" : "down"}
              meta={<span className={totalR >= 0 ? "text-up" : "text-down"}>{totalR >= 0 ? "+" : ""}{fmt(totalR)}R live</span>}>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                {[
                  ["Total R", `${p.total_r >= 0 ? "+" : ""}${fmt(p.total_r)}R`, p.total_r >= 0 ? "text-up" : "text-down"],
                  ["Open R", `${p.open_r >= 0 ? "+" : ""}${fmt(p.open_r)}R`, p.open_r >= 0 ? "text-up" : "text-down"],
                  ["Win Rate", `${p.win_rate}%`, p.win_rate >= 45 ? "text-up" : "text-gold"],
                  ["Trades", `${p.trades}`, "text-txt"],
                  ["Return", `${p.return_pct >= 0 ? "+" : ""}${fmt(p.return_pct)}%`, p.return_pct >= 0 ? "text-up" : "text-down"],
                  ["Max DD", `${fmt(p.max_drawdown)}%`, "text-down"],
                ].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="label">{l}</div>
                    <div className={`font-display text-sm mt-0.5 tabular-nums ${c}`}>{v}</div>
                  </div>
                ))}
              </div>

              {p.curve.length > 1 && <div className="mb-3"><EquityChart data={p.curve.map((c) => c.equity)} height={120} /></div>}

              {p.open.length > 0 && (
                <>
                  <div className="label mb-1 flex items-center gap-1"><TrendingUp size={11} className="text-brand" /> Open positions</div>
                  <div className="mb-2">
                    {p.open.map((o: any) => (
                      <div key={o.symbol} onClick={() => go(o.symbol)} className="flex items-center gap-2 py-1 text-[0.66rem] font-mono border-b border-line/40 last:border-0 cursor-pointer hover:bg-elevated/40">
                        <span className="text-txt w-24">{o.symbol}</span>
                        <span className="text-faint">@{fmt(o.entry)}</span>
                        <span className="text-faint">SL {fmt(o.stop)}</span>
                        <span className="text-faint hidden sm:inline">TGT {fmt(o.target)}</span>
                        <span className={`ml-auto ${(o.open_r ?? 0) >= 0 ? "text-up" : "text-down"}`}>{(o.open_r ?? 0) >= 0 ? "+" : ""}{fmt(o.open_r ?? 0)}R</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {p.closed.length > 0 && (
                <>
                  <button onClick={() => setOpen(expanded ? null : p.name)} className="flex items-center gap-1 text-[0.62rem] font-mono text-brand cursor-pointer">
                    {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {p.closed.length} closed trade{p.closed.length === 1 ? "" : "s"}
                  </button>
                  {expanded && (
                    <div className="mt-2 max-h-64 overflow-y-auto scroll-thin">
                      {p.closed.map((t: any, i: number) => (
                        <div key={i} onClick={() => go(t.symbol)} className="flex items-center gap-2 py-1 text-[0.62rem] font-mono border-b border-line/40 last:border-0 cursor-pointer hover:bg-elevated/40">
                          <span className="text-txt w-20">{t.symbol}</span>
                          <span className="text-faint w-20">{t.exit_date}</span>
                          <span className="text-faint w-14">{t.reason}</span>
                          <span className={`w-14 text-right ${t.r >= 0 ? "text-up" : "text-down"}`}>{t.r >= 0 ? "+" : ""}{fmt(t.r)}R</span>
                          <span className={`ml-auto ${t.pnl >= 0 ? "text-up" : "text-down"}`}>₹{fmtInt(t.pnl)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="text-[0.55rem] font-mono text-faint mt-2 flex items-center gap-1">
                <Bot size={10} /> since {p.started} · 2% risk · 1.5×ATR stop · 2R target · virtual ₹10L
              </div>
            </Panel>
          );
        })}
      </div>
    </Section>
  );
}
