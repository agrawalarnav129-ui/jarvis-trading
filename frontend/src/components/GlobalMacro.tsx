import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";
import type { MacroQuote } from "../lib/api";

function QuoteRow({ q }: { q: MacroQuote }) {
  const up = q.pct >= 0;
  return (
    <div className="flex items-center gap-2 h-6 font-mono text-[0.66rem] border-b border-line/30 last:border-0">
      <span className="text-muted flex-1 truncate">{q.label}</span>
      <span className="text-txt tabular-nums">{q.last.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
      <span className={`w-14 text-right tabular-nums ${up ? "text-up" : "text-down"}`}>{up ? "▲" : "▼"} {up ? "+" : ""}{q.pct}%</span>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: MacroQuote[] }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="label text-faint mb-0.5 mt-1 first:mt-0">{title}</div>
      {rows.map((q) => <QuoteRow key={q.symbol} q={q} />)}
    </div>
  );
}

export default function GlobalMacro() {
  const { data, loading } = useFetch(() => api.globalMacro(), [], 300_000);
  if (loading) return <Panel title="Global Macro"><Skeleton h={260} /></Panel>;
  if (!data || !data.available)
    return <Panel title="Global Macro" status="muted"><Empty msg={data?.note || "Global feed unavailable."} /></Panel>;

  const tone = data.risk_tone === "Risk-On" ? "up" : data.risk_tone === "Risk-Off" ? "down" : "warn";
  const toneColor = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-gold";
  return (
    <Panel title="Global Macro · World Feed" status={tone}
      meta={<span className={toneColor}>{data.risk_tone} {data.risk_score}/100</span>} bodyClass="p-3">
      {/* risk meter */}
      <div className="mb-2">
        <div className="h-1.5 bg-base rounded overflow-hidden flex">
          <div className="h-full bg-down/60" style={{ width: "35%" }} />
          <div className="h-full bg-gold/50" style={{ width: "25%" }} />
          <div className="h-full bg-up/60" style={{ width: "40%" }} />
        </div>
        <div className="relative h-0">
          <div className="absolute -top-2 w-2 h-2 rounded-full bg-txt border border-base"
            style={{ left: `calc(${data.risk_score}% - 4px)` }} title={`Risk ${data.risk_score}/100`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <div><Group title="Indices" rows={data.indices} /><Group title="FX" rows={data.fx} /></div>
        <div><Group title="Commodities" rows={data.commodities} /><Group title="Crypto" rows={data.crypto} /></div>
      </div>
    </Panel>
  );
}
