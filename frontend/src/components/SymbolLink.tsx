import { useNavigate } from "react-router-dom";

/** Tappable symbol → navigates to the Stock Detail page. */
export function useSymbolNav() {
  const nav = useNavigate();
  return (symbol: string) => nav(`/stock/${symbol.replace(".NS", "")}`);
}

export default function SymbolLink({ symbol, className = "" }: { symbol: string; className?: string }) {
  const go = useSymbolNav();
  const clean = symbol.replace(".NS", "");
  return (
    <button onClick={() => go(clean)} className={`cursor-pointer hover:text-brand transition-colors ${className}`}>
      {clean}
    </button>
  );
}
