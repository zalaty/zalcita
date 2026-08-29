import { zonedTimeToUtc } from '@/lib/timezone';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface Slot extends TimeRange {
  available: boolean;
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

// Genera TODAS las franjas del horario laboral de un día, trocenado en
// bloques de `durationMinutes`, marcando con `available: false` las que
// solapen con citas o cierres (`blockedRanges`) — no las descarta, para que
// la UI las pueda pintar como ocupadas. Las franjas ya pasadas sí se
// descartan por completo, igual que antes. Función pura, sin acceso a red,
// para que se pueda testear y reutilizar sin depender de Supabase ni de React.
export function computeAvailableSlots({
  dateStr,
  timeZone,
  workingRanges,
  blockedRanges,
  durationMinutes,
  now,
}: ComputeAvailableSlotsParams): Slot[] {
  const stepMs = durationMinutes * 60000;
  const slots: Slot[] = [];

  for (const range of workingRanges) {
    const rangeStartMs = zonedTimeToUtc(dateStr, toHm(range.start_time), timeZone).getTime();
    const rangeEndMs = zonedTimeToUtc(dateStr, toHm(range.end_time), timeZone).getTime();

    for (let startMs = rangeStartMs; startMs + stepMs <= rangeEndMs; startMs += stepMs) {
      const start = new Date(startMs);
      const end = new Date(startMs + stepMs);
      if (start < now) continue;
      const available = !blockedRanges.some((blocked) => overlaps({ start, end }, blocked));
      slots.push({ start, end, available });
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
