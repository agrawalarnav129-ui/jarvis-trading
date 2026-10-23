import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, PlugZap } from "lucide-react";
import { api, type RiskResp } from "../lib/api";
import { Section, Card } from "../components/ui";
import { fmt, fmtInt } from "../lib/format";

// There are deliberately NO rule constants in this file. The 2% cap, the
// regime R:R floor (`min_rr`) and the BEARISH long block all live in
// risk/risk.py and reach this page through POST /api/risk. If you are about to
// add a threshold here, add it to config.py instead — a second copy of the
// rulebook in TypeScript is how the two drifted apart in the first place.

// Module-scope so it isn't recreated each render (which would drop input focus).
function Field({ label, value, onChange, step = 0.05 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="label block mb-1">{label}</label>
      <input type="number" value={value || ""} step={step} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60 transition-colors" />
    </div>
  );
}

export default function RiskCalculator() {
  const [capital, setCapital] = useState(1_000_000);
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [regime, setRegime] = useState<"BULLISH" | "NEUTRAL" | "BEARISH">("BULLISH");
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");

  const [r, setR] = useState<RiskResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  // Below this the engine would only echo "entry must be > 0", so stay idle
  // rather than greeting an untouched form with a REJECTED banner.
  const ready = entry > 0 && stop > 0 && capital > 0;

  useEffect(() => {
    if (!ready) {
      setR(null);
      setErr(null);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;   // ignore responses from superseded keystrokes
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.risk({ entry, stop, target, capital, regime, side });
        if (mine === seq.current) { setR(res); setErr(null); }
      } catch (e: any) {
        // Never fall back to a local calculation: a wrong position size shown
        // confidently is worse than none at all.
        if (mine === seq.current) { setErr(e?.message ?? "request failed"); setR(null); }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [entry, stop, target, capital, regime, side, ready]);

  return (
    <Section title="Risk Calculator · Position Sizing">
      <Card className="mb-3">
        <div className="font-mono text-[0.66rem] text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Shares = (Capital × 2%) ÷ |Entry − Stop| · Max risk 2% · Min R:R{" "}
            {r ? `${fmt(r.min_rr, 1)}:1` : "—"}
          </span>
          {loading && <Loader2 size={11} className="animate-spin text-brand shrink-0" />}
          <span className="text-faint shrink-0 w-full sm:w-auto sm:ml-auto">{side} · sized by risk/risk.py</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Capital (₹)" value={capital} step={10000} onChange={setCapital} />
        <Field label="Entry" value={entry} onChange={setEntry} />
        <Field label="Stop Loss" value={stop} onChange={setStop} />
        <Field label="Target" value={target} onChange={setTarget} />
        <div>
          <label className="label block mb-1">Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value as any)}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
            <option>LONG</option><option>SHORT</option>
          </select>
        </div>
        <div>
          <label className="label block mb-1">Regime</label>
          <select value={regime} onChange={(e) => setRegime(e.target.value as any)}
            className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60">
            <option>BULLISH</option><option>NEUTRAL</option><option>BEARISH</option>
          </select>
        </div>
      </div>

      {!ready && (
        <Card>
          <div className="label">Enter a capital, entry and stop to size the position.</div>
        </Card>
      )}

      {ready && err && (
        <div className="card p-4 mb-3 border-l-2 border-l-gold">
          <div className="flex items-center gap-2 mb-1">
            <PlugZap className="text-gold" size={18} />
            <span className="font-display text-sm text-gold">Risk engine unreachable</span>
          </div>
          <div className="label">
            No position size shown — the sizing rules run on the backend, and this page
            will not guess them. Retry once the API responds. ({err})
          </div>
        </div>
      )}

      {ready && !err && !r && loading && (
        <Card>
          <div className="flex items-center gap-2 label">
            <Loader2 size={13} className="animate-spin text-brand" /> Sizing…
          </div>
        </Card>
      )}

      {ready && !err && r && (
        <>
          <div className={`card p-4 mb-3 border-l-2 ${r.passed ? "border-l-up" : "border-l-down"} ${loading ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 mb-3">
              {r.passed ? <CheckCircle2 className="text-up" size={20} /> : <XCircle className="text-down" size={20} />}
              <span className={`font-display text-lg ${r.passed ? "text-up" : "text-down"}`}>{r.passed ? "APPROVED" : "REJECTED"}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><div className="label">Shares</div><div className="font-display text-lg text-txt mt-1">{fmtInt(r.shares)}</div></div>
              <div><div className="label">Capital at Risk</div><div className="font-display text-lg text-gold mt-1">₹{fmtInt(r.risk_amount)}</div></div>
              <div><div className="label">Risk %</div><div className="font-display text-lg text-txt mt-1">{fmt(r.risk_pct)}%</div></div>
              <div><div className="label">R:R Ratio</div><div className={`font-display text-lg mt-1 ${r.rr_ratio >= r.min_rr ? "text-up" : "text-down"}`}>{fmt(r.rr_ratio)}:1</div></div>
            </div>
            {r.reward > 0 && <div className="label mt-3">Potential reward: <span className="text-up font-mono">₹{fmtInt(r.reward)}</span></div>}
          </div>

          {r.rejection_reasons.map((x, i) => (
            <div key={i} className="flex items-center gap-2 text-down text-xs font-mono py-1"><XCircle size={13} />{x}</div>
          ))}
          {r.warnings.map((x, i) => (
            <div key={i} className="flex items-center gap-2 text-gold text-xs font-mono py-1"><AlertTriangle size={13} />{x}</div>
          ))}
        </>
      )}
    </Section>
  );
}
