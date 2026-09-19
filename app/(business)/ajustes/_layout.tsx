import { Stack } from 'expo-router';

// headerShown: false — el título de cada pantalla de Ajustes ahora se pinta
// dentro de la columna centrada (ver Screen + el <Text accessibilityRole=
// "header"> al principio de cada archivo), no en la cabecera nativa.
export default function AjustesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Ajustes' }} />
      <Stack.Screen name="servicios" options={{ title: 'Servicios' }} />
      <Stack.Screen name="horarios" options={{ title: 'Horarios' }} />
      <Stack.Screen name="politicas" options={{ title: 'Políticas' }} />
      <Stack.Screen name="datos" options={{ title: 'Datos del negocio' }} />
    </Stack>
  );
}
