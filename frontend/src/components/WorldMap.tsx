import { useEffect, useRef } from "react";
import Globe from "globe.gl";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";
import { useTheme } from "../lib/theme";

// Major exchanges → coordinates, matched to the global-macro / indices feeds.
const NODES: { city: string; lat: string; lng: number; label: string; match: string[]; indian?: boolean }[] = [
  { city: "New York", lat: "40.71", lng: -74.0, label: "NYSE / Nasdaq", match: ["S&P 500", "Nasdaq", "Dow"] },
  { city: "London", lat: "51.51", lng: -0.13, label: "LSE", match: ["FTSE 100"] },
  { city: "Frankfurt", lat: "50.11", lng: 8.68, label: "Xetra (DAX)", match: ["DAX"] },
  { city: "Tokyo", lat: "35.68", lng: 139.69, label: "TSE (Nikkei)", match: ["Nikkei"] },
  { city: "Hong Kong", lat: "22.32", lng: 114.17, label: "HKEX (Hang Seng)", match: ["Hang Seng"] },
  { city: "Mumbai", lat: "19.07", lng: 72.87, label: "NSE (Nifty)", match: ["NIFTY 50", "NIFTY", "Nifty 50"], indian: true },
];
const MUMBAI = { lat: 19.07, lng: 72.87 };

export default function WorldMap() {
  const wrap = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const theme = useTheme();
  const macro = useFetch(() => api.globalMacro(), [], 300_000);
  const indices = useFetch(() => api.indices(), [], 90_000);

  // build market points
  const idxMap: Record<string, number> = {};
  (macro.data?.indices ?? []).forEach((q) => (idxMap[q.label] = q.pct));
  (indices.data?.indices ?? []).forEach((q) => (idxMap[q.name] = q.pct));

  const points = NODES.map((n) => {
    const lbl = n.match.find((m) => idxMap[m] !== undefined);
    const pct = lbl !== undefined ? idxMap[lbl] : undefined;
    return { ...n, lat: parseFloat(n.lat), pct };
  }).filter((n) => n.pct !== undefined) as Array<{ city: string; lat: number; lng: number; label: string; pct: number; indian?: boolean }>;

  useEffect(() => {
    if (!wrap.current) return;
    const dark = theme === "dark";
    const g = new (Globe as any)(wrap.current, { animateIn: true })
      .backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(`//unpkg.com/three-globe/example/img/earth-${dark ? "night" : "blue-marble"}.jpg`)
      .atmosphereColor(dark ? "#22d3ee" : "#0891b2")
      .atmosphereAltitude(0.18)
      .showGraticules(true);
    globeRef.current = g;
    const c = g.controls();
    c.autoRotate = true; c.autoRotateSpeed = 0.45; c.enableZoom = true;
    g.pointOfView({ lat: 20, lng: 60, altitude: 2.3 }, 0);

    const H = 420;
    const resize = () => {
      const el = wrap.current;
      if (!el) return;
      const w = el.clientWidth || el.parentElement?.clientWidth || el.getBoundingClientRect().width || 600;
      g.width(Math.round(w)).height(H);
    };
    // The globe can mount before flex layout settles (width 0) — retry on rAF
    // until the container has real width, then keep it sized via ResizeObserver.
    let tries = 0;
    const settle = () => {
      resize();
      if ((wrap.current?.clientWidth ?? 0) < 50 && tries++ < 40) requestAnimationFrame(settle);
    };
    settle();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap.current);

    return () => { ro.disconnect(); try { g._destructor?.(); } catch { /* */ } if (wrap.current) wrap.current.innerHTML = ""; };
  }, [theme]);

  // update market data layers when quotes arrive
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const col = (pct: number) => (pct >= 0 ? "#22c55e" : "#ef4444");
    g.pointsData(points)
      .pointLat("lat").pointLng("lng")
      .pointColor((d: any) => col(d.pct))
      .pointAltitude((d: any) => Math.min(0.06 + Math.abs(d.pct) * 0.06, 0.5))
      .pointRadius((d: any) => (d.indian ? 0.55 : 0.4))
      .pointLabel((d: any) => `<div style="font-family:monospace;font-size:11px;background:#0B1220;color:#f1f5f9;border:1px solid #1e2d44;border-radius:6px;padding:4px 7px"><b>${d.label}</b><br/>${d.city} · <span style="color:${col(d.pct)}">${d.pct >= 0 ? "+" : ""}${d.pct}%</span></div>`);

    g.ringsData(points.filter((p) => Math.abs(p.pct) >= 1))
      .ringLat("lat").ringLng("lng").ringMaxRadius(3).ringPropagationSpeed(1.4).ringRepeatPeriod(900)
      .ringColor((d: any) => (t: number) => `rgba(${d.pct >= 0 ? "34,197,94" : "239,68,68"},${1 - t})`);

    // arcs from global exchanges → Mumbai (capital-flow vibe)
    const arcs = points.filter((p) => !p.indian).map((p) => ({ startLat: p.lat, startLng: p.lng, endLat: MUMBAI.lat, endLng: MUMBAI.lng, pct: p.pct }));
    g.arcsData(arcs)
      .arcColor((d: any) => [d.pct >= 0 ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)", "rgba(34,211,238,0.35)"])
      .arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2200).arcStroke(0.4).arcAltitudeAutoScale(0.4);
  }, [macro.data, indices.data]); // eslint-disable-line

  const loading = macro.loading && indices.loading;
  const tone = macro.data?.risk_tone;
  const toneColor = tone === "Risk-On" ? "text-up" : tone === "Risk-Off" ? "text-down" : "text-gold";

  return (
    <Panel title="Global Markets Map · Live" status={tone === "Risk-On" ? "up" : tone === "Risk-Off" ? "down" : "warn"}
      meta={macro.data?.available ? <span className={toneColor}>{tone} · {macro.data.risk_score}/100</span> : undefined}
      bodyClass="p-0">
      <div className="relative">
        <div ref={wrap} style={{ height: 420, width: "100%" }} />
        {loading && <div className="absolute inset-0 grid place-items-center"><Skeleton h={60} /></div>}
        {!loading && !points.length && <div className="absolute inset-x-0 bottom-2 text-center"><Empty msg="Market feed loading…" /></div>}
        {/* legend */}
        <div className="absolute left-3 bottom-3 flex flex-col gap-1 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full bg-up" /> Index up</div>
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full bg-down" /> Index down</div>
          <div className="text-[0.55rem] font-mono text-faint">arcs → Mumbai (NSE)</div>
        </div>
      </div>
    </Panel>
  );
}
