import { useMemo, useState } from "react";
import { Calculator, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Section, Card } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";

const CAPITAL_RISK = 0.02; // 2% per trade

export default function RiskCalculator() {
  const [capital, setCapital] = useState(1_000_000);
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [regime, setRegime] = useState<"BULLISH" | "NEUTRAL" | "BEARISH">("BULLISH");

  const r = useMemo(() => {
    const rejects: string[] = [];
    const warns: string[] = [];
    if (entry <= 0) rejects.push("Entry must be > 0");
    if (stop <= 0) rejects.push("Stop must be > 0");
    if (stop >= entry && entry > 0) rejects.push(`Stop (${stop}) must be below entry (${entry})`);
    if (capital <= 0) rejects.push("Capital must be > 0");

    const riskPerShare = entry - stop;
    const maxRisk = capital * CAPITAL_RISK;
    const shares = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
    const riskAmt = shares * riskPerShare;
    const riskPct = capital > 0 ? (riskAmt / capital) * 100 : 0;
    const reward = target > entry ? shares * (target - entry) : 0;
    const rr = riskPerShare > 0 && target > entry ? (target - entry) / riskPerShare : 0;
    const minRR = regime === "NEUTRAL" ? 2.5 : 2.0;

    if (riskPct > 2.05) rejects.push(`Risk ${fmt(riskPct)}% exceeds 2% limit`);
    if (shares <= 0 && !rejects.length) rejects.push("Position rounds to 0 shares — stop too wide");
    if (target > entry && rr < minRR) rejects.push(`R:R ${fmt(rr)} below ${minRR} for ${regime}`);
    if (regime === "BEARISH") warns.push("BEARISH regime — no long entries advised");
    if (target <= entry) warns.push("No target set — R:R not computed");
    if (riskPerShare > 0 && riskPerShare / entry > 0.05) warns.push(`Stop is ${fmt((riskPerShare / entry) * 100, 1)}% wide — unusually large`);

    return { shares, riskAmt, riskPct, reward, rr, minRR, passed: rejects.length === 0 && shares > 0, rejects, warns };
  }, [capital, entry, stop, target, regime]);

  const Field = ({ label, value, onChange, step = 0.05 }: any) => (
    <div>
      <label className="label block mb-1">{label}</label>
      <input type="number" value={value || ""} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60 transition-colors" />
    </div>
  );

  return (
    <Section title="Risk Calculator · Position Sizing">
      <Card className="mb-3">
        <div className="font-mono text-[0.66rem] text-muted">
          Shares = (Capital × 2%) ÷ (Entry − Stop) · Max risk 2% · Min R:R {regime === "NEUTRAL" ? "2.5" : "2.0"}:1
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Capital (₹)" value={capital} step={10000} onChange={setCapital} />
        <Field label="Entry" value={entry} onChange={setEntry} />
        <Field label="Stop Loss" value={stop} onChange={setStop} />
        <Field label="Target" value={target} onChange={setTarget} />
        <div>
          <label className="label block mb-1">Regime</label>
          <select value={regime} onChange={(e) => setRegime(e.target.value as any)}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
            <option>BULLISH</option><option>NEUTRAL</option><option>BEARISH</option>
          </select>
        </div>
      </div>

      <div className={`card p-4 mb-3 border-l-2 ${r.passed ? "border-l-up" : "border-l-down"}`}>
        <div className="flex items-center gap-2 mb-3">
          {r.passed ? <CheckCircle2 className="text-up" size={20} /> : <XCircle className="text-down" size={20} />}
          <span className={`font-display text-lg ${r.passed ? "text-up" : "text-down"}`}>{r.passed ? "APPROVED" : "REJECTED"}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><div className="label">Shares</div><div className="font-display text-lg text-txt mt-1">{fmtInt(r.shares)}</div></div>
          <div><div className="label">Capital at Risk</div><div className="font-display text-lg text-gold mt-1">₹{fmtInt(r.riskAmt)}</div></div>
          <div><div className="label">Risk %</div><div className="font-display text-lg text-txt mt-1">{fmt(r.riskPct)}%</div></div>
          <div><div className="label">R:R Ratio</div><div className={`font-display text-lg mt-1 ${r.rr >= r.minRR ? "text-up" : "text-down"}`}>{fmt(r.rr)}:1</div></div>
        </div>
        {r.reward > 0 && <div className="label mt-3">Potential reward: <span className="text-up font-mono">₹{fmtInt(r.reward)}</span></div>}
      </div>

      {r.rejects.map((x, i) => (
        <div key={i} className="flex items-center gap-2 text-down text-xs font-mono py-1"><XCircle size={13} />{x}</div>
      ))}
      {r.warns.map((x, i) => (
        <div key={i} className="flex items-center gap-2 text-gold text-xs font-mono py-1"><AlertTriangle size={13} />{x}</div>
      ))}
    </Section>
  );
}
