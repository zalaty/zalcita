// Radios de borde del sistema. `lg` es el de las tarjetas — más redondeado
// que el 8 suelto que se usa hoy en varias pantallas, para el look de
// "tarjetas suaves" de la nueva dirección visual.
export const radii = {
  sm: 6, // chips, elementos pequeños
  md: 10, // botones, inputs
  lg: 16, // tarjetas
  pill: 999, // totalmente redondeado (badges, avatares)
} as const;
