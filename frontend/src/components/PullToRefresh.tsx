import { ReactNode, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Mobile pull-to-refresh. When the page is scrolled to the top and the user
 * drags down past a threshold, calls onRefresh. Inert on desktop/mouse.
 */
export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => void; children: ReactNode }) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const THRESHOLD = 70;

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) startY.current = e.touches[0].clientY;
    else startY.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPull(Math.min(dy * 0.5, 90));
  };
  const onTouchEnd = () => {
    if (pull >= THRESHOLD) onRefresh();
    setPull(0);
    startY.current = null;
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="flex justify-center overflow-hidden transition-[height]" style={{ height: pull }}>
        <RefreshCw size={18} className={`text-brand mt-2 ${pull >= THRESHOLD ? "animate-spin" : ""}`}
          style={{ opacity: Math.min(pull / THRESHOLD, 1), transform: `rotate(${pull * 3}deg)` }} />
      </div>
      {children}
    </div>
  );
}
