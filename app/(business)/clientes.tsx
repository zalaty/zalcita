import { Text, View } from 'react-native';
import { useBusiness } from '@/context/BusinessContext';

// TODO: buscador con autocompletado sobre `clients` filtrando por
// business_id (RLS ya lo aísla). Cada fila lleva a
// app/(business)/cliente/[id].tsx con la ficha completa: histórico,
// total gastado, próxima cita, notas — ver maqueta mockup_ficha_cliente.
export default function Clientes() {
  const { business } = useBusiness();

  if (business && !business.active) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ textAlign: 'center' }}>
          El listado de clientes estará disponible cuando tu negocio esté aprobado.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Listado de clientes del negocio.</Text>
    </View>
  );
}
