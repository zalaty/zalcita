import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Role = 'business' | 'client' | null;

interface AuthContextValue {
  session: Session | null;
  role: Role;
  loading: boolean;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  role: null,
  loading: true,
  refreshRole: async () => {},
});

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

    if (data) {
      setRole('business');
      setLoading(false);
      return;
    }

    // Sin ficha de negocio todavía: si trae business_name en los metadatos
    // (adjuntados por app/(auth)/registro-negocio.tsx al hacer signUp),
    // acaba de confirmar su email y toca crear su negocio ahora.
    // create_business_with_owner es idempotente (ver
    // supabase/migrations/0004_business_signup.sql), así que llamarla de
    // más — dos pestañas resolviendo el rol a la vez, por ejemplo — nunca
    // duplica nada.
    if (current.user.user_metadata?.business_name) {
      const { error: rpcError } = await supabase.rpc('create_business_with_owner');
      if (rpcError) {
        console.warn('No se pudo crear el negocio pendiente:', rpcError.message);
        setRole('client');
        setLoading(false);
        return;
      }
      setRole('business');
      setLoading(false);
      return;
    }

    setRole('client');
    setLoading(false);
  }

  async function refreshRole() {
    const { data } = await supabase.auth.getSession();
    await resolveRole(data.session);
  }

  return (
    <AuthContext.Provider value={{ session, role, loading, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
