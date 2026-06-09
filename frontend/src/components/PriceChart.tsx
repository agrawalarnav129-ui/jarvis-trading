import { useEffect, useRef, useState } from "react";
import { Minus, Slash, Eraser } from "lucide-react";
import {
  createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "../lib/api";
import { ema, bollinger, rsi as rsiTA, volume as volTA, normalized } from "../lib/ta";

export interface ChartIndicators { ema?: boolean; bb?: boolean; rsi?: boolean; volume?: boolean; volumeProfile?: boolean; }

interface Props {
  candles: Candle[];
  interval: string;
  indicators: ChartIndicators;
  compareCandles?: Candle[] | null;
  compareLabel?: string;
  footprint?: { price: number; total_vol: number }[] | null;
  poc?: number;
  height?: number;
  // crosshair-sync registry shared across a grid: maps time -> apply on siblings
  syncRef?: React.MutableRefObject<Set<(time: number | null) => void>>;
}

const T = (n: number) => n as UTCTimestamp;

export default function PriceChart({ candles, interval, indicators, compareCandles, footprint, poc, height = 300, syncRef }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vpRef = useRef<HTMLDivElement>(null);

  // ── drawing tools state ──
  type Drawing = { type: "hl"; price: number } | { type: "tl"; a: { time: number; price: number }; b: { time: number; price: number } };
  const [drawMode, setDrawMode] = useState<"none" | "hl" | "tl">("none");
  const drawModeRef = useRef<"none" | "hl" | "tl">("none");
  drawModeRef.current = drawMode;
  const drawingsRef = useRef<Drawing[]>([]);
  const removersRef = useRef<Array<() => void>>([]);
  const tlFirstRef = useRef<{ time: number; price: number } | null>(null);
  const clearDrawings = () => {
    removersRef.current.forEach((fn) => fn());
    removersRef.current = [];
    drawingsRef.current = [];
    tlFirstRef.current = null;
  };

  useEffect(() => {
    if (!wrap.current) return;
    const intraday = !["1d", "1wk"].includes(interval);
    const chart = createChart(wrap.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B1220" }, textColor: "#94a3b8", fontSize: 10 },
      grid: { vertLines: { color: "rgba(30,45,68,0.5)" }, horzLines: { color: "rgba(30,45,68,0.5)" } },
      rightPriceScale: { borderColor: "#1e2d44" },
      timeScale: { borderColor: "#1e2d44", timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: false,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    candleRef.current = candleSeries;
    candleSeries.setData(candles.map((c) => ({ time: T(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));

    // ── drawings: re-apply stored + handle click-to-draw ──
    removersRef.current = [];
    const applyDrawing = (d: Drawing) => {
      if (d.type === "hl") {
        const pl = candleSeries.createPriceLine({ price: d.price, color: "#22d3ee", lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "" });
        removersRef.current.push(() => { try { candleSeries.removePriceLine(pl); } catch { /* */ } });
      } else {
        const ln = chart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        const pts = [d.a, d.b].sort((x, y) => x.time - y.time).map((p) => ({ time: T(p.time), value: p.price }));
        ln.setData(pts);
        removersRef.current.push(() => { try { chart.removeSeries(ln); } catch { /* */ } });
      }
    };
    drawingsRef.current.forEach(applyDrawing);
    chart.subscribeClick((param) => {
      const mode = drawModeRef.current;
      if (mode === "none" || !param.point || param.time == null) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;
      const p = Math.round(price * 100) / 100;
      const time = param.time as number;
      if (mode === "hl") {
        const d: Drawing = { type: "hl", price: p };
        drawingsRef.current.push(d); applyDrawing(d);
      } else if (!tlFirstRef.current) {
        tlFirstRef.current = { time, price: p };
      } else {
        const d: Drawing = { type: "tl", a: tlFirstRef.current, b: { time, price: p } };
        tlFirstRef.current = null; drawingsRef.current.push(d); applyDrawing(d);
      }
    });

    if (indicators.volume) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(volTA(candles).map((p) => ({ time: T(p.time), value: p.value, color: p.color })));
    }

    if (indicators.ema) {
      const colors: [number, string][] = [[9, "#67e8f9"], [21, "#22d3ee"], [50, "#fbbf24"], [200, "#ef4444"]];
      for (const [p, color] of colors) {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(ema(candles, p).map((x) => ({ time: T(x.time), value: x.value })));
      }
    }

    if (indicators.bb) {
      const bb = bollinger(candles, 20, 2);
      for (const band of [bb.upper, bb.lower] as const) {
        const s = chart.addSeries(LineSeries, { color: "rgba(148,163,184,0.6)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        s.setData(band.map((x) => ({ time: T(x.time), value: x.value })));
      }
      const mid = chart.addSeries(LineSeries, { color: "rgba(148,163,184,0.35)", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      mid.setData(bb.mid.map((x) => ({ time: T(x.time), value: x.value })));
    }

    if (compareCandles && compareCandles.length) {
      const cmp = chart.addSeries(LineSeries, { color: "#a855f7", lineWidth: 2, priceScaleId: "cmp", priceLineVisible: false, lastValueVisible: false });
      cmp.setData(normalized(compareCandles).map((x) => ({ time: T(x.time), value: x.value })));
    }

    if (indicators.rsi) {
      try {
        const r = chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 1, priceScaleId: "rsi", lastValueVisible: false }, 1);
        r.setData(rsiTA(candles, 14).map((x) => ({ time: T(x.time), value: x.value })));
        r.createPriceLine({ price: 70, color: "rgba(239,68,68,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
        r.createPriceLine({ price: 30, color: "rgba(34,197,94,0.4)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
        chart.panes()[1]?.setHeight(Math.round(height * 0.25));
      } catch { /* pane API unavailable — skip RSI */ }
    }

    chart.timeScale().fitContent();

    // ── crosshair sync across the grid ──
    let suppress = false;
    const apply = (time: number | null) => {
      suppress = true;
      if (time == null) chart.clearCrosshairPosition();
      else {
        const c = candles.find((x) => x.t === time);
        if (c) chart.setCrosshairPosition(c.c, T(time), candleSeries);
      }
      suppress = false;
    };
    syncRef?.current.add(apply);
    chart.subscribeCrosshairMove((param) => {
      if (suppress) return;
      const time = (param.time as number | undefined) ?? null;
      syncRef?.current.forEach((fn) => { if (fn !== apply) fn(time); });
    });

    // ── responsive ──
    const ro = new ResizeObserver(() => {
      if (wrap.current) chart.applyOptions({ width: wrap.current.clientWidth });
    });
    ro.observe(wrap.current);
    chart.applyOptions({ width: wrap.current.clientWidth });

    return () => {
      ro.disconnect();
      syncRef?.current.delete(apply);
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      removersRef.current = [];
    };
  }, [candles, JSON.stringify(indicators), interval, height, compareCandles?.length]);

  // ── Volume Profile overlay (right rail, aligned to price axis) ──
  useEffect(() => {
    const draw = () => {
      const el = vpRef.current, chart = chartRef.current, series = candleRef.current;
      if (!el || !chart || !series) return;
      el.innerHTML = "";
      if (!indicators.volumeProfile || !footprint || !footprint.length) return;
      const maxVol = Math.max(...footprint.map((f) => f.total_vol)) || 1;
      for (const f of footprint) {
        const y = series.priceToCoordinate(f.price);
        if (y == null) continue;
        const bar = document.createElement("div");
        const w = (f.total_vol / maxVol) * 64;
        const isPoc = poc != null && Math.abs(f.price - poc) < 1e-6;
        bar.style.cssText = `position:absolute;right:52px;top:${y - 1}px;height:2px;width:${w}px;background:${isPoc ? "#fbbf24" : "rgba(34,211,238,0.45)"};pointer-events:none;`;
        el.appendChild(bar);
      }
    };
    draw();
    const chart = chartRef.current;
    const sub = () => draw();
    chart?.timeScale().subscribeVisibleLogicalRangeChange(sub);
    const id = setInterval(draw, 600); // keep aligned during animations/resize
    return () => { chart?.timeScale().unsubscribeVisibleLogicalRangeChange(sub); clearInterval(id); };
  }, [candles, footprint, indicators.volumeProfile, poc]);

  const tbBtn = (active: boolean) =>
    `p-1 rounded border cursor-pointer transition-colors ${active ? "bg-brand/20 border-brand/50 text-brand" : "bg-elevated/80 border-line text-faint hover:text-txt"}`;

  return (
    <div className="relative">
      <div className="absolute left-1 top-1 z-10 flex gap-1">
        <button onClick={() => setDrawMode(drawMode === "hl" ? "none" : "hl")} title="Horizontal level (click a price)" className={tbBtn(drawMode === "hl")}><Minus size={12} /></button>
        <button onClick={() => setDrawMode(drawMode === "tl" ? "none" : "tl")} title="Trendline (click 2 points)" className={tbBtn(drawMode === "tl")}><Slash size={12} /></button>
        <button onClick={clearDrawings} title="Clear drawings" className="p-1 rounded border bg-elevated/80 border-line text-faint hover:text-down cursor-pointer transition-colors"><Eraser size={12} /></button>
      </div>
      <div ref={wrap} style={{ cursor: drawMode === "none" ? "default" : "crosshair" }} />
      <div ref={vpRef} className="absolute inset-0 pointer-events-none" />
    </div>
  );
}
