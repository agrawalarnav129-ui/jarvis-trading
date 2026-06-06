import { useState } from "react";
import { ListChecks, Loader2, Sun, Moon } from "lucide-react";
import { api } from "../lib/api";
import { Section, Card, Empty } from "../components/ui";

function parseChecklist(text: string): { section: string; items: string[] }[] {
  const out: { section: string; items: string[] }[] = [];
  let cur: { section: string; items: string[] } | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isItem = /^([☐\-•*]|\d+[.)])\s+/.test(line);
    if (!isItem && line.length < 60 && (line === line.toUpperCase() || line.endsWith(":"))) {
      cur = { section: line.replace(/[:]/g, ""), items: [] };
      out.push(cur);
    } else {
      const clean = line.replace(/^([☐\-•*]|\d+[.)])\s+/, "");
      if (!cur) { cur = { section: "Checklist", items: [] }; out.push(cur); }
      cur.items.push(clean);
    }
  }
  return out.filter((s) => s.items.length);
}

export default function Tasks() {
  const [session, setSession] = useState<"pre-market" | "post-market">("pre-market");
  const [groups, setGroups] = useState<{ section: string; items: string[] }[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const gen = async (s: "pre-market" | "post-market") => {
    setSession(s); setLoading(true); setErr(null); setChecked({});
    try { setGroups(parseChecklist((await api.tasks(s)).checklist)); }
    catch { setErr("Checklist generation unavailable (needs GROQ_API_KEY)."); }
    finally { setLoading(false); }
  };

  const Tab = ({ s, label, Icon }: any) => (
    <button onClick={() => gen(s)} disabled={loading}
      className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium cursor-pointer transition-colors border disabled:opacity-50 ${session === s && groups ? "bg-brand/15 border-brand/40 text-brand" : "bg-elevated border-line text-muted hover:text-txt"}`}>
      <Icon size={14} /> {label}
    </button>
  );

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const done = Object.values(checked).filter(Boolean).length;

  return (
    <Section title="Tasks & Checklist" right={
      <div className="flex gap-2">
        <Tab s="pre-market" label="Pre-Market" Icon={Sun} />
        <Tab s="post-market" label="Post-Market" Icon={Moon} />
      </div>
    }>
      {err && <Card><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!groups && !loading && !err && <Empty msg="Generate an AI pre/post-market checklist for today." />}
      {loading && <div className="flex items-center gap-2 text-muted text-sm font-mono py-8 justify-center"><Loader2 size={16} className="animate-spin" /> AXIOM building checklist…</div>}

      {groups && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="label">{session.replace("-", " ")} · {done}/{total} done</span>
            <div className="h-1.5 w-32 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-brand transition-all" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
            </div>
          </div>
          {groups.map((g, gi) => (
            <Card key={gi} className="mb-2.5">
              <div className="label mb-2 flex items-center gap-1.5"><ListChecks size={12} className="text-brand" />{g.section}</div>
              {g.items.map((it, ii) => {
                const key = `${gi}-${ii}`;
                return (
                  <label key={key} className="flex items-start gap-2.5 py-1.5 cursor-pointer group">
                    <input type="checkbox" checked={!!checked[key]} onChange={(e) => setChecked({ ...checked, [key]: e.target.checked })}
                      className="mt-0.5 accent-brand w-4 h-4 cursor-pointer" />
                    <span className={`text-sm transition-colors ${checked[key] ? "text-faint line-through" : "text-txt group-hover:text-brandbright"}`}>{it}</span>
                  </label>
                );
              })}
            </Card>
          ))}
        </>
      )}
    </Section>
  );
}
