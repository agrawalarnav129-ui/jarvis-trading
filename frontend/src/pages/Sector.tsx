import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";

const gradeColor: Record<string, string> = { A: "text-up", B: "text-gold", C: "text-faint" };
const QUAD_COLOR: Record<string, string> = { Leading: "text-up", Improving: "text-brand", Weakening: "text-gold", Lagging: "text-down" };

// Sector drill-down: ranked constituents (screener cache) + rotation quadrants.
export default function Sector() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const go = useSymbolNav();
  const sector = decodeURIComponent(name);
  const { data, loading } = useFetch(() => api.sectorConstituents(sector), [sector]);
  const syms = (data?.results ?? []).map((r) => String(r.symbol)).slice(0, 15);
  const rrg = useFetch(() => (syms.length ? api.rrg(syms, 8) : Promise.resolve(null)), [syms.join(",")]);

  return (
    <Section title={`Sector · ${sector}`} right={
      <button onClick={() => nav("/")} className="flex items-center gap-1 text-[0.65rem] font-mono text-faint hover:text-brand cursor-pointer"><ArrowLeft size={12} /> dashboard</button>
    }>
      {loading ? <div className="flex items-center justify-center gap-2 text-muted text-sm font-mono py-10"><Loader2 size={16} className="animate-spin" /> Loading {sector}… (first run computes the screener)</div>
        : !data?.available ? <Empty msg={data?.note || "No constituents found."} /> : (
          <>
            {/* rotation quadrants for this sector's names */}
            {rrg.data?.available && (
              <Card className="mb-3">
                <div className="label mb-1.5">Rotation vs NIFTY</div>
                <div className="flex flex-wrap gap-1.5">
                  {rrg.data.points.map((p) => (
                    <button key={p.symbol} onClick={() => go(p.symbol)}
                      className={`text-[0.62rem] font-mono px-1.5 py-0.5 rounded border border-line cursor-pointer hover:border-brand/50 ${QUAD_COLOR[p.quadrant] ?? "text-faint"}`}>
                      {p.symbol} · {p.quadrant}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <div className="label mb-2">{data.count} constituents · industries: {data.industries.join(", ")}</div>
            <Card className="overflow-x-auto scroll-thin p-0">
              <table className="w-full text-left">
                <thead><tr className="text-faint border-b border-line">
                  {["Symbol", "Name", "Grade", "Score", "MTF", "RS20", "RSI", "Close"].map((h) => <th key={h} className="label py-2.5 px-3 font-mono">{h}</th>)}
                </tr></thead>
                <tbody>
                  {data.results.map((r, i) => (
                    <tr key={i} onClick={() => go(String(r.symbol))} className="border-b border-line/50 hover:bg-elevated/40 transition-colors cursor-pointer">
                      <td className="py-2 px-3 font-mono text-xs text-txt">{String(r.symbol).replace(".NS", "")}</td>
                      <td className="py-2 px-3 text-[0.66rem] text-muted truncate max-w-[160px]">{r.name}</td>
                      <td className={`py-2 px-3 font-mono text-xs font-bold ${gradeColor[r.grade] ?? "text-faint"}`}>{r.grade}</td>
                      <td className="py-2 px-3 font-mono text-xs text-brand">{r.score}</td>
                      <td className="py-2 px-3">{r.mtf != null ? <span className={`text-[0.6rem] font-mono px-1.5 py-0.5 rounded border ${r.mtf === r.mtf_of ? "text-up border-up/40 bg-up/10" : r.mtf === 0 ? "text-down border-down/40 bg-down/10" : "text-gold border-gold/40 bg-gold/10"}`}>{r.mtf}/{r.mtf_of}</span> : <span className="text-faint text-xs">—</span>}</td>
                      <td className={`py-2 px-3 font-mono text-xs ${(r.rs_20d ?? 0) >= 0 ? "text-up" : "text-down"}`}>{r.rs_20d != null ? (r.rs_20d >= 0 ? "+" : "") + r.rs_20d : "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.rsi ?? "—"}</td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">₹{Number(r.close).toLocaleString("en-IN")}</td>
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
