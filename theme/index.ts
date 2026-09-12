import { lightColors } from './colors';
import { fontSizes, fontWeights, textStyles } from './typography';
import { spacing } from './spacing';
import { radii } from './radii';
import { shadows } from './shadows';

// Objeto único del sistema de diseño — todo consumo real de la app pasa
// por `theme.<categoría>.<token>` (import { theme } from '@/theme'), nunca
// un hex/tamaño suelto. Fase 1: solo paleta clara (`lightColors`); cuando
// se añada modo oscuro, este archivo es el ÚNICO sitio que cambia (elegir
// entre lightColors/darkColors según el esquema del sistema) — ninguna
// pantalla ni componente necesitará tocarse, porque ya consumen `theme`,
// no valores literales.
export const theme = {
  colors: lightColors,
  fontSizes,
  fontWeights,
  textStyles,
  spacing,
  radii,
  shadows,
};

export type Theme = typeof theme;

export { appointmentStatusColors } from './colors';
export type { ColorTokens } from './colors';
