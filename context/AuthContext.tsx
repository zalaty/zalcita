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

    // Fix de carrera (login de negocio caía en home de cliente, bien tras
    // refrescar): `loading` solo arrancaba en true en el PRIMER montaje —
    // una sesión nueva llegada aquí (login posterior) dejaba `loading` en
    // false mientras resolveRole todavía no había terminado, así que
    // index.tsx (y cualquier otro consumidor de `loading`) leía un `role`
    // todavía viejo creyendo que ya estaba resuelto. Se resetea `loading` a
    // true SOLO en eventos que pueden cambiar de IDENTIDAD (quién es el
    // usuario) — nunca en TOKEN_REFRESHED (refresco silencioso automático,
    // mismo usuario, cada ~55 min: resetear loading ahí parpadearía un
    // spinner en mitad de una sesión activa, un bug nuevo peor que el que
    // se arregla). Tampoco hace falta re-resolver el rol en absoluto para
    // TOKEN_REFRESHED: el usuario es el mismo, no hay nada que recalcular.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') {
        setLoading(true);
      }

      // USER_UPDATED / INITIAL_SESSION / eventos de MFA: no son un cambio
      // de identidad (mismo usuario), así que no se resetea `loading`
      // (evita el parpadeo) — pero se mantiene el rol sincronizado por si
      // acaso, igual que ya hacía el código antes de este cambio.
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
