import { Text, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

// TODO: si !session, mostrar CTA para hacer login (esta pantalla sí lo exige,
// a diferencia de la disponibilidad). Cuando haya sesión, consultar
// appointments filtrando por client_id (ver RLS: "cliente ve sus propias
// citas" en supabase/migrations/0001_init.sql) y separar en próximas/pasadas
// según start_time. Cada fila lleva a app/(client)/cita/[id].tsx con las
// acciones de modificar/cancelar descritas en pantallas-flujos.md 1.4 y 1.5.
export default function MisCitas() {
  const { session } = useAuth();

  if (!session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Inicia sesión para ver tus citas.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Aquí irán tus próximas y pasadas citas.</Text>
    </View>
  );
}
