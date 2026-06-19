import { useEffect, useRef, useState } from "react";
import Globe from "globe.gl";
import { Globe2, Map as MapIcon } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton } from "./ui";
import { useTheme } from "../lib/theme";

const NODES: { city: string; lat: number; lng: number; label: string; match: string[]; indian?: boolean }[] = [
  { city: "New York", lat: 40.71, lng: -74.0, label: "NYSE / Nasdaq", match: ["S&P 500", "Nasdaq", "Dow"] },
  { city: "London", lat: 51.51, lng: -0.13, label: "LSE", match: ["FTSE 100"] },
  { city: "Frankfurt", lat: 50.11, lng: 8.68, label: "Xetra (DAX)", match: ["DAX"] },
  { city: "Tokyo", lat: 35.68, lng: 139.69, label: "TSE (Nikkei)", match: ["Nikkei"] },
  { city: "Hong Kong", lat: 22.32, lng: 114.17, label: "HKEX (Hang Seng)", match: ["Hang Seng"] },
  { city: "Mumbai", lat: 19.07, lng: 72.87, label: "NSE (Nifty)", match: ["NIFTY 50", "NIFTY", "Nifty 50"], indian: true },
];
const MUMBAI = { lat: 19.07, lng: 72.87 };
const up = (p: number) => (p >= 0 ? "#6B8F5E" : "#C0607A");      // WM sage / mauve
const NEWS = "#C4A35A";                                          // WM amber

export default function WorldMap() {
  const wrap = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const theme = useTheme();
  const [mode, setMode] = useState<"globe" | "flat">("globe");
  const macro = useFetch(() => api.globalMacro(), [], 300_000);
  const indices = useFetch(() => api.indices(), [], 90_000);
  const news = useFetch(() => api.worldNews(), [], 600_000);

  const idxMap: Record<string, number> = {};
  (macro.data?.indices ?? []).forEach((q) => (idxMap[q.label] = q.pct));
  (indices.data?.indices ?? []).forEach((q) => (idxMap[q.name] = q.pct));
  const points = NODES.map((n) => {
    const lbl = n.match.find((m) => idxMap[m] !== undefined);
    return { ...n, pct: lbl !== undefined ? idxMap[lbl] : undefined };
  }).filter((n) => n.pct !== undefined) as Array<{ city: string; lat: number; lng: number; label: string; pct: number; indian?: boolean }>;
  const newsPts = (news.data?.points ?? []).slice(0, 30);

  // ── 3D globe ──
  useEffect(() => {
    if (mode !== "globe" || !wrap.current) return;
    const dark = theme === "dark";
    const g = new (Globe as any)(wrap.current, { animateIn: true })
      .backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(`//unpkg.com/three-globe/example/img/earth-${dark ? "night" : "blue-marble"}.jpg`)
      .atmosphereColor(dark ? "#8AB07C" : "#7BA5C4").atmosphereAltitude(0.18).showGraticules(true);
    globeRef.current = g;
    const c = g.controls(); c.autoRotate = true; c.autoRotateSpeed = 0.45;
    g.pointOfView({ lat: 20, lng: 60, altitude: 2.3 }, 0);

    const H = 420;
    const resize = () => { const el = wrap.current; if (el) g.width(Math.round(el.clientWidth || el.parentElement?.clientWidth || 600)).height(H); };
    let tries = 0; const settle = () => { resize(); if ((wrap.current?.clientWidth ?? 0) < 50 && tries++ < 40) requestAnimationFrame(settle); };
    settle();
    const ro = new ResizeObserver(resize); ro.observe(wrap.current);
    return () => { ro.disconnect(); try { g._destructor?.(); } catch { /* */ } if (wrap.current) wrap.current.innerHTML = ""; globeRef.current = null; };
  }, [theme, mode]);

  // market + news layers
  useEffect(() => {
    const g = globeRef.current;
    if (!g || mode !== "globe") return;
    g.pointsData(points).pointLat("lat").pointLng("lng")
      .pointColor((d: any) => up(d.pct))
      .pointAltitude((d: any) => Math.min(0.06 + Math.abs(d.pct) * 0.06, 0.5))
      .pointRadius((d: any) => (d.indian ? 0.55 : 0.4))
      .pointLabel((d: any) => `<div style="font-family:monospace;font-size:11px;background:#202621;color:#E8ECE2;border:1px solid #3A423A;border-radius:6px;padding:4px 7px"><b>${d.label}</b><br/>${d.city} · <span style="color:${up(d.pct)}">${d.pct >= 0 ? "+" : ""}${d.pct}%</span></div>`);
    g.ringsData(points.filter((p) => Math.abs(p.pct) >= 1)).ringLat("lat").ringLng("lng")
      .ringMaxRadius(3).ringPropagationSpeed(1.4).ringRepeatPeriod(900)
      .ringColor((d: any) => (t: number) => `${up(d.pct)}${Math.round((1 - t) * 200).toString(16).padStart(2, "0")}`);
    const arcs = points.filter((p) => !p.indian).map((p) => ({ startLat: p.lat, startLng: p.lng, endLat: MUMBAI.lat, endLng: MUMBAI.lng, pct: p.pct }));
    g.arcsData(arcs).arcColor((d: any) => [up(d.pct) + "66", "#7BA5C466"]).arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2200).arcStroke(0.4).arcAltitudeAutoScale(0.4);
    // geocoded news markers (amber pulsing dots)
    g.htmlElementsData(newsPts).htmlLat("lat").htmlLng("lng").htmlElement((d: any) => {
      const el = document.createElement("div");
      const r = Math.min(6 + d.count * 2, 16);
      el.style.cssText = `width:${r}px;height:${r}px;border-radius:50%;background:${NEWS};box-shadow:0 0 8px ${NEWS};opacity:0.85;cursor:pointer`;
      el.title = `${d.place} · ${d.count} stories\n${(d.headlines || []).join("\n")}`;
      return el;
    });
  }, [macro.data, indices.data, news.data, mode]); // eslint-disable-line

  // ── flat equirectangular map ──
  const dark = theme === "dark";
  const proj = (lat: number, lng: number) => ({ left: `${((lng + 180) / 360) * 100}%`, top: `${((90 - lat) / 180) * 100}%` });
  const tone = macro.data?.risk_tone;
  const toneColor = tone === "Risk-On" ? "text-up" : tone === "Risk-Off" ? "text-down" : "text-gold";

  const toggle = (
    <div className="flex gap-0.5">
      {([["globe", Globe2], ["flat", MapIcon]] as const).map(([m, Icon]) => (
        <button key={m} onClick={() => setMode(m)} title={m === "globe" ? "3D globe" : "Flat map"}
          className={`p-1 rounded cursor-pointer transition-colors ${mode === m ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>
          <Icon size={13} />
        </button>
      ))}
    </div>
  );

  return (
    <Panel title="Global Markets Map · Live" status={tone === "Risk-On" ? "up" : tone === "Risk-Off" ? "down" : "warn"}
      meta={macro.data?.available ? <span className={toneColor}>{tone} · {macro.data.risk_score}/100</span> : undefined}
      right={toggle} bodyClass="p-0">
      <div className="relative">
        {mode === "globe" ? (
          <div ref={wrap} style={{ height: 420, width: "100%" }} />
        ) : (
          <div className="relative w-full" style={{ aspectRatio: "2 / 1", maxHeight: 420,
            backgroundImage: `url(//unpkg.com/three-globe/example/img/earth-${dark ? "night" : "blue-marble"}.jpg)`,
            backgroundSize: "100% 100%" }}>
            {/* arcs omitted on flat; markets + news as positioned dots */}
            {points.map((p) => (
              <div key={p.city} className="absolute -translate-x-1/2 -translate-y-1/2 group" style={proj(p.lat, p.lng)}>
                <div className="rounded-full" style={{ width: 10, height: 10, background: up(p.pct), boxShadow: `0 0 8px ${up(p.pct)}` }} />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[0.55rem] px-1 rounded bg-base/80 text-txt opacity-0 group-hover:opacity-100 transition-opacity">
                  {p.label} {p.pct >= 0 ? "+" : ""}{p.pct}%
                </div>
              </div>
            ))}
            {newsPts.map((n: any, i: number) => (
              <div key={`n${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                title={`${n.place} · ${n.count} stories`}
                style={{ ...proj(n.lat, n.lng), width: Math.min(6 + n.count * 2, 16), height: Math.min(6 + n.count * 2, 16), background: NEWS, boxShadow: `0 0 6px ${NEWS}`, opacity: 0.85 }} />
            ))}
          </div>
        )}
        {(macro.loading && indices.loading) && <div className="absolute inset-0 grid place-items-center"><Skeleton h={60} /></div>}
        {/* legend */}
        <div className="absolute left-3 bottom-3 flex flex-col gap-1 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full bg-up" /> Index up</div>
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full bg-down" /> Index down</div>
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full" style={{ background: NEWS }} /> News hotspot</div>
        </div>
      </div>
    </Panel>
  );
}
