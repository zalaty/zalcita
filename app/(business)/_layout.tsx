import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { BusinessProvider, useBusiness } from '@/context/BusinessContext';

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
      <Tabs screenOptions={{ headerShown: true }}>
        <Tabs.Screen name="calendario" options={{ title: 'Calendario' }} />
        <Tabs.Screen name="clientes" options={{ title: 'Clientes' }} />
        <Tabs.Screen name="resumen" options={{ title: 'Resumen' }} />
        {/* headerShown: false — "ajustes" es ahora una carpeta con su propio
            Stack (ajustes/_layout.tsx), que ya pone su propia cabecera por
            pantalla; si no, saldrían dos cabeceras apiladas. */}
        <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', headerShown: false }} />
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
