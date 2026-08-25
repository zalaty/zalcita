import { Text, View } from 'react-native';

// TODO: toggle de permisos de notificaciones push, toggle de
// consent_marketing (ver sistema-notificaciones.md sección 5), y la opción
// de "borrar mi cuenta" que dispara la anonimización (is_anonymized = true)
// en vez de un DELETE duro, tal como se explica en modelo-datos.md sección 5.
export default function Perfil() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Perfil, notificaciones y privacidad.</Text>
    </View>
  );
}
