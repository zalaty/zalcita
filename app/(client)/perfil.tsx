import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/context/ThemeContext';
import { Button, Screen } from '@/components/ui';

// TODO: toggle de permisos de notificaciones push, toggle de
// consent_marketing (ver sistema-notificaciones.md sección 5), y la opción
// de "borrar mi cuenta" que dispara la anonimización (is_anonymized = true)
// en vez de un DELETE duro, tal como se explica en modelo-datos.md sección 5.
export default function Perfil() {
  const theme = useTheme();
  const router = useRouter();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <Screen style={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
        Perfil
      </Text>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
          Perfil, notificaciones y privacidad.
        </Text>
      </View>

      {/* Mismo patrón que ajustes/index.tsx (lado negocio): secondary, no
          danger (cerrar sesión no es destructivo), con confirmación porque
          interrumpe lo que el cliente estuviera haciendo. */}
      {confirmingLogout ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
            ¿Seguro que quieres cerrar sesión?
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                label={signingOut ? '…' : 'Sí, cerrar sesión'}
                onPress={handleSignOut}
                disabled={signingOut}
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="No, mantener"
                onPress={() => setConfirmingLogout(false)}
                disabled={signingOut}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      ) : (
        <Button label="Cerrar sesión" onPress={() => setConfirmingLogout(true)} variant="secondary" />
      )}
    </Screen>
  );
}
