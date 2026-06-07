import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "./supabase";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  ready: boolean;
  enabled: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; info?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; info?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled || !supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: "Auth not configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };
  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: "Auth not configured" };
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : { info: "Check your email to confirm, then sign in." };
  };
  const signOut = async () => { await supabase?.auth.signOut(); };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, ready, enabled: supabaseEnabled, signIn, signUp, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
