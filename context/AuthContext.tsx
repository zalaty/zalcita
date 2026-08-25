import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Role = 'business' | 'client' | null;

interface AuthContextValue {
  session: Session | null;
  role: Role;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, role: null, loading: true });

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      resolveRole(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      resolveRole(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Un mismo usuario nunca es a la vez dueño/staff y cliente en este MVP:
  // si aparece en business_members, es el panel de negocio; si no, app cliente.
  async function resolveRole(current: Session | null) {
    if (!current) {
      setRole(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('business_members')
      .select('id')
      .eq('user_id', current.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('No se pudo resolver el rol del usuario:', error.message);
    }
    setRole(data ? 'business' : 'client');
    setLoading(false);
  }

  return (
    <AuthContext.Provider value={{ session, role, loading }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
