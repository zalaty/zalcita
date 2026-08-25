import { Text, View } from 'react-native';

// TODO: agregados sobre `appointments` + `payments` (status = 'completed'),
// agrupados por semana/mes y por servicio — ver maqueta
// mockup_resumen_financiero. Para el MVP puede calcularse en el cliente con
// una consulta filtrada por rango de fechas; si crece el volumen, mover a
// una vista materializada o función de Postgres.
export default function Resumen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Resumen financiero.</Text>
    </View>
  );
}
