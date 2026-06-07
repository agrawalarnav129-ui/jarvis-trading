import { useEffect, useState } from "react";
import { Plus, Trash2, Star, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty } from "../components/ui";
import { useSymbolNav } from "../components/SymbolLink";
import { listWatch, addWatch, removeWatch } from "../lib/watchlist";
import { fmt, signColor, arrow } from "../lib/format";

interface Quote { symbol: string; ltp: number; change: number; pct: number; }

export default function Watchlist() {
  const go = useSymbolNav();
  const [syms, setSyms] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const screener = useFetch(() => api.watchlist(), []);

  const refreshQuotes = async (list: string[]) => {
    if (!list.length) { setQuotes({}); return; }
    try {
      const { quotes } = await api.quote(list);
      const map: Record<string, Quote> = {};
      quotes.forEach((q) => (map[q.symbol] = q));
      setQuotes(map);
    } catch { /* keep stale */ }
  };

  const load = async () => {
    const list = await listWatch();
    setSyms(list); setLoading(false);
    refreshQuotes(list);
  };
  useEffect(() => { load(); }, []);

  const add = async (s: string) => {
    const clean = s.replace(".NS", "").toUpperCase().trim();
    if (!clean || syms.includes(clean)) return;
    await addWatch(clean); setInput("");
    const list = [clean, ...syms]; setSyms(list); refreshQuotes(list);
  };
  const remove = async (s: string) => {
    await removeWatch(s);
    setSyms(syms.filter((x) => x !== s));
  };

  const picks: string[] = (screener.data?.watchlist ?? [])
    .map((r: any) => String(r.symbol).replace(".NS", ""))
    .filter((s: string) => !syms.includes(s));

  return (
    <Section title="My Watchlist">
      {/* Add bar */}
      <div className="flex gap-2 mb-3">
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && add(input)}
          placeholder="Add symbol (e.g. RELIANCE)" aria-label="Add symbol"
          className="flex-1 bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt font-mono outline-none focus:border-brand/60" />
        <button onClick={() => add(input)} aria-label="Add"
          className="rounded-lg bg-brand/15 border border-brand/40 px-3.5 text-brand cursor-pointer hover:bg-brand/25 transition-colors flex items-center"><Plus size={16} /></button>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-faint" /></div> : !syms.length ? (
        <Empty msg="Your watchlist is empty — add a symbol above or tap a screener pick below." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mb-5">
          {syms.map((s) => {
            const q = quotes[s];
            return (
              <Card key={s} className="flex items-center justify-between group">
                <button onClick={() => go(s)} className="flex-1 text-left cursor-pointer">
                  <div className="font-mono text-sm text-txt group-hover:text-brand transition-colors">{s}</div>
                  {q ? <div className={`font-mono text-[0.7rem] mt-0.5 ${signColor(q.pct)}`}>₹{fmt(q.ltp)} · {arrow(q.pct)} {q.pct >= 0 ? "+" : ""}{fmt(q.pct)}%</div>
                     : <div className="label mt-0.5">—</div>}
                </button>
                <button onClick={() => remove(s)} aria-label="Remove"
                  className="text-faint hover:text-down cursor-pointer transition-colors ml-2"><Trash2 size={14} /></button>
              </Card>
            );
          })}
        </div>
      )}

      {/* Screener picks to add quickly */}
      {picks.length > 0 && (
        <>
          <div className="label mb-2 flex items-center gap-1.5"><Star size={12} className="text-gold" /> Add from Screener Picks (Grade A/B)</div>
          <div className="flex flex-wrap gap-2">
            {picks.slice(0, 18).map((s) => (
              <button key={s} onClick={() => add(s)}
                className="pill border border-line bg-elevated text-muted hover:text-brand hover:border-brand/40 cursor-pointer transition-colors">
                <Plus size={10} /> {s}
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
