import { Stack } from 'expo-router';

export default function AjustesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Ajustes' }} />
      <Stack.Screen name="servicios" options={{ title: 'Servicios' }} />
      <Stack.Screen name="horarios" options={{ title: 'Horarios' }} />
      <Stack.Screen name="politicas" options={{ title: 'Políticas' }} />
      <Stack.Screen name="datos" options={{ title: 'Datos del negocio' }} />
    </Stack>
  );
}
