import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

// TODO: añadir más secciones aquí conforme se construyan: horarios
// (`working_hours` + `schedule_exceptions`), políticas de cancelación y
// pago (`cancellation_policies` + campos de `businesses`), datos del
// negocio, Stripe — cada una como su propia pantalla dentro de esta
// carpeta, enlazada desde aquí, mismo patrón que "servicios".
export default function AjustesMenu() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Pressable
        onPress={() => router.push('/(business)/ajustes/servicios')}
        style={{ paddingVertical: 16, borderBottomWidth: 1, borderColor: '#eee' }}
      >
        <Text style={{ fontSize: 16 }}>Servicios</Text>
      </Pressable>
    </View>
  );
}
