// Escala de tipografía del sistema. `textStyles` da combinaciones ya
// resueltas (tamaño + peso + interlineado) para no recomponerlas en cada
// pantalla — es lo que se consume normalmente (`theme.textStyles.body`);
// `fontSizes`/`fontWeights` quedan disponibles sueltos para el caso raro
// que necesite mezclarlos de otra forma.

export const fontSizes = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export interface TextStyleToken {
  fontSize: number;
  fontWeight: (typeof fontWeights)[keyof typeof fontWeights];
  lineHeight: number;
}

export const textStyles = {
  heading1: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, lineHeight: 28 }, // títulos de pantalla
  heading2: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, lineHeight: 24 }, // títulos de sección
  body: { fontSize: fontSizes.base, fontWeight: fontWeights.regular, lineHeight: 21 }, // texto por defecto
  bodyMedium: { fontSize: fontSizes.base, fontWeight: fontWeights.semibold, lineHeight: 21 }, // texto enfatizado
  small: { fontSize: fontSizes.sm, fontWeight: fontWeights.regular, lineHeight: 18 }, // texto secundario/meta
  caption: { fontSize: fontSizes.xs, fontWeight: fontWeights.semibold, lineHeight: 14 }, // chips, etiquetas pequeñas
} satisfies Record<string, TextStyleToken>;
