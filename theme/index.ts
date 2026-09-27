import { lightColors } from './colors';
import { fontSizes, fontWeights, textStyles } from './typography';
import { spacing } from './spacing';
import { radii } from './radii';
import { shadows } from './shadows';
import { breakpoints } from './breakpoints';
import { layout } from './layout';

// Objeto único del sistema de diseño — todo consumo real de la app pasa
// por `theme.<categoría>.<token>` (import { theme } from '@/theme'), nunca
// un hex/tamaño suelto. Este export sigue sirviendo SIEMPRE `lightColors`:
// es el theme estático, usado como valor por defecto del Context y por lo
// poco que aún no consume el hook (theme-preview.tsx). La elección
// reactiva claro/oscuro vive en context/ThemeContext.tsx (useTheme()), no
// aquí — un módulo estático no puede reaccionar a un toggle en caliente.
export const theme = {
  colors: lightColors,
  fontSizes,
  fontWeights,
  textStyles,
  spacing,
  radii,
  shadows,
  breakpoints,
  layout,
};

export type Theme = typeof theme;

export { appointmentStatusColors, appointmentStatusTones, darkColors, lightColors } from './colors';
export type { AppointmentStatusTone, ColorTokens } from './colors';
