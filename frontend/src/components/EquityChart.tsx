import { useEffect, useRef } from "react";
import { createChart, ColorType, AreaSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";

/** Lightweight equity/cumulative-P&L curve (no recharts). Uses index as time. */
export default function EquityChart({ data, height = 140 }: { data: number[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wrap.current || !data.length) return;
    const chart: IChartApi = createChart(wrap.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B1220" }, textColor: "#94a3b8", fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(30,45,68,0.5)" } },
      rightPriceScale: { borderColor: "#1e2d44" },
      timeScale: { visible: false },
      handleScroll: false, handleScale: false,
    });
    const s = chart.addSeries(AreaSeries, {
      lineColor: "#22d3ee", topColor: "rgba(34,211,238,0.25)", bottomColor: "rgba(34,211,238,0)",
      lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    s.setData(data.map((v, i) => ({ time: (i + 1) as UTCTimestamp, value: v })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (wrap.current) chart.applyOptions({ width: wrap.current.clientWidth }); });
    ro.observe(wrap.current);
    chart.applyOptions({ width: wrap.current.clientWidth });
    return () => { ro.disconnect(); chart.remove(); };
  }, [data, height]);
  return <div ref={wrap} />;
}
