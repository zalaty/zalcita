import { Text, View } from 'react-native';
import { theme as staticTheme, type Theme } from '@/theme';
import { useTheme } from '@/context/ThemeContext';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps {
  // Obligatoria a propósito, no opcional: es el mecanismo que garantiza,
  // a nivel de tipos, el cumplimiento de WCAG 1.4.1 "Uso del color" — no
  // se puede compilar un <Badge> que muestre un estado solo por color.
  // Ver theme/colors.ts para la nota completa de cumplimiento 1.4.1/1.4.3.
  label: string;
  tone?: BadgeTone;
}

// Función pura (recibe el theme, no lo importa) — así puede llamarse en
// render con el theme REACTIVO de useTheme() (ver <Badge> más abajo) y
// también en frío, a nivel de módulo, para BADGE_TONE_STYLES.
function badgeToneStyles(t: Theme): Record<BadgeTone, { bg: string; text: string }> {
  return {
    primary: { bg: t.colors.primarySurface, text: t.colors.primary },
    success: { bg: t.colors.successSurface, text: t.colors.success },
    warning: { bg: t.colors.warningSurface, text: t.colors.warning },
    danger: { bg: t.colors.dangerSurface, text: t.colors.danger },
    info: { bg: t.colors.infoSurface, text: t.colors.info },
    neutral: { bg: t.colors.disabledBg, text: t.colors.textSecondary },
  };
}

// Exportada para que otras superficies del sistema (p.ej. los bloques de cita
// del calendario) reutilicen EXACTAMENTE los mismos pares fondo/texto ya
// verificados AA, en vez de redefinirlos. OJO (modo oscuro, subpaso 2b):
// esta constante sigue construida desde el theme ESTÁTICO a propósito —
// calendario.tsx todavía consume `import { theme } from '@/theme'` (no
// migra en esta tanda) y necesita un valor calculable a nivel de módulo, no
// un hook. <Badge> ya NO la usa: calcula su propio mapeo en cada render con
// badgeToneStyles(useTheme()), más abajo. Cuando calendario.tsx migre,
// debería llamar a badgeToneStyles() con su propio theme reactivo en vez de
// importar esta constante, y esta constante podría desaparecer.
export const BADGE_TONE_STYLES = badgeToneStyles(staticTheme);

// Pastilla de estado — se usa SIEMPRE con su `label` de texto, nunca solo
// color: es la regla de accesibilidad del sistema para daltonismo (ver
// theme/colors.ts). No añadir un uso de Badge sin texto legible dentro.
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const theme = useTheme();
  const toneStyle = badgeToneStyles(theme)[tone];
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
