import { Text, View } from 'react-native';

// TODO: vista semana/día con las citas del negocio (Realtime activado sobre
// `appointments` filtrando por business_id, para reflejar al instante una
// reserva hecha desde la app cliente). Tap/clic en un hueco libre abre el
// formulario de reserva manual con autocompletado de cliente — ver flujo 2.2
// en pantallas-flujos.md y la maqueta mockup_dueno_calendario_semana.
export default function Calendario() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Calendario del negocio.</Text>
    </View>
  );
}
