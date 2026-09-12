import { Text, View } from 'react-native';
import { theme } from '@/theme';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps {
  // Obligatoria a propósito, no opcional: es el mecanismo que garantiza,
  // a nivel de tipos, el cumplimiento de WCAG 1.4.1 "Uso del color" — no
  // se puede compilar un <Badge> que muestre un estado solo por color.
  // Ver theme/colors.ts para la nota completa de cumplimiento 1.4.1/1.4.3.
  label: string;
  tone?: BadgeTone;
}

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string }> = {
  primary: { bg: theme.colors.primarySurface, text: theme.colors.primary },
  success: { bg: theme.colors.successSurface, text: theme.colors.success },
  warning: { bg: theme.colors.warningSurface, text: theme.colors.warning },
  danger: { bg: theme.colors.dangerSurface, text: theme.colors.danger },
  info: { bg: theme.colors.infoSurface, text: theme.colors.info },
  neutral: { bg: theme.colors.disabledBg, text: theme.colors.textSecondary },
};

// Pastilla de estado — se usa SIEMPRE con su `label` de texto, nunca solo
// color: es la regla de accesibilidad del sistema para daltonismo (ver
// theme/colors.ts). No añadir un uso de Badge sin texto legible dentro.
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View
      style={{
        backgroundColor: toneStyle.bg,
        borderRadius: theme.radii.pill,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ ...theme.textStyles.caption, color: toneStyle.text }}>{label}</Text>
    </View>
  );
}
