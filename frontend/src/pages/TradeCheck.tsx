import { useState } from "react";
import { Check, X, Plus, Trash2, ShieldCheck, Flame, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import SymbolSearch from "../components/SymbolSearch";

const VERDICT: Record<string, { c: string; bg: string }> = {
  TAKE: { c: "text-up", bg: "bg-up/15 border-up/40" },
  CAUTION: { c: "text-gold", bg: "bg-gold/15 border-gold/40" },
  SKIP: { c: "text-down", bg: "bg-down/15 border-down/40" },
};

function num(v: string) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// ── Rules-grounded second opinion ───────────────────────────────────────────
function TradeReview() {
  const [sym, setSym] = useState("RELIANCE.NS");
  const [f, setF] = useState({ entry: "", stop: "", target: "", risk_pct: "2" });
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.tradeReview>> | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const run = async () => {
    setLoading(true);
    try {
      setRes(await api.tradeReview({ symbol: sym.replace(".NS", ""), entry: num(f.entry), stop: num(f.stop), target: num(f.target), risk_pct: num(f.risk_pct) }));
    } catch { setRes(null); } finally { setLoading(false); }
  };
  const Field = ({ k, label, ph }: any) => (
    <div><div className="label mb-1">{label}</div>
      <input value={(f as any)[k]} onChange={set(k)} placeholder={ph} inputMode="decimal"
        className="w-full bg-base border border-line rounded px-2 py-1.5 text-sm font-mono text-txt outline-none focus:border-brand/60" /></div>
  );
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3"><ShieldCheck size={15} className="text-brand" />
        <span className="font-display text-sm text-txt">Rules Check — AI second opinion</span></div>
      <div className="flex items-center gap-2 mb-3"><SymbolSearch value={sym} onPick={setSym} /><span className="font-mono text-xs text-txt">{sym.replace(".NS", "")}</span></div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Field k="entry" label="Entry" ph="1400" /><Field k="stop" label="Stop" ph="1380" />
        <Field k="target" label="Target" ph="1460" /><Field k="risk_pct" label="Risk %" ph="2" />
      </div>
      <button onClick={run} disabled={loading || !f.entry || !f.stop || !f.target}
        className="w-full py-2 rounded-lg bg-brand/20 border border-brand/40 text-brand font-mono text-xs cursor-pointer hover:bg-brand/30 disabled:opacity-40 flex items-center justify-center gap-2">
        {loading ? <Loader2 size={13} className="animate-spin" /> : "Review trade"}
      </button>
      {res && (
        <div className="mt-3">
          <div className="flex items-center gap-3 mb-3">
            <div className={`px-3 py-1.5 rounded-lg border font-display text-sm ${VERDICT[res.verdict]?.bg} ${VERDICT[res.verdict]?.c}`}>{res.verdict}</div>
            <div className="font-mono text-[0.7rem] text-faint">R:R <span className="text-txt">{res.rr}:1</span> · stop <span className="text-txt">{res.stop_pct}%</span> · regime <span className="text-txt">{res.regime}</span> · {res.passed}/{res.total} rules</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {res.checks.map((c) => (
              <div key={c.rule} className="flex items-center gap-1.5 text-[0.66rem] font-mono">
                {c.pass ? <Check size={12} className="text-up shrink-0" /> : <X size={12} className="text-down shrink-0" />}
                <span className={c.pass ? "text-muted" : "text-down"}>{c.rule}</span>
                <span className="text-faint ml-auto">{c.detail}</span>
              </div>
            ))}
          </div>
          <div className="text-[0.78rem] text-txt leading-relaxed bg-base/50 rounded-lg p-3 border border-line/60 whitespace-pre-wrap">{res.ai}</div>
        </div>
      )}
    </Card>
  );
}

// ── Pre-mortem portfolio heat ───────────────────────────────────────────────
function PortfolioHeat() {
  const [open, setOpen] = useState<{ symbol: string; risk_pct: number }[]>([{ symbol: "HDFCBANK", risk_pct: 2 }]);
  const [cand, setCand] = useState({ symbol: "ICICIBANK", risk_pct: 2 });
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.portfolioHeat>> | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try { setRes(await api.portfolioHeat(open, cand)); } catch { setRes(null); } finally { setLoading(false); }
  };
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3"><Flame size={15} className="text-gold" />
        <span className="font-display text-sm text-txt">Portfolio Heat — pre-mortem</span></div>

      <div className="label mb-1.5">Open positions</div>
      <div className="flex flex-col gap-1.5 mb-3">
        {open.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={p.symbol} onChange={(e) => setOpen(open.map((x, j) => j === i ? { ...x, symbol: e.target.value.toUpperCase() } : x))}
              className="w-28 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" />
            <input value={p.risk_pct} onChange={(e) => setOpen(open.map((x, j) => j === i ? { ...x, risk_pct: num(e.target.value) } : x))}
              className="w-16 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" /><span className="label">% risk</span>
            <button onClick={() => setOpen(open.filter((_, j) => j !== i))} className="text-faint hover:text-down cursor-pointer"><Trash2 size={13} /></button>
          </div>
        ))}
        <button onClick={() => setOpen([...open, { symbol: "", risk_pct: 2 }])} className="flex items-center gap-1 text-[0.65rem] font-mono text-brand cursor-pointer w-fit"><Plus size={12} /> add position</button>
      </div>

      <div className="label mb-1.5">Candidate trade</div>
      <div className="flex items-center gap-2 mb-3">
        <input value={cand.symbol} onChange={(e) => setCand({ ...cand, symbol: e.target.value.toUpperCase() })}
          className="w-28 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" />
        <input value={cand.risk_pct} onChange={(e) => setCand({ ...cand, risk_pct: num(e.target.value) })}
          className="w-16 bg-base border border-line rounded px-2 py-1 text-xs font-mono text-txt outline-none focus:border-brand/60" /><span className="label">% risk</span>
      </div>
      <button onClick={run} disabled={loading} className="w-full py-2 rounded-lg bg-gold/15 border border-gold/40 text-gold font-mono text-xs cursor-pointer hover:bg-gold/25 disabled:opacity-40 flex items-center justify-center gap-2">
        {loading ? <Loader2 size={13} className="animate-spin" /> : "Check heat"}
      </button>

      {res && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div><div className="label">Open Risk</div><div className={`font-display text-base mt-0.5 ${res.total_risk > res.cap ? "text-down" : "text-up"}`}>{res.total_risk}%</div></div>
            <div><div className="label">Daily Cap</div><div className="font-display text-base text-faint mt-0.5">{res.cap}%</div></div>
            <div><div className="label">Avg Corr</div><div className={`font-display text-base mt-0.5 ${(res.correlation?.avg_corr ?? 0) > 0.5 ? "text-down" : "text-up"}`}>{res.correlation?.avg_corr ?? "—"}</div></div>
          </div>
          {res.candidate_pairs?.length > 0 && (
            <div className="mb-3"><div className="label mb-1">Candidate correlation to book</div>
              {res.candidate_pairs.map((p) => (
                <div key={p.symbol} className="flex items-center gap-2 text-[0.66rem] font-mono py-0.5">
                  <span className="text-muted w-24">{p.symbol}</span>
                  <div className="flex-1 h-1.5 bg-base rounded"><div className="h-1.5 rounded" style={{ width: `${Math.abs(p.corr) * 100}%`, background: p.corr >= 0.7 ? "#ef4444" : p.corr >= 0.4 ? "#fbbf24" : "#22c55e" }} /></div>
                  <span className={p.corr >= 0.7 ? "text-down" : "text-muted"}>{p.corr}</span>
                </div>
              ))}
            </div>
          )}
          {res.warnings.length ? res.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[0.7rem] font-mono text-down py-0.5"><X size={12} className="mt-0.5 shrink-0" />{w}</div>
          )) : <div className="flex items-center gap-1.5 text-[0.7rem] font-mono text-up"><Check size={12} /> Within all risk limits — clean to add.</div>}
        </div>
      )}
    </Card>
  );
}

export default function TradeCheck() {
  return (
    <Section title="Trade Check">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TradeReview />
        <PortfolioHeat />
      </div>
    </Section>
  );
}
