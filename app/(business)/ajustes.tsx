import { Text, View } from 'react-native';

// TODO: sub-secciones para servicios (CRUD sobre `services`), horarios
// (`working_hours` + `schedule_exceptions`), políticas de cancelación y pago
// (`cancellation_policies` + campos de `businesses`), y conectar Stripe.
// Ver maquetas mockup_servicios y mockup_politicas_negocio, y el flujo de
// onboarding en pantallas-flujos.md sección 3.
export default function Ajustes() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Servicios, horarios y políticas del negocio.</Text>
    </View>
  );
}
