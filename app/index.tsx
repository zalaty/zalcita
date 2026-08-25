import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { session, role, loading } = useAuth();
  const { slug } = useLocalSearchParams<{ slug?: string }>();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Si viene un slug en la URL, lo arrastramos a la ruta del cliente para
  // que no se pierda en la redirección (localhost:8081/?slug=demo).
  const clientHref = slug ? `/(client)?slug=${encodeURIComponent(slug)}` : '/(client)';

  if (!session) {
    return <Redirect href={clientHref as any} />;
  }

  if (role === 'business') {
    return <Redirect href="/(business)/calendario" />;
  }

  return <Redirect href={clientHref as any} />;
}