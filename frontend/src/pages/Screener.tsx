import { useState } from "react";
import { ScanSearch, Loader2, TrendingUp, SlidersHorizontal, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";

const gradeColor: Record<string, string> = { A: "text-up", B: "text-gold", C: "text-faint" };
type Mode = "top" | "rs" | "custom" | "nl";
const NL_EXAMPLES = ["high RS pharma breaking out on 1.5x volume", "A-grade stocks ADX over 30 above EMA200", "oversold RSI under 35 with rising trend"];

const defFilters = { rsi_min: 0, rsi_max: 100, adx_min: 0, vol_min: 0, score_min: 0, rs20_min: -999, grade: "", above_ema200: false, ema_aligned: false, sort_by: "score" };

export default function Screener() {
  const go = useSymbolNav();
  const [mode, setMode] = useState<Mode>("top");
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rsBy, setRsBy] = useState("rs_20d");
  const [f, setF] = useState<any>({ ...defFilters });
  const [nlQuery, setNlQuery] = useState("");
  const [nlFilters, setNlFilters] = useState<Record<string, any> | null>(null);

  const run = async (m: Mode) => {
    setMode(m); setLoading(true); setErr(null); setRows(null); if (m !== "nl") setNlFilters(null);
    try {
      if (m === "top") setRows((await api.screener()).results);
      else if (m === "rs") setRows((await api.rsRanking(rsBy)).results);
      else if (m === "nl") {
        const res = await api.scanNL(nlQuery);
        setNlFilters(res.filters); setRows(res.results);
      }
      else setRows((await api.scanCustom(f)).results);
    } catch { setErr("Screener engine takes ~30–60s on the first run (free tier). Try again."); }
    finally { setLoading(false); }
  };

  const Tab = ({ m, label, Icon }: any) => (
    <button onClick={() => run(m)} disabled={loading}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border cursor-pointer transition-colors disabled:opacity-50 ${mode === m && rows ? "bg-brand/15 border-brand/40 text-brand" : "bg-elevated border-line text-muted hover:text-txt"}`}>
      <Icon size={14} /> {label}
    </button>
  );

  const num = (k: string, label: string, step = 1) => (
    <div>
      <label className="label block mb-1">{label}</label>
      <input type="number" step={step} value={f[k] === -999 ? "" : f[k] || (f[k] === 0 ? "" : f[k])}
        onChange={(e) => setF({ ...f, [k]: e.target.value === "" ? (k === "rs20_min" ? -999 : 0) : parseFloat(e.target.value) })}
        className="w-full bg-base border border-line rounded px-2 py-1.5 text-xs font-mono text-txt outline-none focus:border-brand/60" />
    </div>
  );

  return (
    <Section title="Stock Screener · NSE Universe" right={
      <div className="flex gap-1.5">
        <Tab m="top" label="Top Picks" Icon={ScanSearch} />
        <Tab m="rs" label="RS Leaders" Icon={TrendingUp} />
        <Tab m="custom" label="Custom" Icon={SlidersHorizontal} />
        <Tab m="nl" label="Ask AI" Icon={Sparkles} />
      </div>
    }>
      {mode === "nl" && (
        <Card className="mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-brand shrink-0" />
            <input value={nlQuery} onChange={(e) => setNlQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nlQuery.trim() && run("nl")}
              placeholder="Describe what you want… e.g. high RS pharma breaking out on volume"
              className="flex-1 bg-base border border-line rounded px-2.5 py-1.5 text-sm text-txt outline-none focus:border-brand/60" />
            <button onClick={() => run("nl")} disabled={loading || !nlQuery.trim()} className="rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : "Scan"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {NL_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setNlQuery(ex); }} className="text-[0.6rem] font-mono text-faint hover:text-brand border border-line rounded px-2 py-0.5 cursor-pointer">{ex}</button>
            ))}
          </div>
          {nlFilters && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
              <span className="label">AI parsed →</span>
              {Object.keys(nlFilters).length ? Object.entries(nlFilters).map(([k, v]) => (
                <span key={k} className="text-[0.6rem] font-mono text-brand bg-brand/10 border border-brand/30 rounded px-1.5 py-0.5">{k}: {String(v)}</span>
              )) : <span className="text-[0.6rem] font-mono text-faint">no specific filters — showing top by score</span>}
            </div>
          )}
        </Card>
      )}
      {mode === "rs" && (
        <div className="flex gap-1.5 mb-3">
          {["rs_20d", "rs_60d"].map((b) => (
            <button key={b} onClick={() => { setRsBy(b); }} className={`px-2.5 py-1 rounded text-[0.65rem] font-mono cursor-pointer transition-colors ${rsBy === b ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{b === "rs_20d" ? "20-day RS" : "60-day RS"}</button>
          ))}
          <button onClick={() => run("rs")} className="ml-auto text-[0.65rem] font-mono text-brand cursor-pointer">apply</button>
        </div>
      )}

      {mode === "custom" && (
        <Card className="mb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-2.5">
            {num("rsi_min", "RSI ≥")}{num("rsi_max", "RSI ≤")}{num("adx_min", "ADX ≥")}{num("vol_min", "Vol× ≥", 0.1)}
            {num("score_min", "Score ≥")}{num("rs20_min", "RS20 ≥")}
            <div>
              <label className="label block mb-1">Grade</label>
              <select value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} className="w-full bg-base border border-line rounded px-2 py-1.5 text-xs text-txt outline-none focus:border-brand/60">
                <option value="">Any</option><option>A</option><option>B</option><option>C</option>
              </select>
            </div>
            <div>
              <label className="label block mb-1">Sort by</label>
              <select value={f.sort_by} onChange={(e) => setF({ ...f, sort_by: e.target.value })} className="w-full bg-base border border-line rounded px-2 py-1.5 text-xs text-txt outline-none focus:border-brand/60">
                <option value="score">Score</option><option value="rs_20d">RS 20D</option><option value="rs_60d">RS 60D</option><option value="adx">ADX</option><option value="volume_ratio">Volume</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer"><input type="checkbox" checked={f.above_ema200} onChange={(e) => setF({ ...f, above_ema200: e.target.checked })} className="accent-brand" /> Above EMA200</label>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer"><input type="checkbox" checked={f.ema_aligned} onChange={(e) => setF({ ...f, ema_aligned: e.target.checked })} className="accent-brand" /> EMA aligned (9&gt;21&gt;50)</label>
            <button onClick={() => run("custom")} disabled={loading} className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />} Scan
            </button>
          </div>
        </Card>
      )}

      {err && <Card className="mb-3"><div className="text-down text-xs font-mono">{err}</div></Card>}
      {loading && <div className="flex items-center justify-center gap-2 text-muted text-sm font-mono py-10"><Loader2 size={16} className="animate-spin" /> Scanning universe…</div>}
      {!rows && !loading && !err && <Empty msg="Pick a mode above: Top Picks (by score), RS Leaders (vs Nifty), or Custom filters." />}

      {rows && !loading && (
        <>
          <div className="label mb-2">{rows.length} results</div>
          <Card className="overflow-x-auto scroll-thin p-0">
            <table className="w-full text-left">
              <thead><tr className="text-faint border-b border-line">
                {["Symbol", "Grade", "Score", "Close", "RSI", "ADX", "RS20", "Vol×"].map((h) => <th key={h} className="label py-2.5 px-3 font-mono">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} onClick={() => go(String(r.symbol))} className="border-b border-line/50 hover:bg-elevated/40 transition-colors cursor-pointer">
                    <td className="py-2 px-3 font-mono text-xs text-txt">{String(r.symbol).replace(".NS", "")}</td>
                    <td className={`py-2 px-3 font-mono text-xs font-bold ${gradeColor[r.grade] ?? "text-faint"}`}>{r.grade}</td>
                    <td className="py-2 px-3 font-mono text-xs text-brand">{r.score}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted">₹{Number(r.close).toLocaleString("en-IN")}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted">{r.rsi ?? "—"}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted">{r.adx ?? "—"}</td>
                    <td className={`py-2 px-3 font-mono text-xs ${(r.rs_20d ?? 0) >= 0 ? "text-up" : "text-down"}`}>{r.rs_20d != null ? (r.rs_20d >= 0 ? "+" : "") + r.rs_20d : "—"}</td>
                    <td className="py-2 px-3 font-mono text-xs text-muted">{r.volume_ratio ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </Section>
  );
}
