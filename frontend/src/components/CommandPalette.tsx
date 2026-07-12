import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft } from "lucide-react";
import { api } from "../lib/api";
import { ALL } from "../nav";

// Global Ctrl+K command palette: jump to any page or symbol from anywhere.
type Item = { kind: "page" | "symbol"; label: string; sub: string; go: (alt: boolean) => string };
type Sym = { symbol: string; name: string; sector: string };

let _syms: Sym[] | null = null;
async function symbols(): Promise<Sym[]> {
  if (_syms) return _syms;
  try { _syms = (await api.symbols()).symbols; } catch { _syms = []; }
  return _syms;
}

export default function CommandPalette() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [all, setAll] = useState<Sym[]>([]);
  const inp = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); setQ(""); setHi(0); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (open) { symbols().then(setAll); setTimeout(() => inp.current?.focus(), 30); } }, [open]);

  const items: Item[] = useMemo(() => {
    const ql = q.trim().toUpperCase();
    const pages: Item[] = ALL
      .filter((p) => !ql || p.label.toUpperCase().includes(ql))
      .map((p) => ({ kind: "page", label: p.label, sub: p.path, go: () => p.path }));
    if (!ql) return pages.slice(0, 9);
    const syms: Item[] = all
      .map((s) => {
        const sym = s.symbol.replace(".NS", "");
        let score = 0;
        if (sym === ql) score = 100; else if (sym.startsWith(ql)) score = 80;
        else if (sym.includes(ql)) score = 50; else if (s.name.toUpperCase().includes(ql)) score = 30;
        return { s, sym, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map(({ s, sym }) => ({
        kind: "symbol" as const, label: sym, sub: `${s.name}${s.sector ? " · " + s.sector : ""}`,
        go: (alt: boolean) => (alt ? `/terminal/${sym}` : `/stock/${sym}`),
      }));
    return [...syms, ...pages.slice(0, 4)];
  }, [q, all]);

  const pick = (it: Item, alt: boolean) => { setOpen(false); nav(it.go(alt)); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && items[hi]) { e.preventDefault(); pick(items[hi], e.ctrlKey || e.metaKey); }
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[12vh] p-4" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
          <Search size={14} className="text-brand" />
          <input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey}
            placeholder="Jump to symbol or page…"
            className="flex-1 bg-transparent text-sm text-txt outline-none placeholder:text-faint" />
          <span className="text-[0.55rem] font-mono text-faint border border-line rounded px-1 py-0.5">ESC</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto scroll-thin">
          {items.length === 0 && <div className="p-3 text-[0.7rem] font-mono text-faint">No matches.</div>}
          {items.map((it, i) => (
            <button key={`${it.kind}${it.label}`} onMouseEnter={() => setHi(i)} onClick={(e) => pick(it, e.ctrlKey || e.metaKey)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-left cursor-pointer ${i === hi ? "bg-brand/15" : "hover:bg-elevated/60"}`}>
              <span className={`text-[0.55rem] font-mono px-1 py-0.5 rounded border ${it.kind === "symbol" ? "text-brand border-brand/40" : "text-faint border-line"}`}>{it.kind === "symbol" ? "EQ" : "GO"}</span>
              <span className="font-mono text-xs text-txt">{it.label}</span>
              <span className="text-[0.6rem] text-faint truncate flex-1">{it.sub}</span>
              {i === hi && <CornerDownLeft size={11} className="text-faint shrink-0" />}
            </button>
          ))}
        </div>
        <div className="px-3 py-1.5 border-t border-line/60 text-[0.55rem] font-mono text-faint flex gap-3">
          <span>↑↓ navigate</span><span>⏎ open{q ? " chart" : ""}</span>{q && <span>Ctrl+⏎ terminal</span>}
        </div>
      </div>
    </div>,
    document.body
  );
}
