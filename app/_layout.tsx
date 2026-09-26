import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Mecanismo reactivo de theming (modo oscuro, paso 2) — hoy sirve
          siempre el theme claro (no existe darkColors todavía). Ninguna
          pantalla lo consume aún: siguen con `import { theme } from
          '@/theme'`, sin cambios. */}
      <ThemeProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(client)" />
            <Stack.Screen name="(business)" />
            <Stack.Screen name="admin" />
          </Stack>
          <StatusBar style="auto" />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
