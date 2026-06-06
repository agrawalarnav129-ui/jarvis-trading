import { useState } from "react";
import { Activity, Loader2, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Cell } from "recharts";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";

export default function OrderFlow() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null); setData(null);
    try { setData(await api.footprint(symbol, 1)); }
    catch { setErr("No intraday data (markets closed, or symbol invalid). Try a liquid NSE symbol."); }
    finally { setLoading(false); }
  };

  // Build diverging bars: sell on the negative axis, buy on the positive
  const chartData = (data?.profile ?? []).map((p: any) => ({
    price: p.price, buy: p.buy_vol, sell: -p.sell_vol, delta: p.delta,
  }));

  return (
    <Section title="Order Flow · Footprint (Approximated)">
      <Card className="mb-3 border-l-2 border-l-gold">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-gold mt-0.5 shrink-0" />
          <div className="text-[0.66rem] text-muted font-mono leading-relaxed">{data?.note ?? "Estimated from 1-min OHLCV (no tick data). Directional read only — buy/sell split via close-position + tick rule."}</div>
        </div>
      </Card>

      <div className="flex gap-2.5 mb-4 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="label block mb-1">Symbol</label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60" />
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-4 py-2 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}{loading ? "Reading…" : "Run Recon"}
        </button>
      </div>

      {err && <Card><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!data && !loading && !err && <Empty msg="Run order-flow recon to see the volume-at-price footprint." />}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            <Card><div className="label">POC</div><div className="font-display text-base text-gold mt-1">₹{fmt(data.poc)}</div></Card>
            <Card><div className="label">Net Delta</div><div className={`font-display text-base mt-1 ${data.total_delta >= 0 ? "text-up" : "text-down"}`}>{fmtInt(data.total_delta)}</div></Card>
            <Card><div className="label">Bars</div><div className="font-display text-base text-txt mt-1">{data.bars}</div></Card>
            <Card><div className="label">Last</div><div className="font-display text-base text-txt mt-1">₹{fmt(data.last)}</div></Card>
          </div>

          <Card>
            <div className="label mb-2">Buy (right) vs Sell (left) volume per price</div>
            <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 16)}>
              <BarChart data={chartData} layout="vertical" stackOffset="sign" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="price" width={52} tick={{ fontSize: 9, fill: "#94a3b8", fontFamily: "monospace" }} reversed />
                <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid #1e2d44", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, n: any) => [fmtInt(Math.abs(v)), n === "sell" ? "Sell" : "Buy"]} />
                <ReferenceLine x={0} stroke="#1e2d44" />
                <Bar dataKey="sell" stackId="s" fill="#ef4444" fillOpacity={0.7} />
                <Bar dataKey="buy" stackId="s" fill="#22c55e" fillOpacity={0.7}>
                  {chartData.map((d: any, i: number) => (
                    <Cell key={i} fill={Math.abs(d.price - data.poc) < 0.01 ? "#fbbf24" : "#22c55e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </Section>
  );
}
