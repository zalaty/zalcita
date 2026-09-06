import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

// Sabe si el usuario actual es administrador de la plataforma, reutilizando
// la MISMA función que ya usan las políticas RLS (is_platform_admin(),
// 0006) en vez de re-implementar esa lógica en el cliente — así el enlace
// de ajustes y la guarda de /admin nunca pueden desincronizarse de lo que
// la base de datos realmente permite.
//
// Fail-closed a propósito: si la llamada falla (red, timeout...), isAdmin
// se queda en `false`, su valor inicial — nunca se pone a `true` salvo que
// la RPC responda explícitamente que sí. Ante la duda, se asume que NO es
// admin; como mucho eso oculta el enlace o saca de la pantalla a alguien
// que sí lo era, nunca deja pasar a quien no lo es.
export function useIsPlatformAdmin(): { isAdmin: boolean; loading: boolean } {
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const { data, error } = await supabase.rpc('is_platform_admin');
        if (cancelled) return;
        if (error) {
          console.warn('No se pudo comprobar si el usuario es admin (se asume que no):', error.message);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        setIsAdmin(data === true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.warn('Fallo de red comprobando si el usuario es admin (se asume que no):', err);
        setIsAdmin(false);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, authLoading]);

  return { isAdmin, loading };
}
