import { useState } from "react";
import { History, Loader2 } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";

const checks = (m: Record<string, number>) => [
  ["Win Rate > 40%", m.win_rate > 40],
  ["Avg R:R > 2.0", m.avg_rr > 2.0],
  ["Expectancy > 0.3R", m.expectancy > 0.3],
  ["Max Drawdown < 15%", m.max_drawdown < 15],
  ["Sharpe > 1.2", m.sharpe > 1.2],
  ["Profit Factor > 1.5", m.profit_factor > 1.5],
  ["Sample ≥ 50 trades", m.total_trades >= 50],
] as [string, boolean][];

export default function Backtester() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [rr, setRr] = useState(2.5);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try { setData(await api.backtest(symbol, rr)); }
    catch { setErr("Backtest failed (need ~220+ daily bars; the engine takes ~30–60s)."); }
    finally { setLoading(false); }
  };

  const m = data?.metrics;
  return (
    <Section title="Backtester · Breakout Strategy">
      <div className="flex flex-wrap gap-2.5 mb-4 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label block mb-1">Symbol</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60" />
        </div>
        <div className="w-28">
          <label className="label block mb-1">R:R Target</label>
          <select value={rr} onChange={(e) => setRr(parseFloat(e.target.value))}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
            {[1.5, 2.0, 2.5, 3.0].map((v) => <option key={v} value={v}>{v}:1</option>)}
          </select>
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-4 py-2 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}{loading ? "Running…" : "Run"}
        </button>
      </div>

      {err && <Card><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!data && !loading && !err && <Empty msg="Run a backtest to replay the breakout strategy with full metrics." />}

      {m && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            {[["Trades", m.total_trades], ["Win Rate", `${m.win_rate}%`], ["Expectancy", `${m.expectancy}R`], ["Profit Factor", m.profit_factor],
              ["Total P&L", `₹${fmtInt(m.total_pnl)}`], ["Return", `${m.total_return_pct}%`], ["Max DD", `${m.max_drawdown}%`], ["Sharpe", m.sharpe]].map(([k, v]) => (
              <Card key={k as string}><div className="label">{k}</div><div className="font-display text-base text-txt mt-1">{v}</div></Card>
            ))}
          </div>

          {data.equity?.length > 1 && (
            <Card className="mb-3">
              <div className="label mb-2">Equity Curve</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={data.equity.map((v: number, i: number) => ({ i, v }))}>
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid #1e2d44", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={() => ""} formatter={(v: any) => [`₹${fmtInt(v)}`, "Equity"]} />
                  <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="mb-3">
            <div className="label mb-2">Standards Check</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {checks(m).map(([name, ok]) => (
                <div key={name} className="flex justify-between font-mono text-xs py-0.5">
                  <span className="text-muted">{name}</span>
                  <span className={ok ? "text-up" : "text-down"}>{ok ? "✓ PASS" : "✗ FAIL"}</span>
                </div>
              ))}
            </div>
          </Card>

          {data.trades?.length > 0 && (
            <Card className="overflow-x-auto scroll-thin p-0">
              <table className="w-full text-left">
                <thead><tr className="text-faint border-b border-line">
                  {["Entry", "Exit", "Price", "P&L", "R", "Reason"].map((h) => <th key={h} className="label py-2.5 px-3">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.trades.slice().reverse().map((t: any, i: number) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-muted">{String(t.entry_date).slice(0, 10)}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-muted">{String(t.exit_date).slice(0, 10)}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.7rem] text-txt">₹{fmt(t.entry, 1)}</td>
                      <td className={`py-1.5 px-3 font-mono text-[0.7rem] ${t.pnl >= 0 ? "text-up" : "text-down"}`}>₹{fmtInt(t.pnl)}</td>
                      <td className={`py-1.5 px-3 font-mono text-[0.7rem] ${t.r_multiple >= 0 ? "text-up" : "text-down"}`}>{fmt(t.r_multiple, 1)}</td>
                      <td className="py-1.5 px-3 font-mono text-[0.65rem] text-faint">{t.exit_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </Section>
  );
}
