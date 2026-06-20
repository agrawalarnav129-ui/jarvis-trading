import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Panel, Skeleton, Empty } from "./ui";

// Live-news feed with source tabs (WorldMonitor-style), powered by our RSS.
export default function LiveNews() {
  const { data, loading } = useFetch(() => api.news(), [], 300_000);
  const items = data?.news ?? [];

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((n) => counts.set(n.source, (counts.get(n.source) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [items]);

  const [tab, setTab] = useState<string>("ALL");
  const shown = tab === "ALL" ? items : items.filter((n) => n.source === tab);

  return (
    <Panel title="Live News · Feed" status="down"
      meta={<span className="text-down">● {items.length}</span>} bodyClass="p-0">
      {loading ? <div className="p-3"><Skeleton h={220} /></div> : !items.length ? <Empty msg="News feed unavailable." /> : (
        <>
          <div className="flex gap-1 px-2 py-1.5 overflow-x-auto scroll-thin border-b border-line/60">
            {["ALL", ...sources].map((s) => (
              <button key={s} onClick={() => setTab(s)}
                className={`px-2 py-0.5 rounded text-[0.6rem] font-mono whitespace-nowrap cursor-pointer transition-colors ${tab === s ? "bg-brand/20 text-brand" : "text-faint hover:text-txt"}`}>
                {s}{s === "ALL" ? "" : ""}
              </button>
            ))}
          </div>
          <div className="max-h-[400px] overflow-y-auto scroll-thin px-3">
            {shown.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noreferrer"
                className="block py-2 border-b border-line/50 last:border-0 group cursor-pointer">
                <div className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-down shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[0.78rem] text-txt leading-snug group-hover:text-brandbright transition-colors">{n.title}</div>
                    <div className="label mt-1 flex items-center gap-1 normal-case tracking-normal">
                      <span className="text-faint">{n.source}</span> · {n.published_str}
                      <ExternalLink size={9} className="opacity-50" />
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
