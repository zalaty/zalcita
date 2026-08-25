import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

// Protegido: solo usuarios con fila en business_members llegan aquí.
// index.tsx ya redirige por rol, pero esta guarda evita acceso directo por URL.
export default function BusinessLayout() {
  const { session, role, loading } = useAuth();

  if (loading) return null;
  if (!session || role !== 'business') {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="calendario" options={{ title: 'Calendario' }} />
      <Tabs.Screen name="clientes" options={{ title: 'Clientes' }} />
      <Tabs.Screen name="resumen" options={{ title: 'Resumen' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
