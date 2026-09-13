// Punto de corte compartido ancho/estrecho. Mismo valor que ya usaba
// NARROW_BREAKPOINT (local, sin exportar) en app/(business)/calendario.tsx
// — se centraliza aquí a partir de la segunda pantalla que lo necesita
// (app/(client)/disponibilidad.tsx), siguiendo la misma regla que el resto
// del sistema: no se extrae hasta que un patrón se repite. Cuando el
// calendario del negocio pase por el rediseño, debería migrar a consumir
// este token en vez de su constante local.
export const breakpoints = {
  narrow: 700,
} as const;
