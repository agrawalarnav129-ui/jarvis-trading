import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Gauge } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";
import { listPositions, addPosition, deletePosition, getCapital, setCapital, type Position } from "../lib/positions";
import { fmt, fmtInt } from "../lib/format";

const MAX_DAILY_RISK = 4; // % of capital (house rule)
const MAX_POSITIONS = 2;
const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

function rMultiple(p: Position, price: number): number {
  const risk = Math.abs(p.entry - p.stop);
  if (!risk) return 0;
  return p.side === "LONG" ? (price - p.entry) / risk : (p.entry - price) / risk;
}

export default function Positions() {
  const go = useSymbolNav();
  const [pos, setPos] = useState<Position[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [cap, setCap] = useState(getCapital());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ symbol: "", side: "LONG", entry: "", stop: "", target: "", qty: "" });

  const refresh = async (list: Position[]) => {
    if (!list.length) { setQuotes({}); return; }
    try {
      const { quotes: q } = await api.quote(list.map((p) => p.symbol));
      const m: Record<string, number> = {}; q.forEach((x) => (m[x.symbol] = x.ltp)); setQuotes(m);
    } catch { /* keep stale */ }
  };
  const load = async () => { const l = await listPositions(); setPos(l); setLoading(false); refresh(l); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.symbol || !form.entry || !form.stop) return;
    await addPosition({ symbol: form.symbol.replace(".NS", "").toUpperCase(), side: form.side as any, entry: num(form.entry), stop: num(form.stop), target: num(form.target), qty: num(form.qty) });
    setForm({ symbol: "", side: "LONG", entry: "", stop: "", target: "", qty: "" });
    load();
  };
  const remove = async (id?: string) => { if (id) { await deletePosition(id); load(); } };

  // aggregate open risk = Σ |entry-stop|*qty
  const openRisk = pos.reduce((s, p) => s + Math.abs(p.entry - p.stop) * p.qty, 0);
  const openRiskPct = cap ? (openRisk / cap) * 100 : 0;
  const unreal = pos.reduce((s, p) => { const px = quotes[p.symbol]; return s + (px ? (p.side === "LONG" ? px - p.entry : p.entry - px) * p.qty : 0); }, 0);

  const Inp = ({ k, ph, w = "w-full" }: any) => (
    <input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value.toUpperCase() })} placeholder={ph}
      className={`${w} bg-base border border-line rounded px-2 py-1.5 text-xs font-mono text-txt outline-none focus:border-brand/60`} />
  );

  return (
    <Section title="Live Positions · Cockpit" right={
      <div className="flex items-center gap-1.5"><span className="label">Capital ₹</span>
        <input value={cap} onChange={(e) => { const v = num(e.target.value); setCap(v); setCapital(v); }}
          className="w-24 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" /></div>
    }>
      {/* heat summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <Card className={openRiskPct > MAX_DAILY_RISK ? "border-l-2 border-l-down" : "border-l-2 border-l-up"}>
          <div className="label">Open Risk</div>
          <div className={`font-display text-lg mt-1 ${openRiskPct > MAX_DAILY_RISK ? "text-down" : "text-up"}`}>{openRiskPct.toFixed(1)}%</div>
          <div className="font-mono text-[0.56rem] text-faint mt-0.5">₹{fmtInt(openRisk)} · cap {MAX_DAILY_RISK}%</div>
        </Card>
        <Card className={pos.length > MAX_POSITIONS ? "border-l-2 border-l-down" : ""}>
          <div className="label">Positions</div>
          <div className={`font-display text-lg mt-1 ${pos.length > MAX_POSITIONS ? "text-down" : "text-txt"}`}>{pos.length}<span className="text-faint text-sm">/{MAX_POSITIONS}</span></div>
        </Card>
        <Card><div className="label">Unrealized P&L</div><div className={`font-display text-lg mt-1 ${unreal >= 0 ? "text-up" : "text-down"}`}>{unreal >= 0 ? "+" : ""}₹{fmtInt(unreal)}</div></Card>
        <Card><div className="label">Heat gauge</div>
          <div className="mt-2 h-2 bg-base rounded overflow-hidden"><div className="h-2 rounded" style={{ width: `${Math.min(100, openRiskPct / MAX_DAILY_RISK * 100)}%`, background: openRiskPct > MAX_DAILY_RISK ? "#ef4444" : openRiskPct > MAX_DAILY_RISK * 0.75 ? "#fbbf24" : "#22c55e" }} /></div>
        </Card>
      </div>
      {(openRiskPct > MAX_DAILY_RISK || pos.length > MAX_POSITIONS) && (
        <Card className="mb-3 border-l-2 border-l-down"><div className="flex items-center gap-1.5 text-[0.72rem] font-mono text-down"><Gauge size={13} />
          {openRiskPct > MAX_DAILY_RISK ? `Open risk ${openRiskPct.toFixed(1)}% exceeds your ${MAX_DAILY_RISK}% cap — no new entries.` : `${pos.length} positions — house rule is max ${MAX_POSITIONS}.`}</div></Card>
      )}

      {/* add form */}
      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {Inp({ k: "symbol", ph: "SYMBOL", w: "w-24" })}
          <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} className="bg-base border border-line rounded px-2 py-1.5 text-xs text-txt outline-none focus:border-brand/60"><option>LONG</option><option>SHORT</option></select>
          {Inp({ k: "entry", ph: "entry", w: "w-20" })}{Inp({ k: "stop", ph: "stop", w: "w-20" })}{Inp({ k: "target", ph: "target", w: "w-20" })}{Inp({ k: "qty", ph: "qty", w: "w-16" })}
          <button onClick={add} className="rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-brand cursor-pointer hover:bg-brand/25 flex items-center gap-1 text-xs"><Plus size={14} /> Add</button>
        </div>
      </Card>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-faint" /></div> :
        !pos.length ? <Empty msg="No open positions. Add one above to track R-progress and heat live." /> : (
          <div className="flex flex-col gap-2.5">
            {pos.map((p) => {
              const px = quotes[p.symbol] || 0;
              const r = px ? rMultiple(p, px) : 0;
              const pnl = px ? (p.side === "LONG" ? px - p.entry : p.entry - px) * p.qty : 0;
              const toTarget = p.target ? Math.abs(p.target - p.entry) : 0;
              const prog = toTarget ? Math.max(-100, Math.min(100, (r * Math.abs(p.entry - p.stop)) / toTarget * 100)) : 0;
              const prompt = r >= 2 ? "≥2R — trail at 1.5× ATR" : r >= 1 ? "≥1R — move stop to breakeven" : r <= -1 ? "at −1R — stop should trigger" : "";
              return (
                <Card key={p.id} className="group">
                  <div className="flex items-center gap-2">
                    <button onClick={() => go(p.symbol)} className="font-mono text-sm text-txt hover:text-brand cursor-pointer">{p.symbol}</button>
                    <span className={`text-[0.55rem] font-mono px-1.5 py-0.5 rounded ${p.side === "LONG" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>{p.side}</span>
                    <span className="font-mono text-[0.62rem] text-faint">{px ? `₹${fmt(px)}` : "—"}</span>
                    <span className={`font-mono text-xs ml-auto ${r >= 0 ? "text-up" : "text-down"}`}>{r >= 0 ? "+" : ""}{r.toFixed(2)}R</span>
                    <span className={`font-mono text-[0.66rem] w-20 text-right ${pnl >= 0 ? "text-up" : "text-down"}`}>{pnl >= 0 ? "+" : ""}₹{fmtInt(pnl)}</span>
                    <button onClick={() => remove(p.id)} className="text-faint hover:text-down cursor-pointer ml-1"><Trash2 size={13} /></button>
                  </div>
                  <div className="mt-2 relative h-1.5 bg-base rounded">
                    <div className="absolute top-0 bottom-0 w-px bg-faint" style={{ left: "50%" }} />
                    <div className="absolute top-0 h-1.5 rounded" style={{ left: prog >= 0 ? "50%" : `${50 + prog / 2}%`, width: `${Math.abs(prog) / 2}%`, background: prog >= 0 ? "#22c55e" : "#ef4444" }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[0.55rem] font-mono text-faint">
                    <span>entry {fmt(p.entry)} · stop {fmt(p.stop)}{p.target ? ` · tgt ${fmt(p.target)}` : ""}</span>
                    {prompt && <span className="text-gold">{prompt}</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
    </Section>
  );
}
