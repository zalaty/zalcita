import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useIsPlatformAdmin } from '@/hooks/useIsPlatformAdmin';
import { useTheme, useThemePreference, type ThemePreference } from '@/context/ThemeContext';
import { Button, Screen } from '@/components/ui';

// TODO: añadir más secciones aquí conforme se construyan: Stripe — cada
// una como su propia pantalla dentro de esta carpeta, enlazada desde
// aquí, mismo patrón que "servicios"/"horarios".
const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

export default function AjustesMenu() {
  const theme = useTheme();
  const router = useRouter();
  const { isAdmin } = useIsPlatformAdmin();
  const { preference, setPreference } = useThemePreference();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    // No basta con dejar que (business)/_layout.tsx reaccione a session=null
    // (sí lo hace, redirige a /login) — se navega explícito a "/" para que
    // el índice raíz decida de forma uniforme, mismo mecanismo que ya usan
    // login.tsx/registro-negocio.tsx tras resolver sesión.
    router.replace('/');
  }

  // useTheme() solo puede llamarse dentro de un componente, así que esta
  // fila-chip (antes constante a nivel de módulo) pasa a calcularse aquí.
  const menuRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.sm,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
          Ajustes
        </Text>

        <Pressable onPress={() => router.push('/(business)/ajustes/datos')} style={menuRowStyle}>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>Datos del negocio</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.lg }}>›</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(business)/ajustes/servicios')} style={menuRowStyle}>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>Servicios</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.lg }}>›</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(business)/ajustes/horarios')} style={menuRowStyle}>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>Horarios</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.lg }}>›</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(business)/ajustes/politicas')} style={menuRowStyle}>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>
            Políticas de cancelación y pago
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.lg }}>›</Text>
        </Pressable>
        {/* Solo visible para quien tenga fila en platform_admins — ver
            hooks/useIsPlatformAdmin.ts. Es solo un atajo: la pantalla en sí
            está protegida en app/admin/_layout.tsx pase lo que pase aquí. */}
        {isAdmin && (
          <Pressable onPress={() => router.push('/admin')} style={menuRowStyle}>
            <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>
              Administración de plataforma
            </Text>
            <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes.lg }}>›</Text>
          </Pressable>
        )}

        {/* Preferencia de tema — solo en el panel de negocio, el cliente
            sigue siempre el esquema del sistema. Mismo mecanismo que el
            selector de /theme-preview (useThemePreference): setPreference
            se aplica al instante a TODA la app (ya es reactivo) y queda
            persistido en AsyncStorage por el propio hook. El activo se
            distingue por relleno (no solo por tono), mismo lenguaje visual
            que el selector Día/Semana/Mes del calendario. */}
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>Apariencia</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {THEME_OPTIONS.map((opt) => {
              const selected = preference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPreference(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...theme.textStyles.small,
                      fontWeight: selected ? theme.fontWeights.semibold : theme.fontWeights.regular,
                      color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sección separada al final, sin mezclarse con las demás filas de
            navegación — cerrar sesión no es destructivo (se puede volver a
            entrar sin más), así que va en variant="secondary" como el resto
            de acciones reversibles de la app, no en danger (ese tono se
            reserva para lo irreversible: cancelar, desactivar...). Pide
            confirmación igualmente porque interrumpe el trabajo en curso. */}
        <View
          style={{
            gap: theme.spacing.sm,
            marginTop: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
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
        </View>
      </ScrollView>
    </Screen>
  );
}
