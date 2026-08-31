import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Business } from '@/types/database';

interface BusinessContextValue {
  business: Business | null;
  loading: boolean;
  refreshBusiness: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue>({
  business: null,
  loading: true,
  refreshBusiness: async () => {},
});

// Carga el negocio del dueño/staff actual (vía business_members ->
// businesses) una vez, para que todas las pantallas del panel lo consulten
// con useBusiness() sin recargarlo cada una. Vive fuera de AuthContext a
// propósito: AuthContext resuelve quién eres y qué rol tienes (lo usa
// también el flujo cliente), esto es un dato específico del panel de
// negocio que solo hace falta cargar una vez dentro de él.
export function BusinessProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) {
      setBusiness(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: memberData, error: memberError } = await supabase
      .from('business_members')
      .select('business_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    if (memberError || !memberData) {
      if (memberError) console.warn('No se pudo resolver el negocio del usuario:', memberError.message);
      setBusiness(null);
      setLoading(false);
      return;
    }

    // Fila completa: es el propio negocio del dueño/staff, no hace falta
    // minimizar columnas como en las pantallas de cliente.
    const { data: businessData, error: businessError } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', memberData.business_id)
      .single();

    if (businessError || !businessData) {
      if (businessError) console.warn('No se pudo cargar el negocio:', businessError.message);
      setBusiness(null);
      setLoading(false);
      return;
    }

    setBusiness(businessData);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <BusinessContext.Provider value={{ business, loading, refreshBusiness: load }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
