import { Stack } from 'expo-router';

export default function AjustesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Ajustes' }} />
      <Stack.Screen name="servicios" options={{ title: 'Servicios' }} />
      <Stack.Screen name="horarios" options={{ title: 'Horarios' }} />
    </Stack>
  );
}
