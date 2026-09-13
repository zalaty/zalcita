// Ancho máximo del contenido en pantalla ancha (~600-720px): en escritorio
// el contenido queda centrado en vez de estirarse de lado a lado; en móvil
// (por debajo de este ancho) ocupa el 100% — basta con `maxWidth` +
// `alignSelf: 'center'`, no hace falta lógica de breakpoint para esto.
// Un solo valor compartido: antes vivía como constante local duplicada en
// cada pantalla del cliente (empezó en disponibilidad.tsx); se centraliza
// aquí en cuanto una tercera pantalla lo necesitó, mismo criterio que
// theme/breakpoints.ts.
export const layout = {
  contentMaxWidth: 680,
} as const;
