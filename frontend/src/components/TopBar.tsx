import Clock from "./Clock";
import AuthMenu from "./AuthMenu";

export default function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/85 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Arc-reactor mark */}
          <svg width="26" height="26" viewBox="0 0 44 44" fill="none" aria-hidden>
            <circle cx="22" cy="22" r="19" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="1" />
            <circle cx="22" cy="22" r="13" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 2" />
            <polygon points="22,12 31,28 13,28" fill="none" stroke="#22d3ee" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="22" cy="22" r="3" fill="#22d3ee" />
          </svg>
          <div className="leading-none">
            <div className="font-display font-extrabold text-brand tracking-[0.22em] text-base" style={{ textShadow: "0 0 18px rgba(34,211,238,0.5)" }}>
              AXIOM
            </div>
            <div className="font-mono text-[0.5rem] text-faint tracking-[0.1em] mt-0.5 hidden sm:block">
              ADVANCED EXPERT INTELLIGENCE · MARKETS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock />
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
