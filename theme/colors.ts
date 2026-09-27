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

  // Hueco "Libre" de la vista Semana (WeekDayColumn, calendario.tsx):
  // gris-azulado FRÍO a propósito, deliberadamente distinto de los grises
  // cálidos del resto del sistema — así "libre" no se confunde con
  // "confirmada" (verde/teal) bajo daltonismo. Sin equivalente cálido, por
  // eso son tokens propios en vez de reutilizar border/borderStrong/textMuted.
  freeSlotBorder: string;
  freeSlotText: string;
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

  // Mismos hex que ya usaba calendario.tsx como constantes de módulo
  // (COLOR_FREE_BORDER/COLOR_FREE_TEXT) antes de esta tanda — al convertirlos
  // en tokens, el valor CLARO no cambia, cero diferencia visual en claro.
  freeSlotBorder: '#64748b',
  freeSlotText: '#334155',
};

export const lightColors: ColorTokens = base;

// ============================================================
// MODO OSCURO — PASO 3
// ============================================================
// TANDA 1 (neutros): background/surface/border/borderStrong/textPrimary/
// textSecondary/textMuted/disabledBg/disabledText — diseñados y aprobados.
// Gris CÁLIDO muy oscuro (misma familia que los neutros de `base`, NO un
// gris frío ni negro puro), con `surface` más CLARA que `background` (en
// oscuro, lo que "flota" —Cards, superficies elevadas— debe leerse por
// encima del fondo, al revés que en claro donde la jerarquía la daba sobre
// todo la sombra).
//
// TANDA 2 (acentos): primary + success/warning/danger/info + sus xSurface —
// diseñados y verificados.
//
// TANDA 3 (casos especiales): escala de CARGA de la vista Mes (loadFree/
// loadPartial/loadFull/loadPast) y el hueco "Libre" de Semana
// (freeSlotBorder/freeSlotText) — diseñados y verificados. La escala INVIERTE
// el sentido respecto a claro (ver darkLoadScale más abajo): en claro "más
// oscuro = más lleno", en oscuro "más brillante = más lleno", porque un
// "lleno" oscuro se fundiría con el fondo. Con esto, darkColors ya no tiene
// ninguna clave provisional.
//
// Contraste AA (fórmula WCAG 2.1, igual método que la tabla de `base` de
// arriba):
//   Token           Fondo               Ratio    Resultado
//   --------------  ------------------  -------  ---------
//   textPrimary     background          15.76:1  PASA
//   textPrimary     surface             13.36:1  PASA
//   textSecondary   background           9.40:1  PASA
//   textSecondary   surface              7.96:1  PASA
//   textMuted       background           5.88:1  PASA
//   textMuted       surface              4.99:1  PASA (el más ajustado de los neutros)
//   borderStrong    background           3.82:1  PASA (>=3:1, no-texto: borde de Input)
//   borderStrong    surface              3.24:1  PASA (>=3:1, no-texto: borde de Input)
//   surface         background           1.18:1  (jerarquía visual, no es un par de AA)
//   primary (link)  background           7.37:1  PASA
//   primary (link)  surface              6.24:1  PASA
//   danger (texto)  background           6.63:1  PASA
//   danger (texto)  surface              5.62:1  PASA
//   success (texto) background          10.52:1  PASA
//   success (texto) surface              8.92:1  PASA
//   warning (texto) background          10.98:1  PASA
//   warning (texto) surface              9.31:1  PASA
//   info (texto)    background           7.21:1  PASA
//   info (texto)    surface              6.11:1  PASA
//   primary (Badge) primarySurface       5.16:1  PASA
//   success (Badge) successSurface       6.89:1  PASA
//   warning (Badge) warningSurface       7.13:1  PASA
//   danger (Badge)  dangerSurface        4.63:1  PASA (el más ajustado de los acentos)
//   info (Badge)    infoSurface          5.03:1  PASA
//   textOnPrimary   primary (Button)     7.37:1  PASA
//   textOnPrimary   primaryPressed       4.90:1  PASA
//   textOnPrimary   danger (Button)      6.63:1  PASA — ver nota textOnPrimary abajo
//
// NOTA textOnPrimary: en claro es blanco puro porque primary/danger son
// oscuros. En oscuro `primary` se aclaró (ver abajo) — un teal claro con
// texto BLANCO encima no llega a AA (ratio ~2.5:1), así que aquí
// textOnPrimary pasa a ser OSCURO (el mismo tono que `background`). Como
// Button.tsx ya lee este único token tanto para el botón primary como para
// el danger (sin blanco hardcodeado en ningún sitio), y `danger` en oscuro
// también resulta lo bastante claro (6.63:1 con texto oscuro encima), un
// solo valor de textOnPrimary sirve para los dos sin más cambios de código.
const darkNeutrals = {
  background: '#171412',
  surface: '#282320',
  border: '#3a352f',
  borderStrong: '#78716c', // mismo hex que borderStrong/textMuted de `base` — funciona en los dos extremos
  textPrimary: '#f2ede8', // blanco-hueso, NO #fff puro
  textSecondary: '#c2b8ae',
  textMuted: '#9b9088',
  // Oscuro (no blanco): con `primary` aclarado para oscuro, el texto de un
  // botón primary/danger tiene que ser oscuro para llegar a AA — ver nota arriba.
  textOnPrimary: '#171412',
  disabledBg: '#322d29',
  disabledText: '#726b64', // 2.59:1 vs disabledBg — exento de AA (componente inactivo, igual que en claro)
};

// Acentos de marca aclarados para oscuro — un teal medio-claro que resalta
// sobre background/surface (7.37:1 / 6.24:1 como texto), con texto OSCURO
// encima en vez de blanco (ver nota textOnPrimary arriba). primarySurface se
// REHACE, no se aclara: es un teal oscuro apagado (mezcla de un teal 900
// sobre `surface`) para que `primary` como texto de Badge siga leyéndose.
const darkPrimary = {
  primary: '#14b8a6', // teal-500
  primaryHover: '#2dd4bf', // teal-400, más claro al pasar el cursor
  primaryPressed: '#0d9488', // teal-600, más oscuro al pulsar (misma dirección que en claro)
  primaryVivid: '#2dd4bf', // acentos sin texto (iconos, pestaña activa) — sin verificar para texto, igual que en claro
  primaryDisabled: '#3f6f68', // teal apagado, baja saturación — sin AA (estado inactivo)
  primarySurface: '#1f3633', // teal oscuro apagado; primary encima: 5.16:1
};

// Estados genéricos aclarados para oscuro — mismo reparto de matices que en
// claro (verde/ámbar/rojo/azul), recalculados para leerse como TEXTO sobre
// fondo oscuro (su uso real: mensajes de error/éxito, bordes de aviso,
// texto de Badge) en vez de como texto oscuro sobre fondo claro.
// DALTONISMO (rojo-verde): success y danger se separaron también por
// LUMINOSIDAD, no solo por matiz — L* 79.2 (success) frente a L* 64.1
// (danger), 15.1 puntos de diferencia — para que la simulación de
// daltonismo de /theme-preview siga mostrando dos tonos distinguibles bajo
// deficiencia rojo-verde. La salvaguarda real sigue siendo estructural
// (etiqueta de Badge, glifos ✓/✕), esto es una mejora adicional, igual que
// en claro.
const darkAccents = {
  success: '#4ade80',
  successSurface: '#1d3d27', // dark verde apagado; success encima: 6.89:1
  warning: '#fbbf24',
  warningSurface: '#542d17', // dark ámbar apagado; warning encima: 7.13:1
  danger: '#f87171',
  dangerSurface: '#58201e', // dark rojo apagado; danger encima: 4.63:1 (el más ajustado)
  info: '#60a5fa',
  infoSurface: '#23305a', // dark azul apagado; info encima: 5.03:1
};

// Escala de CARGA (vista Mes) — SENTIDO INVERTIDO respecto a claro. En claro
// "más oscuro = más lleno" funciona porque el fondo de página es claro; en
// oscuro esa misma regla fundiría "completo" con el fondo y haría que
// "libre" resaltara más que un día lleno, justo al revés de lo deseado. Por
// eso en oscuro es "MÁS BRILLANTE = MÁS LLENO": loadFree apagado y oscuro
// (pero distinguible de loadClosed/background), loadPartial medio, loadFull
// el más brillante. Sigue siendo la MISMA familia teal (no cambia de matiz,
// solo de sentido), y la señal sigue siendo LUMINOSIDAD — crítico para
// daltonismo: L* 24.3 -> 44.5 -> 76.9, saltos de 20.1 y 32.4 (comparable a
// los saltos de claro, 23.5 y 31.7).
const darkLoadScale = {
  loadFree: '#0f413c', // L* 24.3 — apagado; textPrimary encima 9.80:1; ~1.6:1 vs background (visible, no se funde)
  loadPartial: '#0f766e', // L* 44.5 (mismo hex que `primary` de claro); textPrimary encima 4.71:1
  loadFull: '#2dd4bf', // L* 76.9, el más brillante — el nivel "completo"; ver textOnLoadFull
  // Antes blanco (claro: loadFull es el más OSCURO). En oscuro loadFull es
  // el más BRILLANTE, así que el texto de la celda sobre él pasa a oscuro.
  textOnLoadFull: '#171412', // 9.85:1 sobre loadFull
  // Gris NEUTRO (sin teal) a propósito, para no leerse como "un poco de
  // carga": un pasado-abierto no es un nivel más de la escala. L* 26.6,
  // similar al de loadFree por diseño (mismo criterio que en claro, donde
  // loadPast también quedaba cerca de loadFree en luminosidad) — la
  // distinción real es de MATIZ (gris cálido neutro vs teal), no de L*.
  loadPast: '#453e34', // textPrimary encima 9.06:1
};

// Hueco "Libre" de Semana (freeSlotBorder/freeSlotText) — versión CLARA del
// mismo gris-azulado frío de claro, para que se lea sobre el fondo oscuro
// del hueco (COLOR_FREE_BG -> surface). Sigue sin ser verde, a propósito
// (ver nota de la interfaz ColorTokens).
const darkFreeSlot = {
  freeSlotBorder: '#94a3b8', // 6.06:1 vs surface (>=3 exigido a un borde)
  freeSlotText: '#cbd5e1', // 10.47:1 vs surface — "Libre" se lee con margen de sobra
};

export const darkColors: ColorTokens = {
  primary: darkPrimary.primary,
  primaryHover: darkPrimary.primaryHover,
  primaryPressed: darkPrimary.primaryPressed,
  primaryVivid: darkPrimary.primaryVivid,
  primarySurface: darkPrimary.primarySurface,
  primaryDisabled: darkPrimary.primaryDisabled,

  background: darkNeutrals.background,
  surface: darkNeutrals.surface,
  border: darkNeutrals.border,
  borderStrong: darkNeutrals.borderStrong,
  textPrimary: darkNeutrals.textPrimary,
  textSecondary: darkNeutrals.textSecondary,
  textMuted: darkNeutrals.textMuted,
  textOnPrimary: darkNeutrals.textOnPrimary,
  disabledBg: darkNeutrals.disabledBg,
  disabledText: darkNeutrals.disabledText,

  success: darkAccents.success,
  successSurface: darkAccents.successSurface,
  warning: darkAccents.warning,
  warningSurface: darkAccents.warningSurface,
  danger: darkAccents.danger,
  dangerSurface: darkAccents.dangerSurface,
  info: darkAccents.info,
  infoSurface: darkAccents.infoSurface,

  // loadClosed reutiliza el `background` oscuro, mismo criterio que en claro
  // ("cerrado" = tono de fondo de página).
  loadClosed: darkNeutrals.background,
  loadPast: darkLoadScale.loadPast,
  loadFree: darkLoadScale.loadFree,
  loadPartial: darkLoadScale.loadPartial,
  loadFull: darkLoadScale.loadFull,
  textOnLoadFull: darkLoadScale.textOnLoadFull,

  freeSlotBorder: darkFreeSlot.freeSlotBorder,
  freeSlotText: darkFreeSlot.freeSlotText,
};

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
