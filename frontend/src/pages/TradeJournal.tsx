import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Cloud, HardDrive } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";
import { Section, Card, Empty } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";
import { Trade, addTrade, deleteTrade, listTrades, storageMode } from "../lib/trades";

const SETUPS = ["Breakout", "Momentum Continuation", "BB Squeeze", "Reversal", "Other"];

export default function TradeJournal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [form, setForm] = useState<Trade>({ symbol: "", side: "LONG", entry_price: 0, exit_price: 0, quantity: 0, pnl: 0, setup_type: "Breakout", notes: "" });

  const refresh = () => listTrades().then(setTrades);
  useEffect(() => { refresh(); }, []);

  const submit = async () => {
    if (!form.symbol.trim()) return;
    await addTrade({ ...form, symbol: form.symbol.toUpperCase() });
    setForm({ symbol: "", side: "LONG", entry_price: 0, exit_price: 0, quantity: 0, pnl: 0, setup_type: "Breakout", notes: "" });
    refresh();
  };
  const remove = async (id?: string) => { if (id) { await deleteTrade(id); refresh(); } };

  const metrics = useMemo(() => {
    const n = trades.length;
    const wins = trades.filter((t) => t.pnl > 0).length;
    const total = trades.reduce((s, t) => s + (t.pnl || 0), 0);
    return { n, winRate: n ? (wins / n) * 100 : 0, total, avg: n ? total / n : 0 };
  }, [trades]);

  const equity = useMemo(() => {
    let cum = 0;
    return [...trades].reverse().map((t, i) => ({ i, v: (cum += t.pnl || 0) }));
  }, [trades]);

  const F = ({ label, k, type = "number", step = 0.05 }: any) => (
    <div>
      <label className="label block mb-1">{label}</label>
      <input type={type} step={step} value={(form as any)[k] || (type === "number" ? "" : "")}
        onChange={(e) => setForm({ ...form, [k]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
        className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60" />
    </div>
  );

  return (
    <Section title="Trade Journal" right={
      <span className="pill bg-elevated border border-line text-faint">
        {storageMode() === "supabase" ? <Cloud size={11} /> : <HardDrive size={11} />}
        {storageMode() === "supabase" ? "Supabase" : "Local"}
      </span>
    }>
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <Card><div className="label">Trades</div><div className="font-display text-lg text-txt mt-1">{metrics.n}</div></Card>
        <Card><div className="label">Win Rate</div><div className="font-display text-lg text-brand mt-1">{fmt(metrics.winRate, 1)}%</div></Card>
        <Card><div className="label">Total P&L</div><div className={`font-display text-lg mt-1 ${metrics.total >= 0 ? "text-up" : "text-down"}`}>₹{fmtInt(metrics.total)}</div></Card>
        <Card><div className="label">Avg P&L</div><div className={`font-display text-lg mt-1 ${metrics.avg >= 0 ? "text-up" : "text-down"}`}>₹{fmtInt(metrics.avg)}</div></Card>
      </div>

      {equity.length > 1 && (
        <Card className="mb-3">
          <div className="label mb-2">Equity Curve</div>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={equity}>
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#0B1220", border: "1px solid #1e2d44", borderRadius: 8, fontSize: 11 }}
                labelFormatter={() => ""} formatter={(v: any) => [`₹${fmtInt(v)}`, "Cum P&L"]} />
              <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Add trade */}
      <Card className="mb-3">
        <div className="label mb-2">Log a Trade</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <F label="Symbol" k="symbol" type="text" />
          <div>
            <label className="label block mb-1">Side</label>
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as any })}
              className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
              <option>LONG</option><option>SHORT</option>
            </select>
          </div>
          <F label="Entry" k="entry_price" />
          <F label="Exit" k="exit_price" />
          <F label="Quantity" k="quantity" step={1} />
          <F label="P&L (₹)" k="pnl" step={1} />
          <div>
            <label className="label block mb-1">Setup</label>
            <select value={form.setup_type} onChange={(e) => setForm({ ...form, setup_type: e.target.value })}
              className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
              {SETUPS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={submit}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3 py-2 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors">
              <Plus size={14} /> Log
            </button>
          </div>
        </div>
      </Card>

      {/* History */}
      {trades.length === 0 ? <Empty msg="No trades yet — log your first above." /> : (
        <Card className="p-0 overflow-x-auto scroll-thin">
          <table className="w-full text-left">
            <thead><tr className="text-faint border-b border-line">
              {["Symbol", "Side", "Setup", "Entry", "Exit", "Qty", "P&L", ""].map((h) => <th key={h} className="label py-2.5 px-3">{h}</th>)}
            </tr></thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-xs text-txt">{t.symbol}</td>
                  <td className={`py-2 px-3 font-mono text-[0.7rem] ${t.side === "LONG" ? "text-up" : "text-down"}`}>{t.side}</td>
                  <td className="py-2 px-3 text-[0.7rem] text-muted">{t.setup_type}</td>
                  <td className="py-2 px-3 font-mono text-[0.7rem] text-muted">₹{fmt(t.entry_price, 1)}</td>
                  <td className="py-2 px-3 font-mono text-[0.7rem] text-muted">₹{fmt(t.exit_price, 1)}</td>
                  <td className="py-2 px-3 font-mono text-[0.7rem] text-faint">{t.quantity}</td>
                  <td className={`py-2 px-3 font-mono text-xs ${t.pnl >= 0 ? "text-up" : "text-down"}`}>₹{fmtInt(t.pnl)}</td>
                  <td className="py-2 px-3"><button onClick={() => remove(t.id)} className="text-faint hover:text-down transition-colors cursor-pointer" aria-label="Delete"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Section>
  );
}
