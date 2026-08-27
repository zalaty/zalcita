// Utilidades de zona horaria basadas en `Intl` — sin dependencias externas.
// Hermes (el motor JS de Expo/React Native) incluye soporte completo de
// `Intl` con zonas horarias IANA, así que no hace falta date-fns-tz ni
// similares para convertir entre la hora de pared del negocio y UTC.

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateStr({ year, month, day }: DateParts): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateStr(dateStr: string): DateParts {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

// Día de la semana (0=domingo..6=sábado) de una fecha de calendario.
// No depende de la zona horaria: una fecha 'YYYY-MM-DD' ya es un día civil
// concreto, así que basta anclarla a medianoche UTC y leer getUTCDay().
export function dayOfWeekFromDateStr(dateStr: string): number {
  const { year, month, day } = parseDateStr(dateStr);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const { year, month, day } = parseDateStr(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateStr({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

// Etiqueta corta del día ('lun.', 'mar.'...) para la tira semanal.
export function weekdayShortLabel(dateStr: string, locale = 'es-ES'): string {
  const { year, month, day } = parseDateStr(dateStr);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(anchor);
}

// Etiqueta 'día mes' ('25 ago') para cabeceras de semana.
export function dayMonthLabel(dateStr: string, locale = 'es-ES'): string {
  const { year, month, day } = parseDateStr(dateStr);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(anchor);
}

// Offset (en minutos, este positivo) entre UTC y timeZone en el instante dado.
function getTimeZoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(utcDate)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - utcDate.getTime()) / 60000;
}

// Convierte una hora de pared del negocio ('YYYY-MM-DD' + 'HH:mm', en
// timeZone) al instante UTC real, respetando el cambio de hora (DST).
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const { year, month, day } = parseDateStr(dateStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60000);
}

// Instante UTC -> 'HH:mm' tal como se ve en timeZone.
export function formatTimeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

// Fecha larga ('martes, 25 de agosto de 2026') tal como se ve en timeZone.
export function formatLongDateInZone(instant: Date, timeZone: string, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(instant);
}

// Fecha de calendario ('YYYY-MM-DD') de "ahora" según timeZone.
export function todayDateStrInZone(timeZone: string, now: Date = new Date()): string {
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return formatDateStr({ year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) });
}

// Lunes de la semana ISO (lunes-domingo) que contiene dateStr.
export function mondayOfWeek(dateStr: string): string {
  const dow = dayOfWeekFromDateStr(dateStr); // 0=domingo..6=sábado
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateStr(dateStr, diffToMonday);
}
