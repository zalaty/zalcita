import { supabase } from '@/lib/supabase';
import { dayOfWeekFromDateStr, zonedTimeToUtc } from '@/lib/timezone';
import type { TimeRange } from '@/lib/availability';

export interface WorkingRange {
  start_time: string; // 'HH:mm' o 'HH:mm:ss' (tipo `time` de Postgres)
  end_time: string;
}

// Un bloque de excepción con su motivo (0012) — sigue siendo un TimeRange
// válido para computeAvailableSlots (que solo mira start/end), el motivo
// es un extra que consumen las pantallas que sí quieren mostrarlo.
export interface ExceptionBlock extends TimeRange {
  reason: string | null;
}

export interface DaySchedule {
  workingRanges: WorkingRange[];
  exceptionBlockedRanges: ExceptionBlock[]; // ya convertidos a instantes UTC
  fullDayClosed: boolean;
  fullDayClosedReason: string | null;
}

interface ExceptionRow {
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

// Combina horario laboral + filas de excepción YA TRAÍDAS de un día
// concreto en la forma que espera computeAvailableSlots — pura, sin red, así
// fetchDaySchedule (un día suelto) y dayScheduleFromRange (un día dentro de
// un RangeSchedule precargado, ver más abajo) construyen exactamente el
// mismo DaySchedule sin duplicar esta lógica.
function buildDaySchedule(
  dateStr: string,
  timeZone: string,
  workingRanges: WorkingRange[],
  exceptionRows: ExceptionRow[]
): DaySchedule {
  // is_closed=true SIN horas -> cierra el día completo.
  // is_closed=true CON start_time/end_time -> bloquea solo esa franja.
  const fullDayClosedRow = exceptionRows.find((e) => e.is_closed && !e.start_time && !e.end_time);
  const fullDayClosed = !!fullDayClosedRow;

  const exceptionBlockedRanges: ExceptionBlock[] = [];
  for (const e of exceptionRows) {
    if (e.is_closed && e.start_time && e.end_time) {
      exceptionBlockedRanges.push({
        start: zonedTimeToUtc(dateStr, e.start_time.slice(0, 5), timeZone),
        end: zonedTimeToUtc(dateStr, e.end_time.slice(0, 5), timeZone),
        reason: e.reason,
      });
    }
  }

  return {
    workingRanges,
    exceptionBlockedRanges,
    fullDayClosed,
    fullDayClosedReason: fullDayClosedRow?.reason ?? null,
  };
}

// Horario laboral + excepciones de UN día, ya resueltos a la forma que
// espera computeAvailableSlots (lib/availability.ts, que se mantiene puro
// y sin red a propósito). Extraído de disponibilidad.tsx para que
// cita.tsx (herramienta de reserva manual del dueño) reutilice exactamente
// la misma lógica en vez de duplicarla.
export async function fetchDaySchedule(
  businessId: string,
  dateStr: string,
  timeZone: string,
  dayOfWeek: number
): Promise<{ data: DaySchedule | null; error: string | null }> {
  const [workingHoursRes, exceptionsRes] = await Promise.all([
    supabase
      .from('working_hours')
      .select('start_time, end_time')
      .eq('business_id', businessId)
      .eq('day_of_week', dayOfWeek)
      .is('member_id', null),
    supabase
      .from('schedule_exceptions')
      .select('is_closed, start_time, end_time, reason')
      .eq('business_id', businessId)
      .eq('date', dateStr)
      .is('member_id', null),
  ]);

  if (workingHoursRes.error) return { data: null, error: workingHoursRes.error.message };
  if (exceptionsRes.error) return { data: null, error: exceptionsRes.error.message };

  return {
    data: buildDaySchedule(dateStr, timeZone, workingHoursRes.data ?? [], exceptionsRes.data ?? []),
    error: null,
  };
}

export interface RangeSchedule {
  workingHoursByDay: Map<number, WorkingRange[]>; // day_of_week (0=domingo..6=sábado) -> tramos
  exceptionsByDate: Map<string, ExceptionRow[]>; // 'YYYY-MM-DD' -> excepciones de ese día
}

// Trae horario laboral + excepciones de un RANGO de fechas en dos queries
// — en vez de llamar a fetchDaySchedule día por día (N+1: 2N queries para
// una semana o un mes), que es exactamente lo que necesitan las vistas
// Semana/Mes de calendario.tsx. working_hours no está fechado — es el
// horario semanal completo del negocio — así que se trae entero UNA vez y
// se agrupa por day_of_week; schedule_exceptions sí se filtra por rango
// (fromDateStr inclusive, toDateStrExclusive exclusive, mismo criterio que
// fetchAppointmentsInRange).
export async function fetchScheduleForRange(
  businessId: string,
  fromDateStr: string,
  toDateStrExclusive: string
): Promise<{ data: RangeSchedule | null; error: string | null }> {
  const [workingHoursRes, exceptionsRes] = await Promise.all([
    supabase
      .from('working_hours')
      .select('day_of_week, start_time, end_time')
      .eq('business_id', businessId)
      .is('member_id', null),
    supabase
      .from('schedule_exceptions')
      .select('date, is_closed, start_time, end_time, reason')
      .eq('business_id', businessId)
      .is('member_id', null)
      .gte('date', fromDateStr)
      .lt('date', toDateStrExclusive),
  ]);

  if (workingHoursRes.error) return { data: null, error: workingHoursRes.error.message };
  if (exceptionsRes.error) return { data: null, error: exceptionsRes.error.message };

  const workingHoursByDay = new Map<number, WorkingRange[]>();
  for (const row of workingHoursRes.data ?? []) {
    const list = workingHoursByDay.get(row.day_of_week) ?? [];
    list.push({ start_time: row.start_time, end_time: row.end_time });
    workingHoursByDay.set(row.day_of_week, list);
  }

  const exceptionsByDate = new Map<string, ExceptionRow[]>();
  for (const row of exceptionsRes.data ?? []) {
    const list = exceptionsByDate.get(row.date) ?? [];
    list.push({ is_closed: row.is_closed, start_time: row.start_time, end_time: row.end_time, reason: row.reason });
    exceptionsByDate.set(row.date, list);
  }

  return { data: { workingHoursByDay, exceptionsByDate }, error: null };
}

// Arma el DaySchedule de UN día a partir de un RangeSchedule ya cargado —
// sin red. Las vistas Semana/Mes llaman a esto por cada día visible.
export function dayScheduleFromRange(range: RangeSchedule, dateStr: string, timeZone: string): DaySchedule {
  const dayOfWeek = dayOfWeekFromDateStr(dateStr);
  return buildDaySchedule(
    dateStr,
    timeZone,
    range.workingHoursByDay.get(dayOfWeek) ?? [],
    range.exceptionsByDate.get(dateStr) ?? []
  );
}
