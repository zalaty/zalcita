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

export const APPOINTMENT_STATUS_PRESENTATION = Object.fromEntries(
  STATUSES.map((status) => [
    status,
    {
      label: STATUS_LABELS[status],
      tone: appointmentStatusTones[status],
      color: appointmentStatusColors[status],
      glyph: STATUS_GLYPHS[status],
    } satisfies AppointmentStatusPresentation,
  ])
) as Record<AppointmentStatus, AppointmentStatusPresentation>;
