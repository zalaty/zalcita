import { zonedTimeToUtc } from '@/lib/timezone';

export interface TimeRange {
  start: Date;
  end: Date;
}

interface WallClockRange {
  start_time: string; // 'HH:mm' o 'HH:mm:ss' (tipo `time` de Postgres)
  end_time: string;
}

interface ComputeAvailableSlotsParams {
  dateStr: string; // 'YYYY-MM-DD', fecha civil del negocio
  timeZone: string;
  workingRanges: WallClockRange[];
  // Citas existentes + excepciones/cierres, ya convertidas a instantes UTC.
  // Nunca deben llevar datos del cliente que ocupó el hueco (ver llamador).
  blockedRanges: TimeRange[];
  durationMinutes: number;
  now: Date;
}

function toHm(value: string): string {
  return value.slice(0, 5); // admite 'HH:mm' o 'HH:mm:ss'
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && a.end > b.start;
}

// Genera las franjas libres de un día trocenado el horario laboral en
// bloques de `durationMinutes`, descartando las que solapen con citas o
// cierres, o que ya hayan pasado. Función pura, sin acceso a red, para que
// se pueda testear y reutilizar sin depender de Supabase ni de React.
export function computeAvailableSlots({
  dateStr,
  timeZone,
  workingRanges,
  blockedRanges,
  durationMinutes,
  now,
}: ComputeAvailableSlotsParams): TimeRange[] {
  const stepMs = durationMinutes * 60000;
  const slots: TimeRange[] = [];

  for (const range of workingRanges) {
    const rangeStartMs = zonedTimeToUtc(dateStr, toHm(range.start_time), timeZone).getTime();
    const rangeEndMs = zonedTimeToUtc(dateStr, toHm(range.end_time), timeZone).getTime();

    for (let startMs = rangeStartMs; startMs + stepMs <= rangeEndMs; startMs += stepMs) {
      const slot: TimeRange = { start: new Date(startMs), end: new Date(startMs + stepMs) };
      if (slot.start < now) continue;
      if (blockedRanges.some((blocked) => overlaps(slot, blocked))) continue;
      slots.push(slot);
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
