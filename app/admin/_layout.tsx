import { ActivityIndicator, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useIsPlatformAdmin } from '@/hooks/useIsPlatformAdmin';

// Zona de administración de plataforma, fuera del panel de negocio a
// propósito (carpeta real, no grupo — así tiene su propia URL /admin en
// vez de compartir espacio de rutas con (business)). Protegida aquí,
// no solo con el enlace oculto en ajustes/index.tsx: quien llegue por URL
// directa sin ser admin se saca antes de pintar nada. La BD (RLS +
// protect_business_active_column) sigue siendo la última línea de
// defensa, pero la pantalla en sí tampoco debe quedar expuesta.
//
// Redirige a "/" en vez de a login: el índice raíz ya sabe mandar a cada
// quien a donde le toca (login si no hay sesión, su panel si la hay) — no
// hace falta duplicar esa lógica aquí.
export default function AdminLayout() {
  const { session, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();

  if (authLoading || adminLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session || !isAdmin) {
    return <Redirect href="/" />;
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Administración' }} />
    </Stack>
  );
}
