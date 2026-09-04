import { supabase } from '@/lib/supabase';
import { zonedTimeToUtc } from '@/lib/timezone';
import type { TimeRange } from '@/lib/availability';

interface WorkingRange {
  start_time: string; // 'HH:mm' o 'HH:mm:ss' (tipo `time` de Postgres)
  end_time: string;
}

export interface DaySchedule {
  workingRanges: WorkingRange[];
  exceptionBlockedRanges: TimeRange[]; // ya convertidos a instantes UTC
  fullDayClosed: boolean;
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
      .select('is_closed, start_time, end_time')
      .eq('business_id', businessId)
      .eq('date', dateStr)
      .is('member_id', null),
  ]);

  if (workingHoursRes.error) return { data: null, error: workingHoursRes.error.message };
  if (exceptionsRes.error) return { data: null, error: exceptionsRes.error.message };

  const exceptions = exceptionsRes.data ?? [];
  // is_closed=true SIN horas -> cierra el día completo.
  // is_closed=true CON start_time/end_time -> bloquea solo esa franja.
  const fullDayClosed = exceptions.some((e) => e.is_closed && !e.start_time && !e.end_time);

  const exceptionBlockedRanges: TimeRange[] = [];
  for (const e of exceptions) {
    if (e.is_closed && e.start_time && e.end_time) {
      exceptionBlockedRanges.push({
        start: zonedTimeToUtc(dateStr, e.start_time.slice(0, 5), timeZone),
        end: zonedTimeToUtc(dateStr, e.end_time.slice(0, 5), timeZone),
      });
    }
  }

  return {
    data: { workingRanges: workingHoursRes.data ?? [], exceptionBlockedRanges, fullDayClosed },
    error: null,
  };
}
