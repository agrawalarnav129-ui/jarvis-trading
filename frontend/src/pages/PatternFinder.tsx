import { useRef, useState, useCallback } from "react";
import { Eraser, Search, Loader2 } from "lucide-react";
import { api, type PatternMatch } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";

// Preset shapes are y-values where HIGHER = higher price (top of canvas).
const PRESETS: { name: string; shape: number[] }[] = [
  { name: "Double Bottom", shape: [0.8, 0.5, 0.15, 0.45, 0.15, 0.5, 0.9] },
  { name: "Cup & Handle", shape: [0.9, 0.6, 0.3, 0.2, 0.3, 0.6, 0.85, 0.7, 0.95] },
  { name: "Head & Shoulders", shape: [0.3, 0.6, 0.4, 0.85, 0.4, 0.6, 0.25] },
  { name: "Ascending Triangle", shape: [0.3, 0.85, 0.45, 0.85, 0.6, 0.85, 0.95] },
  { name: "Falling Wedge", shape: [0.9, 0.5, 0.75, 0.35, 0.6, 0.3, 0.7] },
  { name: "Breakout", shape: [0.45, 0.5, 0.45, 0.5, 0.48, 0.7, 0.95] },
  { name: "Uptrend", shape: [0.1, 0.25, 0.35, 0.5, 0.6, 0.78, 0.95] },
  { name: "V-Reversal", shape: [0.9, 0.55, 0.2, 0.05, 0.3, 0.6, 0.92] },
];

const W = 560, H = 220, N = 48;

// Resample a list of {x,y} points to N evenly-spaced y-values across [0,W].
function resample(pts: { x: number; y: number }[]): number[] {
  if (pts.length < 2) return [];
  const sorted = [...pts].sort((a, b) => a.x - b.x);
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W;
    let j = 0;
    while (j < sorted.length - 1 && sorted[j + 1].x < x) j++;
    const a = sorted[j], b = sorted[Math.min(j + 1, sorted.length - 1)];
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * t;
    out.push(1 - y / H); // invert: canvas y-down → price y-up, 0..1
  }
  return out;
}

function presetPath(shape: number[]): string {
  return shape.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (shape.length - 1)) * W} ${(1 - v) * H}`).join(" ");
}

function Spark({ data, up }: { data: number[]; up: boolean }) {
  if (data.length < 2) return null;
  const lo = Math.min(...data), hi = Math.max(...data), rng = hi - lo || 1;
  const w = 120, h = 36;
  const d = data.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (data.length - 1)) * w} ${h - ((v - lo) / rng) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth={1.5} />
    </svg>
  );
}

export default function PatternFinder() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [window, setWindow] = useState(60);
  const [results, setResults] = useState<PatternMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const go = useSymbolNav();

  const toXY = useCallback((e: React.PointerEvent) => {
    const rc = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rc.left) / rc.width) * W;
    const y = ((e.clientY - rc.top) / rc.height) * H;
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
  }, []);

  const start = (e: React.PointerEvent) => { setResults(null); setPts([toXY(e)]); setDrawing(true); (e.target as Element).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (drawing) setPts((p) => [...p, toXY(e)]); };
  const end = () => setDrawing(false);

  const usePreset = (shape: number[]) => {
    setResults(null);
    setPts(shape.map((v, i) => ({ x: (i / (shape.length - 1)) * W, y: (1 - v) * H })));
  };
  const clear = () => { setPts([]); setResults(null); setErr(""); };

  const find = async () => {
    const shape = resample(pts);
    if (shape.length < 8) { setErr("Draw a shape across the box first (or pick a preset)."); return; }
    setErr(""); setLoading(true);
    try {
      const r = await api.patternMatch(shape, window, 24);
      setResults(r.results); setUpdated(r.updated);
      if (!r.results.length) setErr("No matches — the closes cache may not be built yet.");
    } catch (e: any) { setErr(e.message || "Match failed"); }
    finally { setLoading(false); }
  };

  const path = pts.length > 1 ? pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") : "";

  return (
    <Section title="Pattern Finder" right={
      <div className="flex items-center gap-1.5">
        {[30, 60, 90, 120].map((w) => (
          <button key={w} onClick={() => setWindow(w)} className={`px-2 py-1 rounded text-[0.6rem] font-mono cursor-pointer transition-colors ${window === w ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{w}d</button>
        ))}
      </div>
    }>
      <Card className="mb-3">
        <div className="text-[0.65rem] text-faint mb-2">Draw a price shape — AXIOM finds NSE stocks whose last {window} days look most like it.</div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded-lg bg-base border border-line cursor-crosshair"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={W} y1={g * H} y2={g * H} stroke="rgba(30,45,68,0.5)" strokeWidth={1} />)}
          {path && <path d={path} fill="none" stroke="#22d3ee" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          {!path && <text x={W / 2} y={H / 2} fill="#475569" fontSize={13} textAnchor="middle" className="font-mono">✎ draw here</text>}
        </svg>

        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => usePreset(p.shape)} title={p.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-line text-faint hover:text-brand hover:border-brand/40 cursor-pointer transition-colors">
              <svg viewBox={`0 0 ${W} ${H}`} width={26} height={14}><path d={presetPath(p.shape)} fill="none" stroke="currentColor" strokeWidth={6} /></svg>
              <span className="text-[0.58rem] font-mono">{p.name}</span>
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <button onClick={clear} className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-line text-faint hover:text-down cursor-pointer transition-colors"><Eraser size={13} /><span className="text-[0.6rem] font-mono">Clear</span></button>
            <button onClick={find} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-brand/20 border border-brand/40 text-brand hover:bg-brand/30 cursor-pointer transition-colors disabled:opacity-50">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}<span className="text-[0.62rem] font-mono">Find Matches</span>
            </button>
          </div>
        </div>
        {err && <div className="text-[0.6rem] font-mono text-down mt-2">{err}</div>}
      </Card>

      {loading ? <div className="flex justify-center py-12 text-faint"><Loader2 className="animate-spin" /></div> :
        results && results.length ? (
          <>
            <div className="label mb-2">{results.length} closest matches{updated ? ` · closes ${updated.slice(0, 10)}` : ""}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {results.map((m) => (
                <Card key={m.symbol} onClick={() => go(m.symbol)} className="cursor-pointer hover:border-brand/40 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-txt">{m.symbol.replace(".NS", "")}</span>
                    <span className="font-mono text-[0.6rem] px-1.5 py-0.5 rounded bg-brand/15 text-brand">{m.score}%</span>
                  </div>
                  <Spark data={m.spark} up={m.pct >= 0} />
                  <div className="flex items-center justify-between mt-1 text-[0.6rem] font-mono">
                    <span className="text-faint">₹{m.last}</span>
                    <span className={m.pct >= 0 ? "text-up" : "text-down"}>{m.pct >= 0 ? "+" : ""}{m.pct}%</span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : results ? <Empty msg="No matches found." /> : null}
    </Section>
  );
}
