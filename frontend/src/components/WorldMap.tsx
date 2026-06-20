import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "globe.gl";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
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
  { city: "Mumbai", lat: 19.07, lng: 72.87, label: "NSE (Nifty)", match: ["Nifty 50", "NIFTY 50", "NIFTY"], indian: true },
];
const MUMBAI = { lat: 19.07, lng: 72.87 };
const NEWS = "#C4A35A";

// world-atlas country polygons — loaded once, shared (free, CORS-enabled CDN).
let _countries: any[] | null = null;
let _loading: Promise<any[]> | null = null;
function loadCountries(): Promise<any[]> {
  if (_countries) return Promise.resolve(_countries);
  if (!_loading)
    _loading = fetch("https://unpkg.com/world-atlas@2/countries-110m.json")
      .then((r) => r.json())
      .then((topo: any) => { _countries = (feature(topo, topo.objects.countries) as any).features; return _countries!; })
      .catch(() => { _countries = []; return []; });
  return _loading;
}

export default function WorldMap() {
  const wrap = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const theme = useTheme();
  const dark = theme === "dark";
  const [mode, setMode] = useState<"globe" | "flat">("flat");
  const [countries, setCountries] = useState<any[]>([]);
  const mapWrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; name: string } | null>(null);
  const onMove = (e: React.MouseEvent, name: string) => {
    const r = mapWrap.current?.getBoundingClientRect(); if (!r) return;
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, name });
  };
  const macro = useFetch(() => api.globalMacro(), [], 300_000);
  const indices = useFetch(() => api.indices(), [], 90_000);
  const news = useFetch(() => api.worldNews(), [], 600_000);

  useEffect(() => { loadCountries().then(setCountries); }, []);

  const idxMap: Record<string, number> = {};
  (macro.data?.indices ?? []).forEach((q) => (idxMap[q.label] = q.pct));
  (indices.data?.indices ?? []).forEach((q) => (idxMap[q.name] = q.pct));
  const countryPct: Record<string, number> = {};
  const countryInfo: Record<string, { label: string; pct: number }> = {};
  (macro.data?.indices ?? []).forEach((q: any) => { if (q.country) { countryPct[q.country] = q.pct; countryInfo[q.country] = { label: q.label, pct: q.pct }; } });

  const points = NODES.map((n) => {
    const lbl = n.match.find((m) => idxMap[m] !== undefined);
    return { ...n, pct: lbl !== undefined ? idxMap[lbl] : undefined };
  }).filter((n) => n.pct !== undefined) as Array<{ city: string; lat: number; lng: number; label: string; pct: number; indian?: boolean }>;
  const newsPts = (news.data?.points ?? []).slice(0, 30);

  // ── color helpers ──
  const upC = dark ? "138,176,124" : "107,143,94";
  const dnC = dark ? "210,138,162" : "192,96,122";
  const upHex = (p: number) => (p >= 0 ? `rgb(${upC})` : `rgb(${dnC})`);
  const noData = dark ? "rgba(255,255,255,0.05)" : "rgba(45,58,46,0.05)";
  const border = dark ? "rgba(232,236,226,0.12)" : "rgba(45,58,46,0.14)";
  const fill = (pct?: number) => {
    if (pct === undefined) return noData;
    const a = Math.min(Math.abs(pct) / 2, 1) * 0.6 + 0.14;
    return `rgba(${pct >= 0 ? upC : dnC},${a})`;
  };

  // ── d3 projection for the flat choropleth ──
  const projection = useMemo(() => geoNaturalEarth1().fitSize([1000, 500], { type: "Sphere" } as any), []);
  const pathGen = useMemo(() => geoPath(projection), [projection]);

  // ── 3D globe (textured + market points) ──
  useEffect(() => {
    if (mode !== "globe" || !wrap.current) return;
    const g = new (Globe as any)(wrap.current, { animateIn: true })
      .backgroundColor("rgba(0,0,0,0)")
      .globeImageUrl(`//unpkg.com/three-globe/example/img/earth-${dark ? "night" : "blue-marble"}.jpg`)
      .atmosphereColor(dark ? "#8AB07C" : "#7BA5C4").atmosphereAltitude(0.18).showGraticules(true);
    globeRef.current = g;
    const c = g.controls(); c.autoRotate = true; c.autoRotateSpeed = 0.45;
    g.pointOfView({ lat: 20, lng: 60, altitude: 2.3 }, 0);
    const H = 460;
    const resize = () => { const el = wrap.current; if (el) g.width(Math.round(el.clientWidth || el.parentElement?.clientWidth || 600)).height(H); };
    let tries = 0; const settle = () => { resize(); if ((wrap.current?.clientWidth ?? 0) < 50 && tries++ < 40) requestAnimationFrame(settle); };
    settle();
    const ro = new ResizeObserver(resize); ro.observe(wrap.current);
    return () => { ro.disconnect(); try { g._destructor?.(); } catch { /* */ } if (wrap.current) wrap.current.innerHTML = ""; globeRef.current = null; };
  }, [theme, mode]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || mode !== "globe") return;
    g.pointsData(points).pointLat("lat").pointLng("lng")
      .pointColor((d: any) => upHex(d.pct))
      .pointAltitude((d: any) => Math.min(0.06 + Math.abs(d.pct) * 0.06, 0.5))
      .pointRadius((d: any) => (d.indian ? 0.55 : 0.4))
      .pointLabel((d: any) => `<div style="font-family:monospace;font-size:11px;background:#202621;color:#E8ECE2;border:1px solid #3A423A;border-radius:6px;padding:4px 7px"><b>${d.label}</b><br/>${d.city} · ${d.pct >= 0 ? "+" : ""}${d.pct}%</div>`);
    const arcs = points.filter((p) => !p.indian).map((p) => ({ startLat: p.lat, startLng: p.lng, endLat: MUMBAI.lat, endLng: MUMBAI.lng, pct: p.pct }));
    g.arcsData(arcs).arcColor((d: any) => [upHex(d.pct), "rgba(123,165,196,0.4)"]).arcDashLength(0.4).arcDashGap(0.2).arcDashAnimateTime(2200).arcStroke(0.4).arcAltitudeAutoScale(0.4);
    g.htmlElementsData(newsPts).htmlLat("lat").htmlLng("lng").htmlElement((d: any) => {
      const el = document.createElement("div"); const r = Math.min(6 + d.count * 2, 16);
      el.style.cssText = `width:${r}px;height:${r}px;border-radius:50%;background:${NEWS};box-shadow:0 0 8px ${NEWS};opacity:.85;cursor:pointer`;
      el.title = `${d.place} · ${d.count} stories\n${(d.headlines || []).join("\n")}`; return el;
    });
  }, [macro.data, indices.data, news.data, mode]); // eslint-disable-line

  const tone = macro.data?.risk_tone;
  const toneColor = tone === "Risk-On" ? "text-up" : tone === "Risk-Off" ? "text-down" : "text-gold";
  const toggle = (
    <div className="flex rounded-md overflow-hidden border border-line">
      {([["flat", "2D"], ["globe", "3D"]] as const).map(([m, lbl]) => (
        <button key={m} onClick={() => setMode(m)} title={m === "globe" ? "3D globe" : "2D flat map"}
          className={`px-1.5 py-0.5 text-[0.6rem] font-mono font-semibold cursor-pointer transition-colors ${mode === m ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>{lbl}</button>
      ))}
    </div>
  );

  return (
    <Panel title="Global Markets Situation · Live" status={tone === "Risk-On" ? "up" : tone === "Risk-Off" ? "down" : "warn"}
      meta={macro.data?.available ? <span className={toneColor}>{tone} · {macro.data.risk_score}/100</span> : undefined}
      right={toggle} bodyClass="p-0">
      <div className="relative" ref={mapWrap}>
        {mode === "globe" ? (
          <div ref={wrap} style={{ height: 460, width: "100%" }} />
        ) : (
          <svg viewBox="0 0 1000 500" className="w-full block" style={{ background: dark ? "#11150f" : "#eef0e8" }} preserveAspectRatio="xMidYMid meet">
            {countries.map((f, i) => (
              <path key={f.id ?? i} d={pathGen(f) || ""} fill={fill(countryPct[f.properties?.name])} stroke={border} strokeWidth={0.3}
                style={{ cursor: "crosshair" }}
                onMouseMove={(e) => onMove(e, f.properties?.name)} onMouseLeave={() => setHover(null)} />
            ))}
            {/* capital-flow arcs → Mumbai */}
            {points.filter((p) => !p.indian).map((p) => {
              const a = projection([p.lng, p.lat]); const b = projection([MUMBAI.lng, MUMBAI.lat]);
              if (!a || !b) return null;
              return <path key={`a${p.city}`} d={`M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${Math.min(a[1], b[1]) - 40} ${b[0]},${b[1]}`} fill="none" stroke={upHex(p.pct)} strokeOpacity={0.35} strokeWidth={0.8} />;
            })}
            {points.map((p) => { const xy = projection([p.lng, p.lat]); return xy && (
              <g key={p.city}><circle cx={xy[0]} cy={xy[1]} r={p.indian ? 5 : 4} fill={upHex(p.pct)} stroke="#fff" strokeOpacity={0.5} strokeWidth={0.5}>
                <title>{p.label} · {p.pct >= 0 ? "+" : ""}{p.pct}%</title></circle></g>); })}
            {newsPts.map((n: any, i: number) => { const xy = projection([n.lng, n.lat]); return xy && (
              <circle key={`n${i}`} cx={xy[0]} cy={xy[1]} r={Math.min(3 + n.count, 8)} fill={NEWS} fillOpacity={0.8}>
                <title>{n.place} · {n.count} stories</title></circle>); })}
          </svg>
        )}
        {(macro.loading && indices.loading) && <div className="absolute inset-0 grid place-items-center"><Skeleton h={60} /></div>}
        <div className="absolute left-3 bottom-3 flex flex-wrap gap-x-3 gap-y-1 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-sm bg-up" /> mkt up</div>
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-sm bg-down" /> mkt down</div>
          <div className="flex items-center gap-1.5 text-[0.58rem] font-mono text-muted"><span className="w-2 h-2 rounded-full" style={{ background: NEWS }} /> news</div>
        </div>
        {mode === "flat" && hover && (
          <div className="absolute z-20 pointer-events-none px-2 py-1 rounded-md bg-base/95 border border-line shadow-card font-mono text-[0.62rem]"
            style={{ left: Math.min(hover.x + 12, (mapWrap.current?.clientWidth ?? 800) - 130), top: hover.y + 12 }}>
            <div className="text-txt">{hover.name}</div>
            {countryInfo[hover.name]
              ? <div className={countryInfo[hover.name].pct >= 0 ? "text-up" : "text-down"}>{countryInfo[hover.name].label} · {countryInfo[hover.name].pct >= 0 ? "+" : ""}{countryInfo[hover.name].pct}%</div>
              : <div className="text-faint">no index tracked</div>}
          </div>
        )}
      </div>
    </Panel>
  );
}
