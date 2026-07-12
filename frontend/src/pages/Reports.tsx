import { useState } from "react";
import { FileText, Loader2, Send, CheckCircle2, Scale } from "lucide-react";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { Section, Card, Empty, Skeleton } from "../components/ui";

const gradeColor: Record<string, string> = { A: "text-up", B: "text-gold", C: "text-faint" };

function SignalHonesty() {
  const { data, loading } = useFetch(() => api.signalHonesty(), []);
  if (loading) return <Skeleton h={180} />;
  if (!data?.available) return <Empty msg={data?.note || "Signal honesty needs picks history — it accrues daily."} />;
  const maxAbs = Math.max(...data.grades.flatMap((g) => data.horizons.map((h) => Math.abs(g[`avg_${h}d`] ?? 0))), 0.1);
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="label">Forward returns of AXIOM's own picks · {data.picks} picks over {data.days} days ({data.from} → {data.to})</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.horizons.map((h) => (
          <div key={h}>
            <div className="label mb-1.5">+{h} trading days</div>
            {data.grades.map((g) => {
              const avg = g[`avg_${h}d`]; const n = g[`n_${h}d`]; const win = g[`win_${h}d`];
              if (avg == null || !n) return null;
              return (
                <div key={g.grade} className="flex items-center gap-2 py-1">
                  <span className={`w-5 font-mono text-xs font-bold ${gradeColor[g.grade] ?? "text-faint"}`}>{g.grade}</span>
                  <div className="flex-1 h-2.5 bg-base rounded overflow-hidden flex">
                    <div className="h-full" style={{ width: `${Math.min(100, (Math.abs(avg) / maxAbs) * 100)}%`, background: avg >= 0 ? "rgb(var(--c-up))" : "rgb(var(--c-down))", opacity: 0.75 }} />
                  </div>
                  <span className={`w-14 text-right font-mono text-xs ${avg >= 0 ? "text-up" : "text-down"}`}>{avg >= 0 ? "+" : ""}{avg}%</span>
                  <span className="w-16 text-right font-mono text-[0.58rem] text-faint">{win}% win · {n}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="text-[0.58rem] font-mono text-faint mt-3">Avg simple return after the pick date (next-day-or-later close entry). History grows daily — treat small sample sizes with care.</div>
    </Card>
  );
}

export default function Reports() {
  const [briefing, setBriefing] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true); setErr(null); setSent(false);
    try {
      const r = await api.briefing();
      setBriefing(r.briefing); setDate(r.date);
    } catch { setErr("Briefing unavailable (the engine fetches cross-asset data; needs GROQ_API_KEY)."); }
    finally { setLoading(false); }
  };

  const send = async () => {
    if (!briefing) return;
    setSending(true); setErr(null);
    try { await api.sendBriefing(briefing); setSent(true); }
    catch { setErr("Telegram send failed — check TELEGRAM_* config on the backend."); }
    finally { setSending(false); }
  };

  return (
    <Section title="Reports · Morning Briefing" right={
      <button onClick={generate} disabled={loading}
        className="flex items-center gap-1.5 rounded-lg bg-brand/15 border border-brand/40 px-3.5 py-1.5 text-xs text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}{loading ? "Generating…" : "Generate Briefing"}
      </button>
    }>
      {err && <Card className="mb-3"><div className="text-down text-xs font-mono">{err}</div></Card>}
      {!briefing && !loading && !err && <Empty msg="Generate today's institutional cross-asset briefing — then push the PDF to Telegram." />}
      {loading && <div className="flex items-center gap-2 text-muted text-sm font-mono py-10 justify-center"><Loader2 size={16} className="animate-spin" /> AXIOM writing briefing…</div>}

      {briefing && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="label">Generated · {date}</span>
            <button onClick={send} disabled={sending || sent}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors border disabled:opacity-60 ${sent ? "bg-up/15 border-up/40 text-up" : "bg-brand/15 border-brand/40 text-brand hover:bg-brand/25"}`}>
              {sent ? <CheckCircle2 size={14} /> : sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sent ? "Sent to Telegram" : sending ? "Sending…" : "Send PDF to Telegram"}
            </button>
          </div>
          <Card>
            <pre className="whitespace-pre-wrap font-sans text-sm text-txt leading-relaxed max-h-[60vh] overflow-y-auto scroll-thin">{briefing}</pre>
          </Card>
        </>
      )}

      <div className="label mt-6 mb-2 flex items-center gap-1.5"><Scale size={12} className="text-brand" /> Signal Honesty · does our A-grade actually work?</div>
      <SignalHonesty />
    </Section>
  );
}
