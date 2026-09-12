import { ActivityIndicator, Pressable, Text, type GestureResponderEvent, type ViewStyle } from 'react-native';
import { theme } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}

function getTextColor(variant: ButtonVariant, isDisabled: boolean): string {
  if (isDisabled) return theme.colors.disabledText;
  if (variant === 'secondary') return theme.colors.primary;
  return theme.colors.textOnPrimary;
}

// El estado disabled usa un tratamiento neutro compartido por las tres
// variantes a propósito: un botón deshabilitado se lee igual de "inactivo"
// sea cual sea su color de marca, en vez de tener una versión desteñida
// por variante (theme.colors.primaryDisabled queda disponible si algún día
// hace falta un disabled con tinte de marca en un sitio concreto).
function getContainerStyle(variant: ButtonVariant, isDisabled: boolean, pressed: boolean): ViewStyle {
  const base: ViewStyle = {
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (isDisabled) {
    return { ...base, backgroundColor: theme.colors.disabledBg };
  }
  if (variant === 'secondary') {
    return {
      ...base,
      backgroundColor: pressed ? theme.colors.primarySurface : 'transparent',
      borderWidth: 1,
      borderColor: theme.colors.primary,
    };
  }
  if (variant === 'danger') {
    // Sin token "dangerPressed" propio todavía (solo primary lo tiene) —
    // opacidad como respuesta táctil simple mientras el danger se usa poco.
    return { ...base, backgroundColor: theme.colors.danger, opacity: pressed ? 0.85 : 1 };
  }
  return { ...base, backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary };
}

// Botón base del sistema — variantes primario/secundario/peligro, todas
// consumiendo solo tokens de theme/ (nunca un hex suelto).
export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const isDisabled = !!(disabled || loading);
  const textColor = getTextColor(variant, isDisabled);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => getContainerStyle(variant, isDisabled, pressed)}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ ...theme.textStyles.bodyMedium, color: textColor }}>{label}</Text>
      )}
    </Pressable>
  );
}
