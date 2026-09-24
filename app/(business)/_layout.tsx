import { ActivityIndicator, Text, View, type ColorValue } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { BusinessProvider, useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';

const TAB_ICON_SIZE = 24;

// Relleno cuando está activa, contorno cuando no — mismo par outline/filled
// para las 4 secciones (Ionicons los trae para las cuatro).
function tabIcon(nameOutline: keyof typeof Ionicons.glyphMap, nameFilled: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? nameFilled : nameOutline} size={TAB_ICON_SIZE} color={color} />
  );
}

// Protegido: solo usuarios con fila en business_members llegan aquí.
// index.tsx ya redirige por rol, pero esta guarda evita acceso directo por URL.
export default function BusinessLayout() {
  const { session, role, loading } = useAuth();

  if (loading) return null;
  if (!session || role !== 'business') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <BusinessProvider>
      <BusinessPanel />
    </BusinessProvider>
  );
}

// Separado del layout para poder usar useBusiness() (BusinessProvider tiene
// que ser un antecesor). Se espera a que `business` esté resuelto antes de
// pintar nada: así el banner de pendiente (o su ausencia) aparece ya con el
// dato correcto, sin un parpadeo previo mostrando el panel "como aprobado".
function BusinessPanel() {
  const { business, loading } = useBusiness();

  // Solo bloquea con el spinner a pantalla completa en la carga INICIAL
  // (todavía no hay `business` que mostrar). `loading` también se pone a
  // true en cada refreshBusiness() posterior (p.ej. tras guardar en
  // ajustes/datos.tsx o ajustes/politicas.tsx) — si el guard fuera solo
  // `loading`, cada uno de esos refrescos desmontaría este <Tabs> entero
  // (con su Stack anidado de "ajustes" dentro), reseteando la navegación
  // a la pestaña por defecto (Calendario) y borrando cualquier mensaje de
  // "Guardado." a mitad de flujo — confirmado en vivo. Con datos ya
  // cargados, un refresco de fondo no debe hacer desaparecer el panel.
  if (loading && !business) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {business && !business.active && (
        <View
          style={{
            backgroundColor: '#fff3cd',
            padding: 12,
            borderBottomWidth: 1,
            borderColor: '#ffe69c',
          }}
        >
          <Text style={{ fontWeight: '600', color: '#664d03' }}>
            Tu negocio está pendiente de aprobación
          </Text>
          <Text style={{ fontSize: 13, color: '#664d03' }}>
            Puedes ir configurando tus servicios y horarios; aún no puedes recibir reservas.
          </Text>
        </View>
      )}
      {/* headerShown: false por defecto — el rediseño (Fase 2) pinta el
          título dentro de la columna centrada de cada pantalla en vez de
          usar la cabecera nativa (en web queda pegada a la esquina, fuera
          del eje del contenido). calendario/cita ya se han rediseñado
          (tanda del calendario) y pintan su propio título con Screen. */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textSecondary,
        }}
      >
        <Tabs.Screen
          name="calendario"
          options={{ title: 'Calendario', tabBarIcon: tabIcon('calendar-outline', 'calendar') }}
        />
        <Tabs.Screen
          name="clientes"
          options={{ title: 'Clientes', tabBarIcon: tabIcon('people-outline', 'people') }}
        />
        <Tabs.Screen
          name="resumen"
          options={{ title: 'Resumen', tabBarIcon: tabIcon('bar-chart-outline', 'bar-chart') }}
        />
        <Tabs.Screen
          name="ajustes"
          options={{ title: 'Ajustes', tabBarIcon: tabIcon('settings-outline', 'settings') }}
        />
        {/* Pantalla de crear/mover cita: navegable desde calendario.tsx,
            pero no es una pestaña — mismo patrón que disponibilidad/
            confirmacion en (client)/_layout.tsx. */}
        <Tabs.Screen name="cita" options={{ title: 'Cita', href: null }} />
        {/* Ficha de cliente: navegable desde clientes.tsx, tampoco es pestaña. */}
        <Tabs.Screen name="cliente/[id]" options={{ title: 'Cliente', href: null }} />
      </Tabs>
    </View>
  );
}
