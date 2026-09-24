import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/theme';

// Mismo patrón que app/(business)/_layout.tsx: contorno inactiva, relleno
// activa, 24px, colores del theme — sin repetir aquí un hex suelto.
const TAB_ICON_SIZE = 24;

function tabIcon(nameOutline: keyof typeof Ionicons.glyphMap, nameFilled: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? nameFilled : nameOutline} size={TAB_ICON_SIZE} color={color} />
  );
}

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
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Reservar', tabBarIcon: tabIcon('calendar-outline', 'calendar') }}
      />
      <Tabs.Screen
        name="mis-citas"
        options={{ title: 'Mis citas', tabBarIcon: tabIcon('list-outline', 'list') }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'Perfil', tabBarIcon: tabIcon('person-outline', 'person') }}
      />
      {/* Pantallas del flujo de reserva: navegables pero no son pestañas. */}
      <Tabs.Screen name="disponibilidad" options={{ title: 'Disponibilidad', href: null }} />
      <Tabs.Screen name="confirmacion" options={{ title: 'Confirmar reserva', href: null }} />
    </Tabs>
  );
}
