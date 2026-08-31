import { Text, View } from 'react-native';
import { useBusiness } from '@/context/BusinessContext';

// TODO: agregados sobre `appointments` + `payments` (status = 'completed'),
// agrupados por semana/mes y por servicio — ver maqueta
// mockup_resumen_financiero. Para el MVP puede calcularse en el cliente con
// una consulta filtrada por rango de fechas; si crece el volumen, mover a
// una vista materializada o función de Postgres.
export default function Resumen() {
  const { business } = useBusiness();

  if (business && !business.active) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ textAlign: 'center' }}>
          El resumen financiero estará disponible cuando tu negocio esté aprobado.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Resumen financiero.</Text>
    </View>
  );
}
