import { Bell, BellOff, Sun, Moon } from "lucide-react";
import Clock from "./Clock";
import AuthMenu from "./AuthMenu";
import { useTheme, toggleTheme } from "../lib/theme";

export default function TopBar({ alertsOn, onToggleAlerts }: { alertsOn?: boolean; onToggleAlerts?: () => void }) {
  const theme = useTheme();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-base/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Arc-reactor mark */}
          <svg width="26" height="26" viewBox="0 0 44 44" fill="none" aria-hidden className="text-brand">
            <circle cx="22" cy="22" r="19" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
            <circle cx="22" cy="22" r="13" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 2" />
            <polygon points="22,12 31,28 13,28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="22" cy="22" r="3" fill="currentColor" />
          </svg>
          <div className="leading-none">
            <div className="logo-glow font-display font-extrabold text-brand tracking-[0.22em] text-base">
              AXIOM
            </div>
            <div className="font-mono text-[0.5rem] text-faint tracking-[0.1em] mt-0.5 hidden sm:block">
              ADVANCED EXPERT INTELLIGENCE · MARKETS
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Clock />
          <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg border border-line bg-elevated text-faint hover:text-brand cursor-pointer transition-colors">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {onToggleAlerts && (
            <button onClick={onToggleAlerts} title={alertsOn ? "Signal alerts on" : "Enable signal alerts"}
              aria-label="Toggle alerts"
              className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${alertsOn ? "border-brand/40 bg-brand/15 text-brand" : "border-line bg-elevated text-faint hover:text-txt"}`}>
              {alertsOn ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          )}
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
