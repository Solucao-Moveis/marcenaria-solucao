import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Papel } from "@/lib/marcenaria";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** tem profile no schema marcenaria (ou é o master) */
  acesso: boolean;
  papel: Papel | null;
  /** admin ou líder: opera o cronômetro, cadastra e corrige */
  canEdit: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

// SMERP SSO: se o ERP abriu este app com a sessão no hash (#smerp_sso&at=&rt=),
// adota essa sessão e limpa a URL. Assim a pessoa entra sem logar de novo.
async function consumeSmerpSso() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || hash.indexOf("smerp_sso") === -1) return;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("at");
  const refresh_token = params.get("rt");
  if (access_token && refresh_token) {
    try {
      await supabase.auth.setSession({ access_token, refresh_token });
    } catch (e) {
      console.error("[SMERP SSO]", e);
    }
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [acesso, setAcesso] = useState(false);
  const [papel, setPapel] = useState<Papel | null>(null);

  const loadAcesso = async (uid: string | undefined) => {
    if (!uid) {
      setAcesso(false);
      setPapel(null);
      return;
    }
    const { data, error } = await supabase.rpc("meu_acesso");
    if (error) {
      console.error("[meu_acesso]", error);
      setAcesso(false);
      setPapel(null);
      return;
    }
    const r = (data ?? {}) as { acesso?: boolean; papel?: Papel | null };
    setAcesso(Boolean(r.acesso));
    setPapel(r.papel ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // defer to avoid deadlock
      setTimeout(() => {
        void loadAcesso(s?.user?.id);
      }, 0);
    });
    (async () => {
      await consumeSmerpSso();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      void loadAcesso(data.session?.user?.id).finally(() => setLoading(false));
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    await loadAcesso(user?.id);
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const canEdit = papel === "admin" || papel === "lider";

  return (
    <AuthContext.Provider value={{ session, user, loading, acesso, papel, canEdit, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
