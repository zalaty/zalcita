import { Text, View } from 'react-native';

// TODO: buscador con autocompletado sobre `clients` filtrando por
// business_id (RLS ya lo aísla). Cada fila lleva a
// app/(business)/cliente/[id].tsx con la ficha completa: histórico,
// total gastado, próxima cita, notas — ver maqueta mockup_ficha_cliente.
export default function Clientes() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Listado de clientes del negocio.</Text>
    </View>
  );
}
