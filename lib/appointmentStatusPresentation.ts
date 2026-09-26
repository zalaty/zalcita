import { appointmentStatusColors, appointmentStatusTones, type AppointmentStatusTone } from '@/theme';
import type { AppointmentStatus } from '@/types/database';

// ÚNICO sitio donde se define cómo se presenta un estado de cita: etiqueta,
// tono y color. Lo consumen mis-citas.tsx, cliente/[id].tsx, theme-preview y
// calendario.tsx — ninguna pantalla debe tener su propio mapeo estado->tono.
// El reparto de tonos vive en theme/colors.ts (appointmentStatusTones) y
// aquí solo se compone con la etiqueta; nada de colores literales.
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  no_show: 'No se presentó',
};

// Marca no-cromática de los estados ya pasados, para listas/rejillas densas
// donde el color no puede ser la única señal (ver calendario.tsx). Los
// estados sin marca propia (pending/confirmed/cancelled) se distinguen por
// forma de bloque o por tachado, no por glifo.
const STATUS_GLYPHS: Record<AppointmentStatus, string | null> = {
  pending: null,
  confirmed: null,
  cancelled: null,
  completed: '✓',
  no_show: '✕',
};

export interface AppointmentStatusPresentation {
  label: string;
  tone: AppointmentStatusTone;
  // Color de TEXTO del estado sobre fondo claro (ya verificado AA en el theme).
  color: string;
  glyph: string | null;
}

const STATUSES = Object.keys(STATUS_LABELS) as AppointmentStatus[];

// Función pura (recibe tonos/colores por PARÁMETRO, no los importa) — este
// es un módulo de lib/, no un componente: no puede llamar a useTheme() aquí
// dentro. Quien la llame en render (con el theme reactivo de useTheme(), el
// día que migre) le pasa sus propios tonos/colores; también puede llamarse
// en frío, a nivel de módulo, como hace APPOINTMENT_STATUS_PRESENTATION
// más abajo.
//
// OJO: appointmentStatusColors/appointmentStatusTones (theme/colors.ts) son
// hoy en sí mismos estáticos — derivados solo de la paleta clara, sin
// ninguna variante oscura todavía. Parametrizar esta función ya la deja
// lista para recibir versiones reactivas de esos dos mapas el día que
// existan (paso 3, junto con darkColors); hasta entonces, el resultado es
// idéntico se llame con lo que se llame, porque solo hay un valor posible.
export function appointmentStatusPresentation(
  tones: Record<AppointmentStatus, AppointmentStatusTone>,
  colors: Record<AppointmentStatus, string>
): Record<AppointmentStatus, AppointmentStatusPresentation> {
  return Object.fromEntries(
    STATUSES.map((status) => [
      status,
      {
        label: STATUS_LABELS[status],
        tone: tones[status],
        color: colors[status],
        glyph: STATUS_GLYPHS[status],
      } satisfies AppointmentStatusPresentation,
    ])
  ) as Record<AppointmentStatus, AppointmentStatusPresentation>;
}

// Exportada para que los consumidores que TODAVÍA no migran a useTheme()
// (hoy: mis-citas.tsx, cliente/[id].tsx, calendario.tsx, theme-preview.tsx —
// ninguno migrado aún) sigan teniendo un valor calculable a nivel de
// módulo, con los MISMOS valores que tenía esta constante antes de este
// cambio. Cuando alguno de ellos migre, debería llamar a
// appointmentStatusPresentation(tones, colors) directamente en su propio
// render, en vez de importar esta constante — momento en el que podría
// desaparecer, igual que se anotó para BADGE_TONE_STYLES en Badge.tsx.
export const APPOINTMENT_STATUS_PRESENTATION = appointmentStatusPresentation(
  appointmentStatusTones,
  appointmentStatusColors
);
