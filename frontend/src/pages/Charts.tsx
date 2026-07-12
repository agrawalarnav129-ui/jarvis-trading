import { useEffect, useRef, useState } from "react";
import { Grid2x2, Square, LayoutGrid, Save, FolderOpen, Maximize2 } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section } from "../components/ui";
import PriceChart, { type ChartIndicators, type ChartType } from "../components/PriceChart";
import SymbolSearch from "../components/SymbolSearch";
import { saveLayout, loadLayout } from "../lib/layouts";

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "1d", "1wk"];
const PERIOD_FOR: Record<string, string> = { "5m": "5d", "15m": "1mo", "30m": "1mo", "1h": "3mo", "1d": "1y", "1wk": "5y" };
const IND_LIST: [keyof ChartIndicators, string][] = [
  ["ema", "EMA"], ["bb", "BB"], ["vwap", "VWAP"], ["supertrend", "ST"], ["sd", "S/D"],
  ["rsi", "RSI"], ["macd", "MACD"], ["stoch", "Stoch"], ["volume", "Vol"], ["volumeProfile", "VP"],
];
const CHART_TYPES: [ChartType, string][] = [["candle", "Candle"], ["heikin", "HA"], ["line", "Line"], ["area", "Area"], ["bars", "Bars"]];
const SEED = ["RELIANCE", "HDFCBANK", "INFY", "TCS", "ICICIBANK", "SBIN"];

interface PanelCfg { symbol: string; interval: string; indicators: ChartIndicators; compare: string; chartType?: ChartType; }
const defCfg = (symbol: string): PanelCfg => ({ symbol, interval: "1d", indicators: { ema: true, volume: true }, compare: "", chartType: "candle" });

function ChartPanel({ cfg, onChange, height, syncRef }: { cfg: PanelCfg; onChange: (c: PanelCfg) => void; height: number; syncRef: any }) {
  const [cmpInput, setCmpInput] = useState(cfg.compare);
  const { data, loading } = useFetch(() => api.history(cfg.symbol, PERIOD_FOR[cfg.interval], cfg.interval), [cfg.symbol, cfg.interval]);
  const cmp = useFetch(() => (cfg.compare ? api.history(cfg.compare, PERIOD_FOR[cfg.interval], cfg.interval) : Promise.resolve(null as any)), [cfg.compare, cfg.interval]);
  const fp = useFetch(() => (cfg.indicators.volumeProfile ? api.footprint(cfg.symbol, 1) : Promise.resolve(null as any)), [cfg.symbol, cfg.indicators.volumeProfile]);

  const setInd = (k: keyof ChartIndicators) => onChange({ ...cfg, indicators: { ...cfg.indicators, [k]: !cfg.indicators[k] } });

  return (
    <div className="card p-2.5 flex flex-col">
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <SymbolSearch value={cfg.symbol} onPick={(s) => onChange({ ...cfg, symbol: s })} />
        {data && <span className={`font-mono text-xs ${data.pct >= 0 ? "text-up" : "text-down"}`}>₹{data.last} ({data.pct >= 0 ? "+" : ""}{data.pct}%)</span>}
        <div className="ml-auto flex gap-0.5">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => onChange({ ...cfg, interval: t })}
              className={`px-1.5 py-0.5 rounded text-[0.6rem] font-mono cursor-pointer transition-colors ${cfg.interval === t ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <div className="flex gap-0.5 mr-1 pr-1.5 border-r border-line">
          {CHART_TYPES.map(([t, label]) => (
            <button key={t} onClick={() => onChange({ ...cfg, chartType: t })} title={label}
              className={`px-1.5 py-0.5 rounded text-[0.6rem] font-mono cursor-pointer transition-colors ${(cfg.chartType || "candle") === t ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{label}</button>
          ))}
        </div>
        {IND_LIST.map(([k, label]) => (
          <button key={k} onClick={() => setInd(k)}
            className={`px-1.5 py-0.5 rounded text-[0.6rem] font-mono border cursor-pointer transition-colors ${cfg.indicators[k] ? "bg-brand/15 border-brand/40 text-brand" : "border-line text-faint hover:text-txt"}`}>{label}</button>
        ))}
        <input value={cmpInput} onChange={(e) => setCmpInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && onChange({ ...cfg, compare: cmpInput.trim() })}
          onBlur={() => cmpInput !== cfg.compare && onChange({ ...cfg, compare: cmpInput.trim() })}
          placeholder="vs…" className="w-16 ml-auto bg-base border border-line rounded px-1.5 py-0.5 text-[0.6rem] font-mono text-txt outline-none focus:border-brand/60" />
      </div>
      {loading ? <div className="bg-base/40 rounded animate-pulse" style={{ height }} /> :
        data && data.candles.length ? (
          <PriceChart candles={data.candles} interval={cfg.interval} indicators={cfg.indicators} chartType={cfg.chartType} symbol={cfg.symbol}
            compareCandles={cmp.data?.candles ?? null} footprint={fp.data?.profile ?? null} poc={fp.data?.poc}
            height={height} syncRef={syncRef} />
        ) : <div className="flex items-center justify-center text-faint text-xs font-mono" style={{ height }}>No data</div>}
    </div>
  );
}

export default function Charts() {
  const [layout, setLayout] = useState(4);
  const [panels, setPanels] = useState<PanelCfg[]>(SEED.slice(0, 4).map(defCfg));
  const syncRef = useRef<Set<(t: number | null) => void>>(new Set());
  const [msg, setMsg] = useState("");

  useEffect(() => { loadLayout().then((l) => { if (l?.panels) { setLayout(l.layout || 4); setPanels(l.panels); } }); }, []);

  // Hotkeys: 1-6 set timeframe for all panels; q/w/e/r/t/y… nah keep simple.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const idx = ["1", "2", "3", "4", "5", "6"].indexOf(e.key);
      if (idx >= 0) { e.preventDefault(); setPanels((p) => p.map((c) => ({ ...c, interval: TIMEFRAMES[idx] }))); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setCount = (n: number) => {
    setLayout(n);
    setPanels((p) => {
      const next = [...p];
      while (next.length < n) next.push(defCfg(SEED[next.length % SEED.length]));
      return next.slice(0, n);
    });
  };
  const updatePanel = (i: number, c: PanelCfg) => setPanels((p) => p.map((x, j) => (j === i ? c : x)));

  const save = async () => { await saveLayout({ layout, panels }); setMsg("Layout saved"); setTimeout(() => setMsg(""), 2000); };
  const load = async () => { const l = await loadLayout(); if (l?.panels) { setLayout(l.layout || 4); setPanels(l.panels); setMsg("Layout loaded"); } else setMsg("No saved layout"); setTimeout(() => setMsg(""), 2000); };

  const gridCls = layout === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2";
  const cellH = layout === 1 ? 460 : layout === 2 ? 340 : 280;

  const LBtn = ({ n, Icon }: any) => (
    <button onClick={() => setCount(n)} className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${layout === n ? "bg-brand/15 border-brand/40 text-brand" : "border-line text-faint hover:text-txt"}`} title={`${n} charts`}>
      <Icon size={15} />
    </button>
  );

  return (
    <Section title="Charts" right={
      <div className="flex items-center gap-1.5">
        {msg && <span className="text-[0.6rem] font-mono text-brand mr-1">{msg}</span>}
        <LBtn n={1} Icon={Square} /><LBtn n={2} Icon={Maximize2} /><LBtn n={4} Icon={Grid2x2} /><LBtn n={6} Icon={LayoutGrid} />
        <button onClick={save} title="Save layout" className="p-1.5 rounded-lg border border-line text-faint hover:text-brand cursor-pointer transition-colors"><Save size={15} /></button>
        <button onClick={load} title="Load layout" className="p-1.5 rounded-lg border border-line text-faint hover:text-brand cursor-pointer transition-colors"><FolderOpen size={15} /></button>
      </div>
    }>
      <div className={`grid ${gridCls} gap-2.5`}>
        {panels.map((cfg, i) => (
          <ChartPanel key={i} cfg={cfg} onChange={(c) => updatePanel(i, c)} height={cellH} syncRef={syncRef} />
        ))}
      </div>
    </Section>
  );
}
