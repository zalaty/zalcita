// Anchos máximos de contenido en pantalla ancha: en escritorio el contenido
// queda centrado en vez de estirarse de lado a lado; en móvil (por debajo
// del ancho) ocupa el 100% — basta con `maxWidth` + `alignSelf: 'center'`,
// no hace falta lógica de breakpoint para esto.
//
// Dos valores, para dos tipos de pantalla bien distintos:
//   - contentMaxWidth (680): lado CLIENTE — pantallas de un solo vistazo
//     (elegir servicio, reservar, confirmar). Empezó como constante local
//     duplicada en cada pantalla (disponibilidad.tsx); se centralizó aquí
//     en cuanto una tercera pantalla lo necesitó, mismo criterio que
//     theme/breakpoints.ts.
//   - panelMaxWidth (880): lado NEGOCIO — pantallas de Ajustes, que son
//     formularios y listas de trabajo, no una página de reserva puntual.
//     Más generoso que contentMaxWidth (un formulario necesita más aire
//     que una tarjeta de servicio), pero sigue acotado — un input de
//     1900px de ancho se usa fatal. El ancho COMPLETO (sin límite) queda
//     para el calendario y las tablas de clientes (tandas posteriores),
//     no para estos formularios.
export const layout = {
  contentMaxWidth: 680,
  panelMaxWidth: 880,
} as const;
