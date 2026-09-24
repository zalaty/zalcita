import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import {
  addDaysToDateStr,
  addMonthsToMonthStr,
  currentMonthStrInZone,
  dayMonthLabel,
  formatLongDateInZone,
  formatTimeInZone,
  mondayOfWeek,
  monthGridCells,
  monthLabel,
  monthRangeUtc,
  todayDateStrInZone,
  weekdayShortLabel,
  zonedTimeToUtc,
} from '@/lib/timezone';
import {
  fetchAppointmentsInRange,
  groupAppointmentsByDate,
  type AppointmentDetails,
} from '@/lib/appointments';
import { APPOINTMENT_STATUS_PRESENTATION } from '@/lib/appointmentStatusPresentation';
import { theme } from '@/theme';
import { Badge, BADGE_TONE_STYLES, Screen } from '@/components/ui';
import {
  dayScheduleFromRange,
  fetchScheduleForRange,
  type DaySchedule,
  type RangeSchedule,
  type WorkingRange,
} from '@/lib/schedule';
import { computeAvailableSlots, type Slot } from '@/lib/availability';
import type { Appointment, AppointmentStatus, Business } from '@/types/database';

const buttonStyle = { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 8 };
const buttonTextStyle = { color: theme.colors.textOnPrimary, textAlign: 'center' as const, fontWeight: '600' as const };

// Columna de cabecera y de la vista Día: mismo ancho, mismo borde izquierdo
// (padding lateral lg dentro), para que título, selector y tarjetas queden a
// plomo. La cabecera mantiene este ancho en las 3 vistas (no salta al
// cambiar); solo el CUERPO de Semana/Mes se abre a ancho completo.
const COLUMN_STYLE = { width: '100%', maxWidth: theme.layout.panelMaxWidth, alignSelf: 'center' } as const;

const VIEW_STORAGE_KEY = '@zalcita/calendario_view';
type CalendarView = 'day' | 'week' | 'month';

function isCalendarView(value: string | null): value is CalendarView {
  return value === 'day' || value === 'week' || value === 'month';
}

// Rejilla de la vista Semana: granularidad de los huecos (misma unidad que
// los chips de minutos del selector de horarios.tsx), tamaño vertical y
// límites por defecto si el negocio aún no tiene horario configurado.
const GRID_GRANULARITY_MINUTES = 15;
const PX_PER_MINUTE = 1;
const HOUR_COL_WIDTH = 48;
const HEADER_HEIGHT = 44;
const DAY_COLUMN_WIDTH_NARROW = 120;
const NARROW_BREAKPOINT = 700;
const DEFAULT_GRID_BOUNDS = { startMin: 8 * 60, endMin: 20 * 60 };
// 1970: fuerza a computeAvailableSlots a no descartar huecos "ya pasados" —
// a diferencia del flujo de reserva, esta es una vista panorámica del
// dueño que también debe poder mirar hacia atrás (un lunes ya pasado de
// esta semana) sin que sus huecos desaparezcan solo por ser del pasado.
const EARLY_EPOCH = new Date(0);
// Mismo tono que loadClosed (vista Mes): "cerrado" = tono de fondo de
// página, en ambas vistas del calendario. Antes '#f2f2f2', valor propio sin
// pasar por el theme; background es visualmente indistinguible (diferencia
// de ~6/255 por canal, imperceptible en un fondo plano).
const COLOR_CLOSED_BG = theme.colors.background;
// Antes '#e5e5e5' suelto; disabledBg coincide casi exacto (~2/255 por canal).
const COLOR_BLOCKED_BG = theme.colors.disabledBg;
// Huecos libres: NUNCA verde — el estado "confirmed" ya usa verde oscuro
// (theme success, ver appointmentBlockAppearance), y un verde claro al lado se confundía
// con eso (poco contraste, además, para daltonismo). Blanco + borde
// punteado + etiqueta "Libre": la distinción libre/ocupado no depende del
// matiz de color en ningún punto.
const COLOR_FREE_BG = theme.colors.surface; // antes '#ffffff' suelto — mismo valor exacto
// SIN tokenizar a propósito (paso 1, modo oscuro): son un gris-azulado
// FRÍO, deliberadamente distinto de los grises cálidos del resto del theme
// (border/borderStrong/textMuted) — no hay token equivalente sin cambiar
// el aspecto. Ver reporte de la sesión que los dejó pendientes.
const COLOR_FREE_BORDER = '#64748b';
const COLOR_FREE_TEXT = '#334155';
// Bajo este alto en píxeles (PX_PER_MINUTE=1 -> px = minutos) la etiqueta
// "Libre" no cabe legible; el hueco sigue siendo distinguible por el borde
// punteado + el blanco solo.
const FREE_LABEL_MIN_HEIGHT = 18;

function hmToMinutes(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function minutesToHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function slotToMinutes(instant: Date, timeZone: string): number {
  return hmToMinutes(formatTimeInZone(instant, timeZone));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Límites del eje horario de la rejilla semanal: min/max de TODO el horario
// laboral del negocio (todos los días, no solo los de la semana visible),
// redondeado a la hora — así el eje no "salta" de tamaño entre semanas.
function computeGridBounds(workingHoursByDay: Map<number, WorkingRange[]>): { startMin: number; endMin: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const ranges of workingHoursByDay.values()) {
    for (const range of ranges) {
      min = Math.min(min, hmToMinutes(range.start_time));
      max = Math.max(max, hmToMinutes(range.end_time));
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return DEFAULT_GRID_BOUNDS;
  return { startMin: Math.floor(min / 60) * 60, endMin: Math.ceil(max / 60) * 60 };
}

interface MergedSegment {
  startMin: number;
  endMin: number;
  available: boolean;
}

// Fusiona slots de 15 min contiguos con la misma disponibilidad en
// rectángulos más grandes — solo afecta al render (menos nodos, y un
// rectángulo "libre" grande es más fácil de tocar que 15 min de alto).
function mergeConsecutiveSlots(slots: Slot[], timeZone: string): MergedSegment[] {
  const merged: MergedSegment[] = [];
  for (const slot of slots) {
    const startMin = slotToMinutes(slot.start, timeZone);
    const endMin = slotToMinutes(slot.end, timeZone);
    const last = merged[merged.length - 1];
    if (last && last.available === slot.available && last.endMin === startMin) {
      last.endMin = endMin;
    } else {
      merged.push({ startMin, endMin, available: slot.available });
    }
  }
  return merged;
}

interface LanedAppointment {
  appointment: AppointmentDetails;
  lane: number;
}

// Reparte las citas de un día en "carriles" (algoritmo clásico de
// particionado de intervalos: cada cita va al primer carril cuyo último
// ocupante ya haya terminado, o abre uno nuevo) para que dos citas
// solapadas del dueño (permitido, ver migración 0009) se pinten una al lado
// de la otra en vez de una encima de la otra. Comparar end_time/start_time
// como texto funciona porque Supabase devuelve ISO-8601 UTC consistente,
// que ordena igual lexicográfica que cronológicamente.
function assignLanes(dayAppointments: AppointmentDetails[]): { laned: LanedAppointment[]; totalLanes: number } {
  const sorted = [...dayAppointments].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const laneEndTimes: string[] = [];
  const laned: LanedAppointment[] = [];
  for (const appointment of sorted) {
    let lane = laneEndTimes.findIndex((end) => end <= appointment.start_time);
    if (lane === -1) {
      lane = laneEndTimes.length;
      laneEndTimes.push(appointment.end_time);
    } else {
      laneEndTimes[lane] = appointment.end_time;
    }
    laned.push({ appointment, lane });
  }
  return { laned, totalLanes: laneEndTimes.length || 1 };
}

function ViewSelector({ value, onChange }: { value: CalendarView; onChange: (v: CalendarView) => void }) {
  const options: { value: CalendarView; label: string }[] = [
    { value: 'day', label: 'Día' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: 0 }}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: selected ? theme.colors.primary : theme.colors.border,
              backgroundColor: selected ? theme.colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: selected ? '600' : '400',
                color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Mezcla `fg` sobre `bg` con peso `weight` (0..1) y devuelve un hex opaco.
// Se usa solo para derivar el fondo "apagado" de completada a partir del
// token del estado, sin introducir un hex nuevo.
function blendHex(fg: string, bg: string, weight: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [f, b] = [channels(fg), channels(bg)];
  return `#${f.map((v, i) => Math.round(v * weight + b[i] * (1 - weight)).toString(16).padStart(2, '0')).join('')}`;
}

interface BlockAppearance {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderWidth: number;
  strikeThrough: boolean;
}

// Apariencia del bloque de cita en la vista Semana. El estado se distingue
// por la FORMA/ESTRUCTURA del bloque, no por el matiz (WCAG 1.4.1); el color
// del estado (tono compartido, lib/appointmentStatusPresentation.ts) queda
// como refuerzo redundante:
//   confirmed -> RELLENO sólido saturado, sin marca extra (estado "normal")
//   pending   -> CONTORNO: fondo claro + borde grueso de color ("aún no en firme")
//   cancelled -> gris atenuado + TACHADO
//   completed -> relleno apagado (tinte medio del tono) + glifo ✓
//   no_show   -> relleno danger + glifo ✕
// Contrastes AA (texto/fondo): confirmed blanco/success 7.13, no_show
// blanco/danger 6.47, pending warning/warningSurface 4.75, cancelled
// textSecondary/disabledBg 6.08, completed textPrimary/tinte 9.78.
function appointmentBlockAppearance(status: AppointmentDetails['status']): BlockAppearance {
  const { tone, color } = APPOINTMENT_STATUS_PRESENTATION[status];
  const separator = theme.colors.surface;

  switch (status) {
    case 'confirmed':
    case 'no_show':
      return {
        backgroundColor: color,
        textColor: theme.colors.textOnPrimary,
        borderColor: separator,
        borderWidth: 1,
        strikeThrough: false,
      };
    case 'pending':
      return {
        backgroundColor: BADGE_TONE_STYLES[tone].bg,
        textColor: BADGE_TONE_STYLES[tone].text,
        borderColor: color,
        borderWidth: 2,
        strikeThrough: false,
      };
    case 'completed':
      return {
        backgroundColor: blendHex(color, theme.colors.surface, 0.35),
        textColor: theme.colors.textPrimary,
        borderColor: separator,
        borderWidth: 1,
        strikeThrough: false,
      };
    case 'cancelled':
      return {
        backgroundColor: BADGE_TONE_STYLES[tone].bg,
        textColor: BADGE_TONE_STYLES[tone].text,
        borderColor: theme.colors.borderStrong,
        borderWidth: 1,
        strikeThrough: true,
      };
  }
}

// Glifo ✓/✕ de completada/no-show: 14px (el texto del bloque es de 10) para
// que la señal no-cromática se lea a primera vista. Bajo COMPACT_BLOCK_MAX_HEIGHT
// (bloques de ~15 min) el bloque pasa a una sola línea sin padding vertical y
// el glifo se reduce solo lo justo para caber (alto del bloque - borde).
const GLYPH_MAX_SIZE = 14;
const COMPACT_BLOCK_MAX_HEIGHT = 20;

// Bajo este alto (px = minutos) no cabe una segunda línea con la etiqueta
// del estado; el estado sigue distinguiéndose por la forma del bloque.
const BLOCK_LABEL_MIN_HEIGHT = 44;

// Una columna de día de la vista Semana: cabecera (día + fecha, toca para
// abrir la vista Día) + rejilla con fondo libre/ocupado (computeAvailableSlots,
// MISMA función que disponibilidad.tsx/cita.tsx) y las citas reales encima.
function WeekDayColumn({
  dateStr,
  business,
  gridBounds,
  rangeSchedule,
  dayAppointments,
  columnStyle,
  onOpenDay,
  onNewAppointment,
}: {
  dateStr: string;
  business: Business;
  gridBounds: { startMin: number; endMin: number };
  rangeSchedule: RangeSchedule;
  dayAppointments: AppointmentDetails[];
  columnStyle: { width: number } | { flex: number };
  onOpenDay: (dateStr: string) => void;
  onNewAppointment: (dateStr: string, time: string) => void;
}) {
  const tz = business.timezone;
  const today = todayDateStrInZone(tz);
  const daySchedule = dayScheduleFromRange(rangeSchedule, dateStr, tz);
  // Solo pending/confirmed "ocupan" un hueco — mismo criterio que
  // findOverlappingAppointments en cita.tsx; cancelled/completed/no_show se
  // siguen pintando (informativo) pero no bloquean el fondo libre/ocupado.
  const activeAppointments = dayAppointments.filter((a) => a.status === 'pending' || a.status === 'confirmed');
  const rawSlots = daySchedule.fullDayClosed
    ? []
    : computeAvailableSlots({
        dateStr,
        timeZone: tz,
        workingRanges: daySchedule.workingRanges,
        blockedRanges: [
          ...daySchedule.exceptionBlockedRanges,
          ...activeAppointments.map((a) => ({ start: new Date(a.start_time), end: new Date(a.end_time) })),
        ],
        durationMinutes: GRID_GRANULARITY_MINUTES,
        now: EARLY_EPOCH,
      });
  const segments = mergeConsecutiveSlots(rawSlots, tz);
  const { laned, totalLanes } = assignLanes(dayAppointments);
  const totalHeight = (gridBounds.endMin - gridBounds.startMin) * PX_PER_MINUTE;
  const hourMarks: number[] = [];
  for (let m = gridBounds.startMin; m < gridBounds.endMin; m += 60) hourMarks.push(m);

  return (
    <View style={columnStyle}>
      <Pressable
        onPress={() => onOpenDay(dateStr)}
        style={{
          height: HEADER_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: dateStr === today ? theme.colors.primarySurface : 'transparent',
        }}
      >
        <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{weekdayShortLabel(dateStr)}</Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary }}>
          {Number(dateStr.slice(8, 10))}
        </Text>
      </Pressable>

      <View
        style={{
          height: totalHeight,
          position: 'relative',
          backgroundColor: COLOR_CLOSED_BG,
          borderLeftWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {hourMarks.map((m) => (
          <View
            key={m}
            style={{
              position: 'absolute',
              top: (m - gridBounds.startMin) * PX_PER_MINUTE,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: theme.colors.border,
            }}
          />
        ))}

        {segments.map((seg, i) => {
          const top = (seg.startMin - gridBounds.startMin) * PX_PER_MINUTE;
          const height = (seg.endMin - seg.startMin) * PX_PER_MINUTE;

          if (seg.available) {
            return (
              <Pressable
                key={i}
                onPress={() => onNewAppointment(dateStr, minutesToHm(seg.startMin))}
                style={{
                  position: 'absolute',
                  top,
                  height,
                  left: 0,
                  right: 0,
                  backgroundColor: COLOR_FREE_BG,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: COLOR_FREE_BORDER,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {height >= FREE_LABEL_MIN_HEIGHT && (
                  <Text style={{ fontSize: 9, fontWeight: '600', color: COLOR_FREE_TEXT }}>Libre</Text>
                )}
              </Pressable>
            );
          }

          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                top,
                height,
                left: 0,
                right: 0,
                backgroundColor: COLOR_BLOCKED_BG,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                borderStyle: 'dashed',
              }}
            />
          );
        })}

        {laned.map(({ appointment, lane }) => {
          const startMin = clamp(slotToMinutes(new Date(appointment.start_time), tz), gridBounds.startMin, gridBounds.endMin);
          const endMin = clamp(slotToMinutes(new Date(appointment.end_time), tz), gridBounds.startMin, gridBounds.endMin);
          if (endMin <= startMin) return null;
          const widthPct = 100 / totalLanes;
          const blockHeight = (endMin - startMin) * PX_PER_MINUTE;
          const presentation = APPOINTMENT_STATUS_PRESENTATION[appointment.status];
          const look = appointmentBlockAppearance(appointment.status);
          const startLabel = formatTimeInZone(new Date(appointment.start_time), tz);
          const compact = blockHeight < COMPACT_BLOCK_MAX_HEIGHT;
          // Con borde de 1px (los estados con glifo), el alto útil es
          // blockHeight - 2: el glifo usa el máximo que quepa hasta 14px.
          const glyphSize = Math.min(GLYPH_MAX_SIZE, blockHeight - 2);
          return (
            <Pressable
              key={appointment.id}
              onPress={() => onOpenDay(dateStr)}
              accessibilityRole="button"
              accessibilityLabel={`${startLabel} ${appointment.clientName}, ${presentation.label}`}
              style={{
                position: 'absolute',
                top: (startMin - gridBounds.startMin) * PX_PER_MINUTE,
                height: blockHeight,
                left: `${lane * widthPct}%`,
                width: `${widthPct}%`,
                backgroundColor: look.backgroundColor,
                borderRadius: 4,
                borderWidth: look.borderWidth,
                borderColor: look.borderColor,
                paddingHorizontal: 2,
                // En bloques de ~15 min el padding vertical se quita para que
                // quepa el glifo grande (ver GLYPH_MAX_SIZE).
                paddingVertical: compact ? 0 : 2,
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: compact ? 'center' : 'flex-start', gap: 3 }}>
                {presentation.glyph && (
                  // El glifo manda sobre el texto: tamaño fijo (nunca se
                  // encoge ni se trunca), el texto es lo que cede.
                  <Text
                    style={{
                      fontSize: glyphSize,
                      lineHeight: glyphSize,
                      fontWeight: '700',
                      color: look.textColor,
                      flexShrink: 0,
                    }}
                  >
                    {presentation.glyph}
                  </Text>
                )}
                <Text
                  numberOfLines={compact ? 1 : 2}
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: look.textColor,
                    fontWeight: '600',
                    textDecorationLine: look.strikeThrough ? 'line-through' : 'none',
                  }}
                >
                  {startLabel} {appointment.clientName}
                </Text>
              </View>
              {blockHeight >= BLOCK_LABEL_MIN_HEIGHT && (
                <Text numberOfLines={1} style={{ fontSize: 9, color: look.textColor }}>
                  {presentation.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CalendarioSemana({
  business,
  weekStart,
  setWeekStart,
  onOpenDay,
  onNewAppointment,
}: {
  business: Business;
  weekStart: string;
  setWeekStart: Dispatch<SetStateAction<string>>;
  onOpenDay: (dateStr: string) => void;
  onNewAppointment: (dateStr: string, time?: string) => void;
}) {
  const { width } = useWindowDimensions();
  const isNarrow = width < NARROW_BREAKPOINT;

  const [rangeSchedule, setRangeSchedule] = useState<RangeSchedule | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDetails[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo patrón que disponibilidad.tsx/horarios.tsx: useCallback +
  // useFocusEffect, para recargar al cambiar de semana y también al
  // recuperar el foco de la pestaña.
  const fetchWeek = useCallback(() => {
    if (!business || !weekStart) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const weekEndExclusive = addDaysToDateStr(weekStart, 7);
      const startUtc = zonedTimeToUtc(weekStart, '00:00', business.timezone);
      const endUtc = zonedTimeToUtc(weekEndExclusive, '00:00', business.timezone);

      const [scheduleRes, appointmentsRes] = await Promise.all([
        fetchScheduleForRange(business.id, weekStart, weekEndExclusive),
        fetchAppointmentsInRange(business.id, startUtc, endUtc),
      ]);

      if (cancelled) return;
      if (scheduleRes.error || appointmentsRes.error) {
        setError('No se pudo cargar la agenda de la semana.');
        setLoading(false);
        return;
      }
      setRangeSchedule(scheduleRes.data);
      setAppointments(appointmentsRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, weekStart]);

  useFocusEffect(fetchWeek);

  const today = todayDateStrInZone(business.timezone);
  const currentWeekStart = mondayOfWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));
  const gridBounds = rangeSchedule ? computeGridBounds(rangeSchedule.workingHoursByDay) : DEFAULT_GRID_BOUNDS;
  const apptsByDate = appointments ? groupAppointmentsByDate(appointments, business.timezone) : new Map<string, AppointmentDetails[]>();
  const hourMarks: number[] = [];
  for (let m = gridBounds.startMin; m < gridBounds.endMin; m += 60) hourMarks.push(m);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={COLUMN_STYLE}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg }}>
        <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, -7))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textPrimary }}>
            {dayMonthLabel(weekDays[0])} – {dayMonthLabel(weekDays[6])}
          </Text>
          {weekStart !== currentWeekStart && (
            <Pressable onPress={() => setWeekStart(currentWeekStart)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: theme.colors.primary }}>Ir a esta semana</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, 7))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>›</Text>
        </Pressable>
      </View>
      </View>
      </View>

      <View style={COLUMN_STYLE}>
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
          <Pressable onPress={() => onNewAppointment(weekStart)} style={buttonStyle}>
            <Text style={buttonTextStyle}>+ Nueva cita</Text>
          </Pressable>
        </View>
      </View>

      {loading && !rangeSchedule ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={{ color: theme.colors.danger, padding: theme.spacing.lg }}>{error}</Text>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: HOUR_COL_WIDTH }}>
              <View style={{ height: HEADER_HEIGHT }} />
              <View style={{ height: (gridBounds.endMin - gridBounds.startMin) * PX_PER_MINUTE, position: 'relative' }}>
                {hourMarks.map((m) => (
                  <Text
                    key={m}
                    style={{
                      position: 'absolute',
                      top: (m - gridBounds.startMin) * PX_PER_MINUTE - 6,
                      right: 4,
                      fontSize: 11,
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {minutesToHm(m)}
                  </Text>
                ))}
              </View>
            </View>

            {isNarrow ? (
              // flex: 1 es la parte que faltaba: sin una dimensión propia,
              // un ScrollView anidado en React Native Web se limita a
              // encoger/crecer a su CONTENIDO (aquí, 7×120px) en vez de
              // quedarse acotado al hueco restante de la fila — así nunca
              // desborda internamente y no hay nada que arrastrar; el
              // ScrollView exterior (solo vertical) recorta el resto sin
              // dar forma de llegar a él. Con flex: 1 este ScrollView SÍ
              // queda acotado al ancho disponible junto a la columna de
              // horas, y su contenido (más ancho) pasa a desbordar DENTRO
              // de él, que es lo que lo hace deslizable.
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row' }}>
                  {weekDays.map((dateStr) => (
                    <WeekDayColumn
                      key={dateStr}
                      dateStr={dateStr}
                      business={business}
                      gridBounds={gridBounds}
                      rangeSchedule={rangeSchedule ?? { workingHoursByDay: new Map(), exceptionsByDate: new Map() }}
                      dayAppointments={apptsByDate.get(dateStr) ?? []}
                      columnStyle={{ width: DAY_COLUMN_WIDTH_NARROW }}
                      onOpenDay={onOpenDay}
                      onNewAppointment={onNewAppointment}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={{ flexDirection: 'row', flex: 1 }}>
                {weekDays.map((dateStr) => (
                  <WeekDayColumn
                    key={dateStr}
                    dateStr={dateStr}
                    business={business}
                    gridBounds={gridBounds}
                    rangeSchedule={rangeSchedule ?? { workingHoursByDay: new Map(), exceptionsByDate: new Map() }}
                    dayAppointments={apptsByDate.get(dateStr) ?? []}
                    columnStyle={{ flex: 1 }}
                    onOpenDay={onOpenDay}
                    onNewAppointment={onNewAppointment}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const WEEKDAY_HEADER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// En escritorio (mismo NARROW_BREAKPOINT que la vista Semana) cada celda
// muestra hasta 3 citas en línea ("10:00 Ana") antes de un "+N más" — 3
// líneas de 10px caben con margen dentro de WIDE_CELL_MIN_HEIGHT. En móvil
// no se usa: la celda vuelve al comportamiento actual (solo número).
const MAX_VISIBLE_APPOINTMENTS_WIDE = 3;
const WIDE_CELL_MIN_HEIGHT = 92;

type DayLoadStatus = 'closed' | 'free' | 'partial' | 'full';

// Carga del día = LUMINOSIDAD, no matiz: escala monocroma teal (tokens
// load* del theme, más oscuro = más lleno). `closed` queda fuera de la
// escala (sin relleno, borde discontinuo). NUNCA la única señal: en la celda
// siempre hay el nº de citas o "–" (ver más abajo). COLOR_CLOSED_BG NO se usa
// aquí: es el gris de las columnas cerradas de Semana y se queda como está.
const DAY_STATUS_BG: Record<DayLoadStatus, string> = {
  closed: theme.colors.loadClosed,
  free: theme.colors.loadFree,
  partial: theme.colors.loadPartial,
  full: theme.colors.loadFull,
};
// Color del contenido de la celda por paso (AA verificado en theme/colors.ts).
const DAY_STATUS_TEXT: Record<DayLoadStatus, string> = {
  closed: theme.colors.textSecondary,
  free: theme.colors.textPrimary,
  partial: theme.colors.textPrimary,
  full: theme.colors.textOnLoadFull,
};
// Orden claro -> oscuro de la escala (sin "closed", que va aparte).
const LOAD_SCALE: DayLoadStatus[] = ['free', 'partial', 'full'];
const LEGEND_STEP_WIDTH = 72;
const DAY_STATUS_LABEL: Record<DayLoadStatus, string> = {
  closed: 'Cerrado',
  free: 'Libre',
  partial: 'Con huecos',
  full: 'Completo',
};

// Mismo criterio que WeekDayColumn (computeAvailableSlots a 15 min, con
// EARLY_EPOCH para no marcar "completo" un día pasado solo por estarlo) —
// aquí solo se agrega a un estado panorámico por día en vez de pintar cada
// hueco.
function computeDayLoad(
  dateStr: string,
  timeZone: string,
  daySchedule: DaySchedule,
  dayAppointments: AppointmentDetails[]
): { status: DayLoadStatus; activeCount: number } {
  const activeAppointments = dayAppointments.filter((a) => a.status === 'pending' || a.status === 'confirmed');

  if (daySchedule.fullDayClosed || daySchedule.workingRanges.length === 0) {
    return { status: 'closed', activeCount: activeAppointments.length };
  }

  const slots = computeAvailableSlots({
    dateStr,
    timeZone,
    workingRanges: daySchedule.workingRanges,
    blockedRanges: [
      ...daySchedule.exceptionBlockedRanges,
      ...activeAppointments.map((a) => ({ start: new Date(a.start_time), end: new Date(a.end_time) })),
    ],
    durationMinutes: GRID_GRANULARITY_MINUTES,
    now: EARLY_EPOCH,
  });
  const freeCount = slots.filter((s) => s.available).length;

  if (freeCount === 0) return { status: 'full', activeCount: activeAppointments.length };
  if (activeAppointments.length === 0) return { status: 'free', activeCount: 0 };
  return { status: 'partial', activeCount: activeAppointments.length };
}

interface MonthCell {
  dateStr: string;
  inMonth: boolean;
}

// monthGridCells (lib/timezone.ts) solo rellena huecos de ALINEACIÓN al
// principio (con null) para el selector de fecha de horarios.tsx, que no
// necesita mostrar días de otro mes. La vista Mes del calendario sí — así
// que aquí se completa esa rejilla con fechas reales de los meses vecino
// (antes y después) hasta cerrar semanas completas, sin tocar la función
// compartida ni su otro consumidor.
function buildMonthCells(monthStr: string): MonthCell[] {
  const rawCells = monthGridCells(monthStr);
  let leadingCount = 0;
  while (rawCells[leadingCount] === null) leadingCount++;
  const realDates = rawCells.filter((c): c is string => c !== null);

  const firstOfMonth = `${monthStr}-01`;
  const lastOfMonth = realDates[realDates.length - 1];
  const leadingDates = Array.from({ length: leadingCount }, (_, i) => addDaysToDateStr(firstOfMonth, i - leadingCount));

  const totalSoFar = leadingCount + realDates.length;
  const trailingCount = (7 - (totalSoFar % 7)) % 7;
  const trailingDates = Array.from({ length: trailingCount }, (_, i) => addDaysToDateStr(lastOfMonth, i + 1));

  return [
    ...leadingDates.map((dateStr) => ({ dateStr, inMonth: false })),
    ...realDates.map((dateStr) => ({ dateStr, inMonth: true })),
    ...trailingDates.map((dateStr) => ({ dateStr, inMonth: false })),
  ];
}

function CalendarioMes({
  business,
  monthStr,
  setMonthStr,
  onOpenDay,
}: {
  business: Business;
  monthStr: string;
  setMonthStr: Dispatch<SetStateAction<string>>;
  onOpenDay: (dateStr: string) => void;
}) {
  // Mismo umbral que CalendarioSemana (NARROW_BREAKPOINT): en escritorio se
  // listan citas dentro de la celda, en móvil no cabe y se cae al
  // comportamiento actual (solo número + color).
  const { width } = useWindowDimensions();
  const isNarrow = width < NARROW_BREAKPOINT;

  const [rangeSchedule, setRangeSchedule] = useState<RangeSchedule | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDetails[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo patrón que CalendarioSemana: useCallback + useFocusEffect, un
  // solo fetchScheduleForRange/fetchAppointmentsInRange para TODO el mes
  // (no por día) y recarga al cambiar de mes o recuperar el foco.
  const fetchMonth = useCallback(() => {
    if (!business || !monthStr) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const nextMonthStr = addMonthsToMonthStr(monthStr, 1);
      const monthStartDate = `${monthStr}-01`;
      const monthEndDateExclusive = `${nextMonthStr}-01`;
      const { startUtc, endUtc } = monthRangeUtc(monthStr, business.timezone);

      const [scheduleRes, appointmentsRes] = await Promise.all([
        fetchScheduleForRange(business.id, monthStartDate, monthEndDateExclusive),
        fetchAppointmentsInRange(business.id, startUtc, endUtc),
      ]);

      if (cancelled) return;
      if (scheduleRes.error || appointmentsRes.error) {
        setError('No se pudo cargar el resumen del mes.');
        setLoading(false);
        return;
      }
      setRangeSchedule(scheduleRes.data);
      setAppointments(appointmentsRes.data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, monthStr]);

  useFocusEffect(fetchMonth);

  const today = todayDateStrInZone(business.timezone);
  const currentMonthStr = currentMonthStrInZone(business.timezone);
  const cells = buildMonthCells(monthStr);
  const effectiveSchedule: RangeSchedule = rangeSchedule ?? { workingHoursByDay: new Map(), exceptionsByDate: new Map() };
  const apptsByDate = appointments
    ? groupAppointmentsByDate(appointments, business.timezone)
    : new Map<string, AppointmentDetails[]>();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <View style={COLUMN_STYLE}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: theme.spacing.lg }}>
        <Pressable onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, -1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', textTransform: 'capitalize', color: theme.colors.textPrimary }}>
            {monthLabel(monthStr)}
          </Text>
          {monthStr !== currentMonthStr && (
            <Pressable onPress={() => setMonthStr(currentMonthStr)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: theme.colors.primary }}>Ir a este mes</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, 1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>›</Text>
        </Pressable>
      </View>
      </View>
      </View>

      {loading && !rangeSchedule ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={{ color: theme.colors.danger, padding: theme.spacing.lg }}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAY_HEADER.map((d, i) => (
              <Text
                key={i}
                style={{
                  width: `${100 / 7}%`,
                  textAlign: 'center',
                  fontSize: 11,
                  color: theme.colors.textSecondary,
                  fontWeight: '600',
                }}
              >
                {d}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map(({ dateStr, inMonth }) => {
              const cellWrapperStyle = isNarrow
                ? { width: `${100 / 7}%` as const, aspectRatio: 1, padding: 2 }
                : { width: `${100 / 7}%` as const, minHeight: WIDE_CELL_MIN_HEIGHT, padding: 2 };

              if (!inMonth) {
                return (
                  <Pressable key={dateStr} onPress={() => onOpenDay(dateStr)} style={cellWrapperStyle}>
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: 0.35 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>{Number(dateStr.slice(8, 10))}</Text>
                    </View>
                  </Pressable>
                );
              }

              const daySchedule = dayScheduleFromRange(effectiveSchedule, dateStr, business.timezone);
              const dayAppointments = apptsByDate.get(dateStr) ?? [];
              const { status, activeCount } = computeDayLoad(dateStr, business.timezone, daySchedule, dayAppointments);
              const isToday = dateStr === today;
              // Pasado = ESTRICTAMENTE antes de hoy (misma `today` que el
              // marcador de "hoy", en la zona horaria del negocio). Un día
              // pasado ABIERTO sale de la escala de carga (neutro sólido); si
              // además estaba cerrado conserva el tratamiento de cerrado.
              // Solo presentación: `status` (computeDayLoad) no cambia.
              const isPast = dateStr < today;
              const pastOpen = isPast && status !== 'closed';
              const cellBackground = pastOpen ? theme.colors.loadPast : DAY_STATUS_BG[status];
              const textColor = pastOpen ? theme.colors.textPrimary : DAY_STATUS_TEXT[status];
              const dayNumber = Number(dateStr.slice(8, 10));
              const citasLabel = activeCount === 1 ? '1 cita' : `${activeCount} citas`;
              const cellLabel = isPast
                ? `${dayNumber}, pasado${status === 'closed' ? ', cerrado' : ''}${activeCount > 0 ? `, ${citasLabel}` : ''}`
                : `${dayNumber}, ${DAY_STATUS_LABEL[status]}${
                    status !== 'closed' && activeCount > 0 ? `, ${citasLabel}` : ''
                  }${isToday ? ', hoy' : ''}`;

              // Solo para el listado de escritorio — no toca el cálculo de
              // "carga" (computeDayLoad, sin cambios): vuelve a filtrar las
              // mismas citas activas del día para mostrarlas ordenadas por
              // hora, cortando a MAX_VISIBLE_APPOINTMENTS_WIDE.
              const previewAppointments = isNarrow
                ? []
                : dayAppointments
                    .filter((a) => a.status === 'pending' || a.status === 'confirmed')
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .slice(0, MAX_VISIBLE_APPOINTMENTS_WIDE);
              const hiddenCount = Math.max(0, activeCount - previewAppointments.length);

              return (
                <View key={dateStr} style={cellWrapperStyle}>
                  <Pressable
                    onPress={() => onOpenDay(dateStr)}
                    accessibilityRole="button"
                    accessibilityLabel={cellLabel}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      backgroundColor: cellBackground,
                      // Cerrado: sin relleno + borde discontinuo (estructura,
                      // no solo tono) para no confundirse con "libre".
                      borderWidth: status === 'closed' ? 1 : 0,
                      borderStyle: 'dashed',
                      borderColor: theme.colors.borderStrong,
                      padding: 4,
                    }}
                  >
                    {/* Marcador de "hoy": disco blanco con anillo oscuro
                        alrededor del número — se ve igual sobre cualquier paso
                        de la escala (blanco vs paso más oscuro 7.6:1) y sobre
                        cerrado, sin depender de teal-sobre-teal. */}
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        alignSelf: 'flex-start',
                        backgroundColor: isToday ? theme.colors.surface : 'transparent',
                        borderWidth: isToday ? 2 : 0,
                        borderColor: theme.colors.textPrimary,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: isToday ? theme.colors.textPrimary : textColor,
                        }}
                      >
                        {dayNumber}
                      </Text>
                    </View>
                    {status === 'closed' ? (
                      <>
                        <Text style={{ fontSize: 11, color: textColor }}>–</Text>
                        {!isNarrow && <Text style={{ fontSize: 10, color: textColor }}>Cerrado</Text>}
                      </>
                    ) : isNarrow ? (
                      activeCount > 0 && (
                        <Text style={{ fontSize: 11, fontWeight: '600', color: textColor }}>{activeCount}</Text>
                      )
                    ) : (
                      <View style={{ marginTop: 2, gap: 1 }}>
                        {previewAppointments.map((a) => (
                          <Text key={a.id} numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 10, color: textColor }}>
                            {formatTimeInZone(new Date(a.start_time), business.timezone)} {a.clientName}
                          </Text>
                        ))}
                        {hiddenCount > 0 && (
                          <Text style={{ fontSize: 10, fontWeight: '600', color: textColor }}>+{hiddenCount} más</Text>
                        )}
                      </View>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Leyenda: la carga es una ESCALA (degradado vacío -> lleno, claro ->
              oscuro) y solo vale de hoy en adelante; "Cerrado" y "Pasado" van
              aparte porque están fuera de ella. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 24, rowGap: 12, marginTop: 16 }}>
            <View>
              <View style={{ flexDirection: 'row', borderRadius: 4, overflow: 'hidden' }}>
                {LOAD_SCALE.map((status) => (
                  <View key={status} style={{ width: LEGEND_STEP_WIDTH, height: 12, backgroundColor: DAY_STATUS_BG[status] }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                {LOAD_SCALE.map((status) => (
                  <Text
                    key={status}
                    style={{ width: LEGEND_STEP_WIDTH, textAlign: 'center', fontSize: 12, color: theme.colors.textSecondary }}
                  >
                    {DAY_STATUS_LABEL[status]}
                  </Text>
                ))}
              </View>
            </View>
            <View>
              <View
                style={{
                  width: LEGEND_STEP_WIDTH,
                  height: 12,
                  borderRadius: 4,
                  backgroundColor: DAY_STATUS_BG.closed,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: theme.colors.borderStrong,
                }}
              />
              <Text
                style={{
                  width: LEGEND_STEP_WIDTH,
                  textAlign: 'center',
                  marginTop: 4,
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                }}
              >
                {DAY_STATUS_LABEL.closed}
              </Text>
            </View>
            <View>
              <View
                style={{ width: LEGEND_STEP_WIDTH, height: 12, borderRadius: 4, backgroundColor: theme.colors.loadPast }}
              />
              <Text
                style={{
                  width: LEGEND_STEP_WIDTH,
                  textAlign: 'center',
                  marginTop: 4,
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                }}
              >
                Pasado
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

interface StatusAction {
  label: string;
  nextStatus: AppointmentStatus;
  destructive?: boolean;
}

// Deriva las transiciones válidas solo del estado ACTUAL de la cita — así
// nunca se ofrece, por ejemplo, "confirmar" sobre una cita ya cancelada.
// cancelled/completed/no_show son estados finales: sin acciones, solo lectura.
function availableActions(status: AppointmentStatus): StatusAction[] {
  if (status === 'pending') {
    return [
      { label: 'Confirmar', nextStatus: 'confirmed' },
      { label: 'Cancelar', nextStatus: 'cancelled', destructive: true },
    ];
  }
  if (status === 'confirmed') {
    return [
      { label: 'Marcar completada', nextStatus: 'completed' },
      { label: 'Marcar no-show', nextStatus: 'no_show' },
      { label: 'Cancelar', nextStatus: 'cancelled', destructive: true },
    ];
  }
  return [];
}

// Vista Día — la que ya existía, sin cambios de comportamiento: solo pasa a
// recibir `selectedDate` y su setter como props (los controla el
// contenedor `Calendario`) en vez de tener su propio estado, para que
// cambiar a Semana/Mes y volver no pierda el día en el que estaba el dueño.
function CalendarioDia({
  business,
  selectedDate,
  setSelectedDate,
  router,
}: {
  business: Business;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  router: ReturnType<typeof useRouter>;
}) {
  const [appointments, setAppointments] = useState<AppointmentDetails[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  const fetchDay = useCallback(() => {
    if (!business || !selectedDate) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);

    (async () => {
      const dayStartUtc = zonedTimeToUtc(selectedDate, '00:00', business.timezone);
      const dayEndUtc = zonedTimeToUtc(addDaysToDateStr(selectedDate, 1), '00:00', business.timezone);
      const { data, error } = await fetchAppointmentsInRange(business.id, dayStartUtc, dayEndUtc);

      if (cancelled) return;
      if (error) {
        setListError('No se pudieron cargar las citas.');
        setLoading(false);
        return;
      }
      setAppointments(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, selectedDate]);

  useFocusEffect(fetchDay);

  async function handleChangeStatus(appointmentId: string, nextStatus: AppointmentStatus) {
    setListError(null);
    setUpdatingId(appointmentId);

    const patch: Partial<Appointment> =
      nextStatus === 'cancelled' ? { status: 'cancelled', cancelled_at: new Date().toISOString() } : { status: nextStatus };

    const { error } = await supabase.from('appointments').update(patch).eq('id', appointmentId);

    setUpdatingId(null);
    if (error) {
      setListError('No se pudo actualizar la cita.');
      return;
    }
    setConfirmingCancelId(null);
    fetchDay();
  }

  const today = todayDateStrInZone(business.timezone);
  const dayStartUtc = zonedTimeToUtc(selectedDate, '00:00', business.timezone);
  const longDateLabel = formatLongDateInZone(dayStartUtc, business.timezone);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: theme.spacing.lg,
          borderBottomWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, -1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', textTransform: 'capitalize', color: theme.colors.textPrimary }}>
            {longDateLabel}
          </Text>
          {selectedDate !== today && (
            <Pressable onPress={() => setSelectedDate(today)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: theme.colors.primary }}>Ir a hoy</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, 1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18, color: theme.colors.textPrimary }}>›</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }}>
        <Pressable
          onPress={() => router.push({ pathname: '/(business)/cita', params: { date: selectedDate } })}
          style={buttonStyle}
        >
          <Text style={buttonTextStyle}>+ Nueva cita</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, padding: theme.spacing.lg }}>
        {loading && !appointments ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={appointments ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const actions = availableActions(item.status);
              const isUpdating = updatingId === item.id;
              const isConfirmingCancel = confirmingCancelId === item.id;

              return (
                <View
                  style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, gap: 6 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary }}>
                      {formatTimeInZone(new Date(item.start_time), business.timezone)}–
                      {formatTimeInZone(new Date(item.end_time), business.timezone)}
                    </Text>
                    <Badge
                      label={APPOINTMENT_STATUS_PRESENTATION[item.status].label}
                      tone={APPOINTMENT_STATUS_PRESENTATION[item.status].tone}
                    />
                  </View>
                  <Text style={{ fontSize: 14, color: theme.colors.textPrimary }}>
                    {item.clientName}
                    {item.clientPhone ? ` · ${item.clientPhone}` : ''}
                  </Text>
                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                    {item.serviceName} · {item.price_at_booking} €
                  </Text>

                  {isConfirmingCancel ? (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: theme.colors.danger }}>
                        ¿Seguro que quieres cancelar esta cita?
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => handleChangeStatus(item.id, 'cancelled')}
                          disabled={isUpdating}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: theme.colors.danger,
                          }}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.danger }}>
                            {isUpdating ? '…' : 'Sí, cancelar'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmingCancelId(null)}
                          disabled={isUpdating}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: theme.colors.primary,
                          }}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.primary }}>No, mantener</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    actions.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {actions.map((action) => (
                          <Pressable
                            key={action.nextStatus}
                            onPress={() =>
                              action.destructive ? setConfirmingCancelId(item.id) : handleChangeStatus(item.id, action.nextStatus)
                            }
                            disabled={isUpdating}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: action.destructive ? theme.colors.danger : theme.colors.primary,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: action.destructive ? theme.colors.danger : theme.colors.primary,
                              }}
                            >
                              {isUpdating ? '…' : action.label}
                            </Text>
                          </Pressable>
                        ))}
                        <Pressable
                          onPress={() => router.push({ pathname: '/(business)/cita', params: { appointment_id: item.id } })}
                          disabled={isUpdating}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: theme.colors.primary,
                          }}
                        >
                          <Text style={{ fontSize: 13, color: theme.colors.primary }}>Cambiar hora/servicio</Text>
                        </Pressable>
                      </View>
                    )
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: theme.colors.textSecondary }}>No hay citas este día.</Text>
            }
          />
        )}

        {listError && <Text style={{ color: theme.colors.danger, marginTop: 8 }}>{listError}</Text>}
      </View>
    </View>
  );
}

export default function Calendario() {
  const router = useRouter();
  const { business } = useBusiness();

  const [view, setView] = useState<CalendarView>('day');
  const [selectedDate, setSelectedDate] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [monthStr, setMonthStr] = useState('');

  // Última vista elegida, recordada entre sesiones — una sola clave en
  // AsyncStorage (la misma librería que ya usa lib/supabase.ts para la
  // sesión, sin añadir nada nuevo). Se lee una vez al montar; si falla o no
  // hay nada guardado, se queda en 'day' (valor inicial del estado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(VIEW_STORAGE_KEY);
        if (!cancelled && isCalendarView(stored)) setView(stored);
      } catch {
        // Almacenamiento no disponible (p.ej. navegador con storage
        // bloqueado) — no es crítico, se queda en la vista por defecto.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function changeView(next: CalendarView) {
    setView(next);
    AsyncStorage.setItem(VIEW_STORAGE_KEY, next).catch(() => {});
  }

  // Cursor de fecha de cada vista: se inicializa a "hoy" (o la semana/mes
  // que lo contiene) la primera vez que hay negocio disponible; a partir de
  // ahí cada vista navega con ‹/› sin que este efecto la vuelva a tocar
  // (guard !selectedDate/!weekStart/!monthStr, mismo patrón que el resto
  // del proyecto). Al estar en el contenedor y no en cada vista, cambiar de
  // Semana a Día y volver conserva la semana en la que estaba el dueño.
  useEffect(() => {
    if (!business) return;
    const today = todayDateStrInZone(business.timezone);
    if (!selectedDate) setSelectedDate(today);
    if (!weekStart) setWeekStart(mondayOfWeek(today));
    if (!monthStr) setMonthStr(currentMonthStrInZone(business.timezone));
  }, [business, selectedDate, weekStart, monthStr]);

  function goToDay(dateStr: string) {
    setSelectedDate(dateStr);
    changeView('day');
  }

  function newAppointment(dateStr: string, time?: string) {
    router.push({ pathname: '/(business)/cita', params: time ? { date: dateStr, time } : { date: dateStr } });
  }

  if (!business || !selectedDate || !weekStart || !monthStr) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={COLUMN_STYLE}>
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
          <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
            Calendario
          </Text>
        </View>
        <ViewSelector value={view} onChange={changeView} />
      </View>
      {view === 'day' && (
        // Vista Día: es una lista, no una rejilla — se acota a la misma
        // columna que la cabecera (panelMaxWidth). Semana y Mes se quedan a
        // ancho completo (son rejillas densas), sin este límite.
        <View style={{ flex: 1, ...COLUMN_STYLE }}>
          <CalendarioDia business={business} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
        </View>
      )}
      {view === 'week' && (
        <CalendarioSemana
          business={business}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
          onOpenDay={goToDay}
          onNewAppointment={newAppointment}
        />
      )}
      {view === 'month' && (
        <CalendarioMes business={business} monthStr={monthStr} setMonthStr={setMonthStr} onOpenDay={goToDay} />
      )}
    </Screen>
  );
}
