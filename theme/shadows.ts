import { Platform, type ViewStyle } from 'react-native';

// RN reparte la "elevación" en propiedades distintas por plataforma: iOS
// usa shadow*, Android usa elevation (ignora shadow*), y la traducción de
// shadow* a boxShadow en react-native-web no es fiable entre versiones —
// así que aquí se define boxShadow explícito para web en vez de confiar en
// esa traducción automática. `as unknown as ViewStyle` en la rama web es
// deliberado: boxShadow es válido en react-native-web pero no existe en el
// tipo ViewStyle de react-native (pensado para nativo), así que no hay
// forma de tipar esa rama sin este escape.
function makeShadow(opacity: number, blurRadius: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: opacity,
      shadowRadius: blurRadius,
    },
    android: {
      elevation,
    },
    default: {
      boxShadow: `0px ${elevation / 2}px ${blurRadius}px rgba(15, 23, 42, ${opacity})`,
    } as unknown as ViewStyle,
  })!;
}

// Sombra neutra oscura a baja opacidad (no teñida de teal) — una sombra de
// color suele verse sucia; esto da una elevación suave y profesional.
export const shadows = {
  sm: makeShadow(0.06, 4, 2), // chips, elementos pequeños elevados
  md: makeShadow(0.08, 10, 4), // tarjetas (por defecto)
  lg: makeShadow(0.12, 20, 10), // elementos flotantes / modales
};
