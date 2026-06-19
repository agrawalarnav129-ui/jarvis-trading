import { ReactNode } from "react";

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="label text-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={`card p-3.5 ${className}`}>{children}</div>;
}

/**
 * Intelligence-terminal panel (WorldMonitor-style): a bordered surface with an
 * uppercase header bar, a status dot, optional right-aligned meta, and a tight
 * body. The building block for the situational-awareness dashboard.
 */
export function Panel({
  title, status = "normal", meta, right, onClick, className = "", bodyClass = "p-3", children,
}: {
  title: string;
  status?: "normal" | "up" | "down" | "warn" | "info" | "muted";
  meta?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  className?: string;
  bodyClass?: string;
  children: ReactNode;
}) {
  const dot: Record<string, string> = {
    normal: "bg-brand", up: "bg-up", down: "bg-down", warn: "bg-gold", info: "bg-brandbright", muted: "bg-faint",
  };
  return (
    <div onClick={onClick}
      className={`card overflow-hidden flex flex-col ${onClick ? "card-hover cursor-pointer" : ""} ${className}`}>
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line/80 bg-elevated/40">
        <span className={`w-1.5 h-1.5 rounded-full ${dot[status]} shrink-0`} style={{ boxShadow: "0 0 6px currentColor" }} />
        <span className="label text-muted truncate">{title}</span>
        {meta && <span className="ml-auto font-mono text-[0.55rem] text-faint">{meta}</span>}
        {right && <span className={meta ? "" : "ml-auto"}>{right}</span>}
      </div>
      <div className={`flex-1 ${bodyClass}`}>{children}</div>
    </div>
  );
}

export function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="card animate-pulse" style={{ height: h }} />;
}

export function Empty({ msg }: { msg: string }) {
  return <div className="font-mono text-[0.7rem] text-faint p-3">{msg}</div>;
}

export function Stat({ label, value, color = "text-txt" }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`font-display text-lg mt-1 ${color}`}>{value}</div>
    </div>
  );
}
