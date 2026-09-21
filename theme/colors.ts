import type { AppointmentStatus } from '@/types/database';

// Paleta de color del sistema de diseño — SIEMPRE se consume vía
// `theme.colors.<token>` (import { theme } from '@/theme'), nunca un hex
// suelto dentro de una pantalla. `ColorTokens` fija el contrato: el día
// que se añada modo oscuro, la nueva paleta (`darkColors`) tendrá que
// implementar exactamente estas mismas claves — lo exige el compilador —
// así que ninguna pantalla necesitará cambiar, solo theme/index.ts elegirá
// qué paleta activar.
//
// ============================================================
// WCAG 1.4.1 "Uso del color" (nivel A) — CUMPLIMIENTO CONFIRMADO
// ============================================================
// Un color de estado (success/warning/danger/info, o el color de un
// estado de cita) NUNCA es la única señal de esa información — siempre va
// acompañado de su etiqueta de texto. Esto no es solo una convención
// documentada: está reforzado por el propio tipo de los componentes que
// consumen estos tokens:
//   - Badge (components/ui/Badge.tsx): `label: string` es una prop
//     OBLIGATORIA de BadgeProps — TypeScript impide compilar un <Badge>
//     sin texto, así que es estructuralmente imposible usar un color de
//     estado sin su etiqueta al lado.
//   - STATUS_LABELS (lib/appointmentStatusPresentation.ts) es el
//     diccionario de etiquetas de los 5 estados de cita, pensado para ir
//     siempre de la mano de appointmentStatusColors (ver más abajo) —
//     nunca uno sin el otro.
// Cualquier pantalla o componente nuevo que use estos tokens de estado
// debe mantener esa misma regla: color + texto, nunca color solo.
//
// AJUSTE PARA DÉFICIT ROJO-VERDE (deuteranopía/protanopía): `warning` y
// `success` se afinaron (ver git log de este archivo para los valores
// previos) para separarse más entre sí y de `danger` bajo simulación de
// daltonismo — más luminosidad de diferencia y un ámbar más dorado (eje
// azul-amarillo, que sí se distingue) en vez de anaranjado. Es una MEJORA
// de separación adicional, NO un sustituto de la regla de 1.4.1 de
// arriba: con dicromacia total el color nunca basta por sí solo, por eso
// la etiqueta de texto sigue siendo la salvaguarda real, no esta mejora.
// Metodología y valores exactos de la simulación: ver /theme-preview,
// sección "Simulación de daltonismo".
//
// ============================================================
// WCAG 1.4.3 "Contraste mínimo" (nivel AA) — CUMPLIMIENTO CONFIRMADO
// ============================================================
// Ratios calculados con la fórmula de luminancia relativa de WCAG 2.1,
// sobre TODOS los pares texto/fondo y borde/fondo que los componentes de
// components/ui/ realmente usan (no solo contra blanco) — la ratio es
// simétrica (no importa cuál de los dos es "el texto"), así que cada par
// se verifica una sola vez. Umbrales: >= 4.5:1 texto normal / componentes
// con texto pequeño (Badge, 11px, no es "texto grande"); >= 3:1
// componentes no textuales (bordes de Input).
//
//   Token(es)                    Fondo real de uso          Ratio    Resultado
//   ---------------------------  -------------------------  -------  ---------
//   textPrimary                  background / surface       16.46:1 / 17.49:1  PASA
//   textSecondary                background / surface        7.18:1 /  7.63:1  PASA
//   textMuted                    background / surface        4.51:1 /  4.80:1  PASA (el más ajustado — ver nota jerarquía de superficies)
//   success                      background / surface        6.71:1 /  7.13:1  PASA
//   warning                      background / surface        4.63:1 /  4.92:1  PASA
//   danger                       background / surface        6.09:1 /  6.47:1  PASA
//   info                         background / surface        6.31:1 /  6.70:1  PASA
//   primary (link / secondary)   background / surface        5.15:1 /  5.47:1  PASA
//   borderStrong (Input, no-texto, >=3:1)   surface           4.80:1           PASA
//   primary (foco Input, no-texto, >=3:1)   surface           5.47:1           PASA
//   primary                      primarySurface (Badge)       5.25:1           PASA
//   success                      successSurface (Badge)       6.81:1           PASA
//   warning                      warningSurface (Badge)       4.75:1           PASA
//   danger                       dangerSurface (Badge)        5.91:1           PASA
//   info                         infoSurface (Badge)          6.16:1           PASA
//   textSecondary                disabledBg (Badge neutral)   6.08:1           PASA
//   textOnPrimary                primary (Button)             5.47:1           PASA
//   textOnPrimary                primaryPressed (Button)      9.48:1           PASA
//   textOnPrimary                danger (Button)               6.47:1          PASA
//   textPrimary                  loadFree (Mes, carga)       13.87:1           PASA
//   textPrimary                  loadPartial (Mes, carga)     7.03:1           PASA
//   textOnLoadFull               loadFull (Mes, carga)        7.58:1           PASA
//   textSecondary                loadClosed (Mes, cerrado)    7.18:1           PASA
//   textPrimary                  loadPast (Mes, día pasado)  11.74:1           PASA
//   disabledText                 disabledBg (Button/Input)    2.01:1  EXENTO — WCAG 1.4.3 excluye
//                                                                      explícitamente los componentes
//                                                                      INACTIVOS ("Inactive user
//                                                                      interface components"); no es
//                                                                      un fallo, es el estado deshabilitado.
//
// Todos los pares no exentos PASAN AA. Si algún valor de este archivo
// cambia, hay que volver a pasar esta tabla (el método está documentado
// en el historial de esta sesión / theme-preview) antes de darlo por
// bueno otra vez.
//
// JERARQUÍA DE SUPERFICIES (background vs surface): `background` se
// oscureció de #fafaf9 a #f8f8f7 para que las superficies (tarjetas,
// huecos, inputs) se distingan del fondo de página sin usar color de
// estado — técnica "Notion/Linear": diferencia de superficie + elevación
// (shadows.sm), no un color de fondo llamativo. #f8f8f7 es, calculado por
// barrido, el fondo MÁS OSCURO posible dentro de la misma familia de gris
// cálido que mantiene TODOS los tokens de arriba en >= 4.5:1 — el límite
// real es `textMuted` (4.51:1, el más ajustado de la tabla). Ir más oscuro
// bajaría textMuted (y luego warning) por debajo de AA, así que la
// separación de color por sí sola es deliberadamente modesta (1.04:1 ->
// 1.06:1 de contraste fondo/superficie); el resto de la jerarquía visual
// la pone la sombra, aplicada a los elementos tocables (ver
// components/ui/Card.tsx, que ya incluye shadows.sm, y cualquier "hueco"
// tocable que no use Card, p.ej. las franjas libres de disponibilidad.tsx).

export interface ColorTokens {
  // Marca — `primary` lleva texto encima (5.47:1 sobre surface, 5.24:1
  // sobre background — ver tabla de arriba). `primaryVivid` es más
  // vibrante pero NO se ha verificado para texto: solo para acentos sin
  // texto (iconos, indicador de pestaña activa).
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primaryVivid: string;
  primarySurface: string;
  primaryDisabled: string;

  // Neutros / superficies — cálidos (no gris frío), para la sensación
  // "cercana" pedida en la dirección visual.
  background: string;
  surface: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  disabledBg: string;
  disabledText: string;

  // Estado genérico — reutilizable en cualquier pantalla (validación de
  // formularios, avisos, banners...), no solo en citas. Ver WCAG 1.4.1 /
  // 1.4.3 arriba: siempre con etiqueta de texto, contraste ya verificado
  // tanto en texto plano (background/surface) como en Badge (xSurface).
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  info: string;
  infoSurface: string;

  // Escala de CARGA del día (vista Mes del calendario): monocroma teal, la
  // carga se lee por LUMINOSIDAD (más oscuro = más lleno), nunca por matiz.
  // `loadClosed` queda FUERA de la escala (día que no cuenta) y se distingue
  // además por estructura (borde discontinuo, "–"/"Cerrado"), no solo por tono.
  // `textOnLoadFull` es el texto sobre el paso más oscuro (los otros pasos
  // llevan textPrimary). Ratios AA en la tabla de arriba.
  loadClosed: string;
  // Día PASADO abierto (vista Mes): neutro sólido, fuera de la escala de carga
  // — la carga solo tiene sentido como cupo de hoy en adelante.
  loadPast: string;
  loadFree: string;
  loadPartial: string;
  loadFull: string;
  textOnLoadFull: string;
}

// Objeto intermedio SIN exportar: permite que los alias de abajo
// (appointmentStatusColors) referencien estos mismos valores en vez de
// repetir los hex, para que nunca puedan desincronizarse.
const base: ColorTokens = {
  primary: '#0f766e', // 5.47:1 vs surface, 5.15:1 vs background — ver tabla WCAG 1.4.3
  primaryHover: '#115e59',
  primaryPressed: '#134e4a', // 9.48:1 con textOnPrimary encima (Button primary, pressed)
  primaryVivid: '#14b8a6',
  primarySurface: '#f0fdfa', // fondo de Badge tone=primary; 5.25:1 con `primary` encima
  primaryDisabled: '#99f6e4',

  // El más oscuro posible dentro de esta familia de gris cálido que
  // mantiene toda la tabla de arriba en AA (textMuted es el límite, a
  // 4.51:1) — ver nota "JERARQUÍA DE SUPERFICIES". Antes #fafaf9.
  background: '#f8f8f7',
  surface: '#ffffff',
  border: '#e7e5e4',
  borderStrong: '#78716c', // 4.80:1 vs surface — supera el 3:1 exigido a un borde de Input
  textPrimary: '#1c1917', // 16.46:1 / 17.49:1 (background/surface)
  textSecondary: '#57534e', // 7.18:1 / 7.63:1 (background/surface); 6.08:1 sobre disabledBg (Badge neutral)
  textMuted: '#78716c', // 4.51:1 / 4.80:1 (background/surface) — el ratio más ajustado del sistema
  textOnPrimary: '#ffffff', // 5.47:1 sobre `primary`, 9.48:1 sobre `primaryPressed`, 6.47:1 sobre `danger`
  disabledBg: '#e7e5e4',
  disabledText: '#a8a29e', // 2.01:1 vs disabledBg — exento de AA (componente inactivo, WCAG 1.4.3)

  // 7.13:1 vs surface, 6.71:1 vs background, 6.81:1 vs successSurface (Badge).
  // Antes #15803d (5.01:1) — más oscuro, más separado de `danger` bajo
  // simulación de daltonismo (ver AJUSTE PARA DÉFICIT ROJO-VERDE arriba).
  success: '#166534',
  successSurface: '#f0fdf4',
  // 4.92:1 vs surface, 4.63:1 vs background, 4.75:1 vs warningSurface (Badge).
  // Antes #b45309 (5.02:1) — más dorado/amarillo, menos anaranjado (idem).
  warning: '#a16207',
  warningSurface: '#fffbeb',
  // 6.47:1 vs surface, 6.09:1 vs background, 5.91:1 vs dangerSurface (Badge).
  // Sin cambios: oscurecerlo empeoraba la separación con `success` bajo
  // simulación de daltonismo (comprobado, no a ojo — ver /theme-preview).
  danger: '#b91c1c',
  dangerSurface: '#fef2f2',
  info: '#1d4ed8', // 6.70:1 vs surface, 6.31:1 vs background, 6.16:1 vs infoSurface (Badge)
  infoSurface: '#eff6ff',

  // Escala de carga — luminosidad L* (CIE): free 90.9 / partial 67.4 / full 35.7,
  // saltos de 23.5 y 31.7. closed = igual que `background` (L* 97.6): "sin relleno".
  loadClosed: '#f8f8f7',
  // L* 84.7: 6.2 por debajo de loadFree (90.9), sin matiz teal. textPrimary 11.74:1.
  loadPast: '#d6d3d1',
  loadFree: '#99f6e4', // textPrimary 13.87:1
  loadPartial: '#14b8a6', // textPrimary 7.03:1
  loadFull: '#115e59', // textOnLoadFull 7.58:1
  textOnLoadFull: '#ffffff',
};

export const lightColors: ColorTokens = base;

// Estados de cita: ORIGEN ÚNICO de verdad del reparto estado -> tono
// (ámbar/verde/azul/gris/rojo), con valores recalculados para cumplir AA.
// `appointmentStatusTones` es el mapeo canónico; `appointmentStatusColors`
// se DERIVA de él (no se repite a mano), así que tono y color no pueden
// desincronizarse. Quien pinte un estado de cita (Badge, bloques del
// calendario...) lo hace vía lib/appointmentStatusPresentation.ts, nunca
// con un mapeo propio.
// Deliberadamente NINGUNO usa `primary` (el teal de marca): así "esto es
// una acción" (botón) y "esto es un estado" (cita) nunca se confunden
// visualmente. WCAG 1.4.1: estos colores se consumen siempre junto a la
// etiqueta (STATUS_LABELS, en ese mismo módulo) y, donde el color es el
// único matiz posible, con otra señal estructural — ver nota de
// cumplimiento al principio de este archivo.
//
// Subconjunto de BadgeTone (components/ui/Badge.tsx); se declara aquí para
// que el theme no dependa de los componentes.
export type AppointmentStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const appointmentStatusTones: Record<AppointmentStatus, AppointmentStatusTone> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'info',
  cancelled: 'neutral',
  no_show: 'danger',
};

const toneTextColor: Record<AppointmentStatusTone, string> = {
  success: base.success,
  warning: base.warning,
  danger: base.danger,
  info: base.info,
  neutral: base.textMuted,
};

export const appointmentStatusColors: Record<AppointmentStatus, string> = {
  pending: toneTextColor[appointmentStatusTones.pending],
  confirmed: toneTextColor[appointmentStatusTones.confirmed],
  completed: toneTextColor[appointmentStatusTones.completed],
  cancelled: toneTextColor[appointmentStatusTones.cancelled],
  no_show: toneTextColor[appointmentStatusTones.no_show],
};
