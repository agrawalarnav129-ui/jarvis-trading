import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";

// AI Global Situation Report — per-region market stance + India impact.
const STANCE: Record<string, { c: string; bg: string; s: string }> = {
  "risk-on": { c: "text-up", bg: "bg-up/10 border-up/30", s: "▲ RISK-ON" },
  "risk-off": { c: "text-down", bg: "bg-down/10 border-down/30", s: "▼ RISK-OFF" },
  mixed: { c: "text-gold", bg: "bg-gold/10 border-gold/30", s: "◆ MIXED" },
};

export default function GlobalSitrep() {
  const { data, loading } = useFetch(() => api.globalSitrep(), [], 900_000);
  if (loading) return <Panel title="AI Global SITREP"><Skeleton h={260} /></Panel>;
  if (!data || !data.available)
    return <Panel title="AI Global SITREP" status="muted"><Empty msg={data?.note || "SITREP unavailable."} /></Panel>;

  const tone = data.risk_tone === "Risk-On" ? "up" : data.risk_tone === "Risk-Off" ? "down" : "warn";
  const toneTxt = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-gold";
  return (
    <Panel title="AI Global SITREP" status={tone}
      meta={<span className={toneTxt}>{data.risk_tone} · {data.risk_score}/100</span>} bodyClass="p-3">
      <div className="text-[0.78rem] text-txt leading-relaxed mb-3">{data.overall}</div>

      <div className="flex flex-col gap-1.5 mb-3">
        {data.regions.map((r) => {
          const st = STANCE[r.stance] ?? STANCE.mixed;
          return (
            <div key={r.region} className="flex items-start gap-2">
              <span className={`shrink-0 w-24 text-[0.58rem] font-mono px-1.5 py-0.5 rounded border text-center ${st.bg} ${st.c}`}>{st.s}</span>
              <div className="min-w-0">
                <span className="font-mono text-[0.66rem] text-txt">{r.region}</span>
                <span className="text-[0.66rem] text-muted"> — {r.note}</span>
              </div>
            </div>
          );
        })}
      </div>

      {data.india_impact && (
        <div className="border-l-2 border-l-brand pl-2.5 py-1 bg-brand/5 rounded-r">
          <div className="label text-brand mb-0.5">India Impact · NSE</div>
          <div className="text-[0.74rem] text-txt leading-snug">{data.india_impact}</div>
        </div>
      )}
    </Panel>
  );
}
