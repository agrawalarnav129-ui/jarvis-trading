import { ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";
import { useSymbolNav } from "./SymbolLink";

const DOT: Record<string, string> = { bull: "bg-up", bear: "bg-down", neutral: "bg-faint" };
const TXT: Record<string, string> = { bull: "text-up", bear: "text-down", neutral: "text-faint" };

export default function NewsSentiment() {
  const go = useSymbolNav();
  const { data, loading } = useFetch(() => api.newsSentiment(), [], 600_000);
  if (loading) return <Panel title="Market Sentiment · AI"><Skeleton h={220} /></Panel>;
  if (!data || !data.available) return <Panel title="Market Sentiment · AI" status="muted"><Empty msg="Sentiment unavailable." /></Panel>;

  const m = data.market;
  const tone = m.label === "Bullish" ? "up" : m.label === "Bearish" ? "down" : "warn";
  const toneTxt = m.label === "Bullish" ? "text-up" : m.label === "Bearish" ? "text-down" : "text-gold";
  const total = Math.max(m.bull + m.bear + m.neutral, 1);
  // top tagged stocks by |score|
  const stocks = Object.entries(data.by_symbol).filter(([, v]) => v.label !== "neutral")
    .sort((a, b) => Math.abs(b[1].score) - Math.abs(a[1].score)).slice(0, 10);

  return (
    <Panel title="Market Sentiment · AI" status={tone} meta={<span className={toneTxt}>{m.label} {m.score >= 0 ? "+" : ""}{m.score}</span>} bodyClass="p-3">
      {/* meter */}
      <div className="h-2 rounded overflow-hidden flex mb-1">
        <div className="bg-down/70" style={{ width: `${(m.bear / total) * 100}%` }} />
        <div className="bg-faint/40" style={{ width: `${(m.neutral / total) * 100}%` }} />
        <div className="bg-up/70" style={{ width: `${(m.bull / total) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[0.58rem] font-mono mb-3">
        <span className="text-down">▼ {m.bear} bearish</span>
        <span className="text-faint">{m.neutral} neutral</span>
        <span className="text-up">{m.bull} bullish ▲</span>
      </div>

      {/* tagged stocks */}
      {stocks.length > 0 && (
        <div className="mb-3">
          <div className="label mb-1.5">Stocks in the news</div>
          <div className="flex flex-wrap gap-1.5">
            {stocks.map(([sym, v]) => (
              <button key={sym} onClick={() => go(sym)} title={`${v.n} headline(s)`}
                className={`text-[0.62rem] font-mono px-1.5 py-0.5 rounded border cursor-pointer ${v.label === "bull" ? "text-up border-up/30 bg-up/10" : "text-down border-down/30 bg-down/10"}`}>
                {v.label === "bull" ? "▲" : "▼"} {sym}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* headlines colored by sentiment */}
      <div className="label mb-1.5">Headlines</div>
      <div className="max-h-[260px] overflow-y-auto scroll-thin">
        {data.headlines.slice(0, 30).map((h, i) => (
          <a key={i} href={h.link} target="_blank" rel="noreferrer" className="flex items-start gap-2 py-1.5 border-b border-line/40 last:border-0 group cursor-pointer">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${DOT[h.sentiment]}`} />
            <div className="min-w-0">
              <div className="text-[0.74rem] text-txt leading-snug group-hover:text-brandbright transition-colors">{h.title}</div>
              <div className="label mt-0.5 flex items-center gap-1.5 normal-case tracking-normal">
                <span className={TXT[h.sentiment]}>{h.sentiment}</span>
                <span className="text-faint">· {h.source}</span>
                {h.tickers.slice(0, 3).map((t) => <span key={t} className="text-brand">{t}</span>)}
                <ExternalLink size={8} className="opacity-50" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </Panel>
  );
}
