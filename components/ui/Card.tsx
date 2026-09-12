import { View, type ViewProps } from 'react-native';
import { theme } from '@/theme';

export interface CardProps extends ViewProps {}

// Superficie base del sistema: fondo blanco, radio grande ("tarjetas
// suaves"), sombra sutil. El `style` que se pase se combina (no
// reemplaza) con el de la tarjeta.
export function Card({ style, children, ...rest }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          ...theme.shadows.sm,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
