import { useState } from "react";
import { createPortal } from "react-dom";
import { User, LogOut, Loader2, X } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function AuthMenu() {
  const { user, enabled, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!enabled) return null; // hide entirely until Supabase is configured

  const submit = async () => {
    setBusy(true); setMsg(null);
    const r = mode === "in" ? await signIn(email, pw) : await signUp(email, pw);
    setBusy(false);
    if (r.error) setMsg(r.error);
    else if (r.info) setMsg(r.info);
    else setOpen(false);
  };

  if (user) {
    return (
      <button onClick={() => signOut()} title={user.email ?? "Sign out"}
        className="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[0.65rem] font-mono text-muted hover:text-txt cursor-pointer transition-colors">
        <User size={13} className="text-brand" />
        <span className="hidden sm:inline max-w-[90px] truncate">{user.email}</span>
        <LogOut size={12} />
      </button>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="rounded-lg border border-brand/40 bg-brand/15 px-3 py-1.5 text-[0.68rem] font-medium text-brand cursor-pointer hover:bg-brand/25 transition-colors">
        Sign in
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="card p-5 w-full max-w-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base text-txt">{mode === "in" ? "Sign in" : "Create account"}</h2>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-txt cursor-pointer"><X size={16} /></button>
            </div>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email"
              className="w-full mb-2 bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60" />
            <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="password" type="password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full mb-3 bg-base border border-line rounded-lg px-3 py-2 text-sm text-txt outline-none focus:border-brand/60" />
            <button onClick={submit} disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand/15 border border-brand/40 px-4 py-2 text-sm text-brand font-medium cursor-pointer hover:bg-brand/25 transition-colors disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />}{mode === "in" ? "Sign in" : "Sign up"}
            </button>
            {msg && <div className="text-[0.7rem] font-mono text-gold mt-2">{msg}</div>}
            <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
              className="w-full text-center text-[0.66rem] text-faint hover:text-brand mt-3 cursor-pointer transition-colors">
              {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
