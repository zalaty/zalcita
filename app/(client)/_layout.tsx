import { Tabs } from 'expo-router';
import { theme } from '@/theme';

// Tabs de la app cliente. El acceso a "index" (disponibilidad) no requiere
// login; "mis-citas" y "perfil" sí — si no hay sesión, esas pantallas deben
// redirigir a (auth)/login (se implementa dentro de cada pantalla, cuando
// se construya la lógica real de reserva).
export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{
        // El título de cada pantalla se pinta dentro de la columna
        // centrada (ver Screen) — index/disponibilidad ya muestran la
        // identidad del negocio ahí mismo, mis-citas/perfil pintan su
        // propio título. La cabecera nativa ya no hace falta.
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Reservar' }} />
      <Tabs.Screen name="mis-citas" options={{ title: 'Mis citas' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
      {/* Pantallas del flujo de reserva: navegables pero no son pestañas. */}
      <Tabs.Screen name="disponibilidad" options={{ title: 'Disponibilidad', href: null }} />
      <Tabs.Screen name="confirmacion" options={{ title: 'Confirmar reserva', href: null }} />
    </Tabs>
  );
}
