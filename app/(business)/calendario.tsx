import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import {
  addDaysToDateStr,
  currentMonthStrInZone,
  dayMonthLabel,
  formatLongDateInZone,
  formatTimeInZone,
  mondayOfWeek,
  todayDateStrInZone,
  weekdayShortLabel,
  zonedTimeToUtc,
} from '@/lib/timezone';
import {
  fetchAppointmentsInRange,
  groupAppointmentsByDate,
  STATUS_COLORS,
  STATUS_LABELS,
  type AppointmentDetails,
} from '@/lib/appointments';
import { dayScheduleFromRange, fetchScheduleForRange, type RangeSchedule, type WorkingRange } from '@/lib/schedule';
import { computeAvailableSlots, type Slot } from '@/lib/availability';
import type { Appointment, AppointmentStatus, Business } from '@/types/database';

const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };

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
const COLOR_CLOSED_BG = '#f2f2f2';
const COLOR_FREE_BG = '#e8f5e9';
const COLOR_BLOCKED_BG = '#e5e5e5';

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
    <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 }}>
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
              borderColor: selected ? '#111' : '#ccc',
              backgroundColor: selected ? '#111' : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: selected ? '600' : '400', color: selected ? '#fff' : '#111' }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
          borderColor: '#eee',
          backgroundColor: dateStr === today ? '#eef2ff' : 'transparent',
        }}
      >
        <Text style={{ fontSize: 11, color: '#666' }}>{weekdayShortLabel(dateStr)}</Text>
        <Text style={{ fontSize: 14, fontWeight: '600' }}>{Number(dateStr.slice(8, 10))}</Text>
      </Pressable>

      <View style={{ height: totalHeight, position: 'relative', backgroundColor: COLOR_CLOSED_BG, borderLeftWidth: 1, borderColor: '#eee' }}>
        {hourMarks.map((m) => (
          <View
            key={m}
            style={{
              position: 'absolute',
              top: (m - gridBounds.startMin) * PX_PER_MINUTE,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: '#e0e0e0',
            }}
          />
        ))}

        {segments.map((seg, i) =>
          seg.available ? (
            <Pressable
              key={i}
              onPress={() => onNewAppointment(dateStr, minutesToHm(seg.startMin))}
              style={{
                position: 'absolute',
                top: (seg.startMin - gridBounds.startMin) * PX_PER_MINUTE,
                height: (seg.endMin - seg.startMin) * PX_PER_MINUTE,
                left: 0,
                right: 0,
                backgroundColor: COLOR_FREE_BG,
              }}
            />
          ) : (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: (seg.startMin - gridBounds.startMin) * PX_PER_MINUTE,
                height: (seg.endMin - seg.startMin) * PX_PER_MINUTE,
                left: 0,
                right: 0,
                backgroundColor: COLOR_BLOCKED_BG,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: '#ddd',
                borderStyle: 'dashed',
              }}
            />
          )
        )}

        {laned.map(({ appointment, lane }) => {
          const startMin = clamp(slotToMinutes(new Date(appointment.start_time), tz), gridBounds.startMin, gridBounds.endMin);
          const endMin = clamp(slotToMinutes(new Date(appointment.end_time), tz), gridBounds.startMin, gridBounds.endMin);
          if (endMin <= startMin) return null;
          const widthPct = 100 / totalLanes;
          return (
            <Pressable
              key={appointment.id}
              onPress={() => onOpenDay(dateStr)}
              style={{
                position: 'absolute',
                top: (startMin - gridBounds.startMin) * PX_PER_MINUTE,
                height: (endMin - startMin) * PX_PER_MINUTE,
                left: `${lane * widthPct}%`,
                width: `${widthPct}%`,
                backgroundColor: STATUS_COLORS[appointment.status],
                borderRadius: 4,
                borderWidth: 1,
                borderColor: '#fff',
                padding: 2,
                overflow: 'hidden',
              }}
            >
              <Text numberOfLines={2} style={{ fontSize: 10, color: '#fff', fontWeight: '600' }}>
                {formatTimeInZone(new Date(appointment.start_time), tz)} {appointment.clientName}
              </Text>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, -7))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600' }}>
            {dayMonthLabel(weekDays[0])} – {dayMonthLabel(weekDays[6])}
          </Text>
          {weekStart !== currentWeekStart && (
            <Pressable onPress={() => setWeekStart(currentWeekStart)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#1d4ed8' }}>Ir a esta semana</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, 7))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Pressable onPress={() => onNewAppointment(weekStart)} style={buttonStyle}>
          <Text style={buttonTextStyle}>+ Nueva cita</Text>
        </Pressable>
      </View>

      {loading && !rangeSchedule ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={{ color: 'crimson', padding: 16 }}>{error}</Text>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
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
                      color: '#666',
                    }}
                  >
                    {minutesToHm(m)}
                  </Text>
                ))}
              </View>
            </View>

            {isNarrow ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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

// Tanda 2: vista panorámica de mes (rejilla + indicador de ocupación por
// día, reutilizando monthGridCells de lib/timezone.ts). De momento, aviso
// para que el selector nunca lleve a una pantalla rota o en blanco.
function CalendarioMes() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: '#666', textAlign: 'center' }}>
        Vista mensual — próximamente.
      </Text>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, -1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', textTransform: 'capitalize' }}>{longDateLabel}</Text>
          {selectedDate !== today && (
            <Pressable onPress={() => setSelectedDate(today)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#1d4ed8' }}>Ir a hoy</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, 1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Pressable
          onPress={() => router.push({ pathname: '/(business)/cita', params: { date: selectedDate } })}
          style={buttonStyle}
        >
          <Text style={buttonTextStyle}>+ Nueva cita</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, padding: 16 }}>
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
                <View style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600' }}>
                      {formatTimeInZone(new Date(item.start_time), business.timezone)}–
                      {formatTimeInZone(new Date(item.end_time), business.timezone)}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[item.status] }}>
                      {STATUS_LABELS[item.status]}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14 }}>
                    {item.clientName}
                    {item.clientPhone ? ` · ${item.clientPhone}` : ''}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#666' }}>
                    {item.serviceName} · {item.price_at_booking} €
                  </Text>

                  {isConfirmingCancel ? (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: '#b91c1c' }}>¿Seguro que quieres cancelar esta cita?</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => handleChangeStatus(item.id, 'cancelled')}
                          disabled={isUpdating}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: '#b91c1c',
                          }}
                        >
                          <Text style={{ fontSize: 13, color: '#b91c1c' }}>
                            {isUpdating ? '…' : 'Sí, cancelar'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setConfirmingCancelId(null)}
                          disabled={isUpdating}
                          style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' }}
                        >
                          <Text style={{ fontSize: 13 }}>No, mantener</Text>
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
                              borderColor: action.destructive ? '#b91c1c' : '#ccc',
                            }}
                          >
                            <Text style={{ fontSize: 13, color: action.destructive ? '#b91c1c' : '#111' }}>
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
                            borderColor: '#ccc',
                          }}
                        >
                          <Text style={{ fontSize: 13 }}>Cambiar hora/servicio</Text>
                        </Pressable>
                      </View>
                    )
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text>No hay citas este día.</Text>}
          />
        )}

        {listError && <Text style={{ color: 'crimson', marginTop: 8 }}>{listError}</Text>}
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ViewSelector value={view} onChange={changeView} />
      {view === 'day' && (
        <CalendarioDia business={business} selectedDate={selectedDate} setSelectedDate={setSelectedDate} router={router} />
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
      {view === 'month' && <CalendarioMes />}
    </View>
  );
}
