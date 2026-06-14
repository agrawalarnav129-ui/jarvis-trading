import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../lib/api";

type Sym = { symbol: string; name: string; sector: string };
let _cache: Sym[] | null = null;

async function getSymbols(): Promise<Sym[]> {
  if (_cache) return _cache;
  try { _cache = (await api.symbols()).symbols; } catch { _cache = []; }
  return _cache;
}

/** Fuzzy symbol search with keyboard nav. onPick gets the yfinance symbol. */
export default function SymbolSearch({ value, onPick, autoFocus }: { value?: string; onPick: (symbol: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Sym[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => { getSymbols().then(setAll); }, []);
  useEffect(() => { if (autoFocus) inp.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const ql = q.trim().toUpperCase();
  const matches = !ql ? [] : all
    .map((s) => {
      const sym = s.symbol.replace(".NS", ""), name = s.name.toUpperCase();
      let score = 0;
      if (sym === ql) score = 100; else if (sym.startsWith(ql)) score = 80;
      else if (sym.includes(ql)) score = 50; else if (name.includes(ql)) score = 30;
      return { s, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const pick = (s: Sym) => { onPick(s.symbol); setQ(""); setOpen(false); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open || !matches.length) { if (e.key === "Enter" && ql) { onPick(ql.endsWith(".NS") ? ql : `${ql}.NS`); setQ(""); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(matches[hi].s); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-1 bg-base border border-line rounded px-2 py-1 focus-within:border-brand/60">
        <Search size={11} className="text-faint" />
        <input ref={inp} value={q} placeholder={value ? value.replace(".NS", "") : "Search…"}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onKeyDown={onKey} onFocus={() => setOpen(true)}
          className="w-24 bg-transparent text-xs font-mono text-txt outline-none placeholder:text-faint/60" />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-30 mt-1 w-60 max-h-72 overflow-auto bg-elevated border border-line rounded-lg shadow-xl">
          {matches.map((m, i) => (
            <button key={m.s.symbol} onMouseEnter={() => setHi(i)} onClick={() => pick(m.s)}
              className={`flex flex-col items-start w-full px-2.5 py-1.5 text-left cursor-pointer ${i === hi ? "bg-brand/15" : "hover:bg-base/60"}`}>
              <span className="font-mono text-xs text-txt">{m.s.symbol.replace(".NS", "")}</span>
              <span className="text-[0.58rem] text-faint truncate w-full">{m.s.name}{m.s.sector ? ` · ${m.s.sector}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
