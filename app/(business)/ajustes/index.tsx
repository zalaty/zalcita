import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsPlatformAdmin } from '@/hooks/useIsPlatformAdmin';
import { theme } from '@/theme';
import { Screen } from '@/components/ui';

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

// TODO: añadir más secciones aquí conforme se construyan: Stripe — cada
// una como su propia pantalla dentro de esta carpeta, enlazada desde
// aquí, mismo patrón que "servicios"/"horarios".
export default function AjustesMenu() {
  const router = useRouter();
  const { isAdmin } = useIsPlatformAdmin();

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
      </ScrollView>
    </Screen>
  );
}
