import { useState } from "react";
import { ScanSearch, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";

const gradeColor: Record<string, string> = { A: "text-up", B: "text-gold", C: "text-faint" };

export default function Screener() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.screener();
      setRows(r.results);
    } catch (e: any) { setErr("Screener unavailable (the engine takes ~30–60s; try again)."); }
    finally { setLoading(false); }
  };

  return (
    <Section title="Stock Screener · NSE Universe" right={
      <button onClick={run} disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
        {loading ? "Scanning…" : "Run Screener"}
      </button>
    }>
      {err && <Card className="mb-3"><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!rows && !loading && <Empty msg="Run the screener to score the NSE universe (Grade A/B/C)." />}
      {rows && (
        <Card className="overflow-x-auto scroll-thin p-0">
          <table className="w-full text-left">
            <thead>
              <tr className="text-faint border-b border-line">
                {["Symbol", "Grade", "Score", "Close", "RSI", "ADX"].map((h) => (
                  <th key={h} className="label py-2.5 px-3 font-mono">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line/50 hover:bg-elevated/40 transition-colors">
                  <td className="py-2 px-3 font-mono text-xs text-txt">{r.symbol}</td>
                  <td className={`py-2 px-3 font-mono text-xs font-bold ${gradeColor[r.grade] ?? "text-faint"}`}>{r.grade}</td>
                  <td className="py-2 px-3 font-mono text-xs text-brand">{r.score}</td>
                  <td className="py-2 px-3 font-mono text-xs text-muted">₹{Number(r.close).toLocaleString("en-IN")}</td>
                  <td className="py-2 px-3 font-mono text-xs text-muted">{r.rsi ?? "—"}</td>
                  <td className="py-2 px-3 font-mono text-xs text-muted">{r.adx ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Section>
  );
}
