import { ReactNode, useEffect, useRef, useState } from "react";

/**
 * Defers rendering (and therefore the data-fetching) of its children until they
 * scroll near the viewport. Cuts the flood of concurrent API calls on the
 * dashboard so the free-tier backend isn't hammered all at once on load.
 * A placeholder of the given height reserves space to avoid layout shift.
 */
export default function Lazy({ minHeight = 120, children, className = "" }: { minHeight?: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    // Reveal when within ~350px of the viewport. IntersectionObserver is the
    // fast path; a scroll/resize listener is a fallback so it always reveals.
    const near = () => el.getBoundingClientRect().top < window.innerHeight + 350;
    let io: IntersectionObserver | null = null;
    const reveal = () => { setShow(true); cleanup(); };
    const check = () => { if (near()) reveal(); };
    function cleanup() {
      io?.disconnect();
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    }
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((e) => { if (e[0].isIntersecting) reveal(); }, { rootMargin: "350px 0px" });
      io.observe(el);
    }
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    if (near()) reveal();   // already in view on mount
    return cleanup;
  }, [show]);

  return (
    <div ref={ref} className={className}>
      {show ? children : <div className="card animate-pulse" style={{ minHeight }} />}
    </div>
  );
}
