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

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-3.5 ${className}`}>{children}</div>;
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
