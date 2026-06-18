import { useEffect, useRef } from "react";
import { createChart, ColorType, AreaSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useTheme, cssRGB } from "../lib/theme";

/** Lightweight equity/cumulative-P&L curve (no recharts). Uses index as time. */
export default function EquityChart({ data, height = 140 }: { data: number[]; height?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  useEffect(() => {
    if (!wrap.current || !data.length) return;
    const chart: IChartApi = createChart(wrap.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: cssRGB("--c-surface") }, textColor: cssRGB("--c-muted"), fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: cssRGB("--c-line", 0.5) } },
      rightPriceScale: { borderColor: cssRGB("--c-line") },
      timeScale: { visible: false },
      handleScroll: false, handleScale: false,
    });
    const s = chart.addSeries(AreaSeries, {
      lineColor: cssRGB("--c-brand"), topColor: cssRGB("--c-brand", 0.25), bottomColor: cssRGB("--c-brand", 0),
      lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
    });
    s.setData(data.map((v, i) => ({ time: (i + 1) as UTCTimestamp, value: v })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (wrap.current) chart.applyOptions({ width: wrap.current.clientWidth }); });
    ro.observe(wrap.current);
    chart.applyOptions({ width: wrap.current.clientWidth });
    return () => { ro.disconnect(); chart.remove(); };
  }, [data, height, theme]);
  return <div ref={wrap} />;
}
