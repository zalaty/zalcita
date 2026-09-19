import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/theme';

export interface ScreenProps extends ViewProps {}

// Contenedor base de pantalla — fondo del sistema + hueco para la status
// bar/notch en móvil. Antes esa reserva de espacio la daba gratis la
// cabecera nativa de cada pantalla; al quitarla (headerShown: false, ver
// los _layout.tsx) hay que reservarla a mano, o en móvil el contenido
// arrancaría bajo la barra de estado. NO usar en pantallas que SIGAN
// mostrando su cabecera nativa (hoy: Calendario y Cita) — ahí ya la da el
// header, y sumar esto la duplicaría.
export function Screen({ style, children, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }, style]} {...rest}>
      {children}
    </View>
  );
}
