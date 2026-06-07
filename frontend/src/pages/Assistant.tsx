import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Section, Card } from "../components/ui";
import { api } from "../lib/api";

export default function Assistant() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "user" | "axiom"; text: string }[]>([
    { role: "axiom", text: "AXIOM online. Ask for a market read, a stock analysis, or a briefing." },
  ]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: "user", text }, { role: "axiom", text: "" }]);
    setInput("");
    setBusy(true);
    try {
      let acc = "";
      await api.assistantStream(text, history, (tok) => {
        acc += tok;
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "axiom", text: acc }; return c; });
      });
      if (!acc) throw new Error("empty");
    } catch {
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "axiom", text: "I couldn't reach the AI backend. Ensure the API is running and GROQ_API_KEY is set." }; return c; });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="AXIOM AI Assistant">
      <Card className="min-h-[55vh] flex flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto scroll-thin mb-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-brand/15 border border-brand/30 text-txt" : "bg-elevated border border-line text-muted"}`}>
                {m.role === "axiom" && <Sparkles size={12} className="inline mr-1.5 text-brand" />}
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask AXIOM…" aria-label="Message AXIOM" disabled={busy}
            className="flex-1 bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt placeholder:text-faint outline-none focus:border-brand/60 transition-colors disabled:opacity-60" />
          <button onClick={send} aria-label="Send" disabled={busy}
            className="rounded-lg bg-brand/15 border border-brand/40 px-3.5 text-brand cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </Card>
    </Section>
  );
}
