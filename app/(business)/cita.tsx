import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { computeAvailableSlots, type Slot } from '@/lib/availability';
import { fetchDaySchedule, type DaySchedule } from '@/lib/schedule';
import { fetchAppointmentsInRange, type AppointmentDetails } from '@/lib/appointments';
import {
  addDaysToDateStr,
  dayOfWeekFromDateStr,
  formatLongDateInZone,
  formatTimeInZone,
  todayDateStrInZone,
  zonedTimeToUtc,
} from '@/lib/timezone';
import { useTheme } from '@/context/ThemeContext';
import { Button, Input, Screen } from '@/components/ui';

// Mismo patrón que ajustes/datos.tsx: email opcional, solo se valida si trae algo.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ClientOption {
  id: string;
  name: string;
  phone: string;
}

interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  active: boolean;
}

function timeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// ¿[startUtc, endUtc) cabe ENTERO dentro de algún tramo de horario laboral
// de ese día? (no basta con solapar: si empieza dentro pero acaba después
// del cierre, también cuenta como "fuera de horario").
function isWithinAnyWorkingRange(
  startUtc: Date,
  endUtc: Date,
  dateStr: string,
  timeZone: string,
  ranges: { start_time: string; end_time: string }[]
): boolean {
  return ranges.some((r) => {
    const rangeStart = zonedTimeToUtc(dateStr, r.start_time.slice(0, 5), timeZone);
    const rangeEnd = zonedTimeToUtc(dateStr, r.end_time.slice(0, 5), timeZone);
    return startUtc >= rangeStart && endUtc <= rangeEnd;
  });
}

function overlapsAnyRange(startUtc: Date, endUtc: Date, ranges: { start: Date; end: Date }[]): boolean {
  return ranges.some((r) => startUtc < r.end && endUtc > r.start);
}

function findOverlappingAppointments(
  startUtc: Date,
  endUtc: Date,
  appointments: AppointmentDetails[],
  excludeId?: string
): AppointmentDetails[] {
  return appointments.filter((a) => {
    if (a.id === excludeId) return false;
    if (a.status !== 'pending' && a.status !== 'confirmed') return false;
    const aStart = new Date(a.start_time);
    const aEnd = new Date(a.end_time);
    return startUtc < aEnd && endUtc > aStart;
  });
}

// Crear cita manual + mover cita existente, en una sola pantalla: sin
// appointment_id es "crear" (con selección de cliente), con appointment_id
// es "mover" (cliente fijo, se puede cambiar servicio/hora). Comparten toda
// la lógica de selección de hora con aviso — es justo lo que no se quería
// duplicar entre las dos.
//
// Libertad "flexible con aviso" (decisión de producto): la rejilla-guía usa
// computeAvailableSlots, la MISMA función que disponibilidad.tsx, pero aquí
// TODOS los huecos son pulsables (libres u ocupados) y además se puede
// escribir cualquier hora a mano. Antes de confirmar se avisa si la hora
// elegida queda fuera de horario, cae en una excepción/cierre, o solapa
// otra cita — pero nunca bloquea: la migración 0009 hace que el trigger de
// solape dé paso libre a cualquier escritura hecha por un miembro del
// negocio, sea cual sea la hora.
export default function Cita() {
  const theme = useTheme();
  // useTheme() solo puede llamarse dentro de un componente, así que estos
  // estilos (antes constantes a nivel de módulo con hex sueltos) pasan a
  // calcularse aquí — mismo patrón que ajustes/index.tsx.
  const sectionTitleStyle = { ...theme.textStyles.heading2, color: theme.colors.textPrimary };
  const rowStyle = {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  };
  const router = useRouter();
  const { business } = useBusiness();
  const {
    appointment_id: appointmentId,
    date: dateParam,
    time: timeParam,
  } = useLocalSearchParams<{
    appointment_id?: string;
    date?: string;
    time?: string;
  }>();

  const isEdit = !!appointmentId;

  const [initialLoading, setInitialLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Esta pantalla es un Tabs.Screen con href:null (igual que disponibilidad/
  // confirmacion en el lado cliente): expo-router NO la desmonta entre
  // navegaciones, así que el estado del formulario sobrevive de una visita
  // a la siguiente. Sin esta ref, un guard tipo "solo la primera vez"
  // (!selectedDate, useState(isEdit)...) se queda pegado al primer valor y
  // nunca vuelve a sincronizar con un `date`/`appointment_id` nuevo — esa
  // fue la causa real de crear una cita en el día equivocado. Mismo patrón
  // que resolvedForRef en confirmacion.tsx: se guarda la clave de la
  // navegación ya resuelta, y solo se reinicia el formulario cuando esa
  // clave cambia de verdad.
  const resolvedForRef = useRef<string | undefined>(undefined);

  // Cliente
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [savingNewClient, setSavingNewClient] = useState(false);
  const [newClientError, setNewClientError] = useState<string | null>(null);

  // Servicio
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);

  // Fecha y hora
  const [selectedDate, setSelectedDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [daySchedule, setDaySchedule] = useState<DaySchedule | null>(null);
  const [dayAppointments, setDayAppointments] = useState<AppointmentDetails[] | null>(null);
  const [loadingGuide, setLoadingGuide] = useState(false);

  // Envío
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inicializa (o reinicializa) todo el estado del formulario cuando la
  // navegación cambia de verdad — no en cada re-render. La clave combina
  // appointment_id (identifica sin ambigüedad una visita en modo mover),
  // date (identifica una visita en modo crear para un día concreto) y time
  // (para que tocar dos huecos libres distintos del MISMO día en la vista
  // Semana del calendario sí dispare un reset, aunque appointment_id/date no
  // cambien); si ninguno de los tres cambia respecto a la última vez, no se
  // toca nada (así el usuario puede navegar de día con ‹/› sin que este
  // efecto se lo pise). Si cambia, se resetea el formulario entero antes de
  // recargar — sin esto, reabrir "Nueva cita" para OTRO día arrastraría
  // cliente/servicio/fecha de la visita anterior. `time` es opcional y solo
  // lo usa el modo crear (ver más abajo); las llamadas existentes nunca lo
  // pasan, así que para ellas este cambio es un no-op.
  useEffect(() => {
    if (!business) return;
    const currentKey = `${appointmentId ?? 'new'}:${dateParam ?? ''}:${timeParam ?? ''}`;
    if (resolvedForRef.current === currentKey) return;
    resolvedForRef.current = currentKey;

    setLoadError(null);
    setClientId(null);
    setClientName('');
    setClientPhone('');
    setClientQuery('');
    setClientResults([]);
    setShowNewClientForm(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientError(null);
    setServiceId(null);
    setManualTime('');
    setSubmitError(null);

    if (!appointmentId) {
      // Modo crear: fecha = la que traía calendario.tsx, o si no, hoy; hora
      // = la que traiga la vista Semana del calendario (huecos libres), si
      // no, en blanco (el dueño la elige de las horas guía o a mano).
      setSelectedDate(dateParam ?? todayDateStrInZone(business.timezone));
      setManualTime(timeParam ?? '');
      setInitialLoading(false);
      return;
    }

    // Modo mover: precarga cliente (fijo), servicio y hora de la cita existente.
    setInitialLoading(true);
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, client_id, service_id, start_time')
        .eq('id', appointmentId)
        .single();

      if (cancelled) return;
      if (error || !data) {
        setLoadError('No se pudo cargar la cita.');
        setInitialLoading(false);
        return;
      }

      const [clientRes, serviceRes] = await Promise.all([
        supabase.from('clients').select('id, name, phone').eq('id', data.client_id).single(),
        supabase.from('services').select('id, name, duration_minutes, price, active').eq('id', data.service_id).single(),
      ]);

      if (cancelled) return;
      if (clientRes.data) {
        setClientId(clientRes.data.id);
        setClientName(clientRes.data.name);
        setClientPhone(clientRes.data.phone);
      }
      if (serviceRes.data) {
        setServiceId(serviceRes.data.id);
      }

      const startDate = new Date(data.start_time);
      setSelectedDate(todayDateStrInZone(business.timezone, startDate));
      setManualTime(formatTimeInZone(startDate, business.timezone));
      setInitialLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, appointmentId, dateParam]);

  // Servicios del negocio (activos primero, pero se incluyen los inactivos
  // para no romper el modo mover si la cita usaba un servicio ya desactivado).
  useEffect(() => {
    if (!business) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price, active')
        .eq('business_id', business.id)
        .order('active', { ascending: false })
        .order('name', { ascending: true });

      if (cancelled) return;
      if (!error) setServices(data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  // Búsqueda de cliente por nombre o teléfono (solo modo crear). Dos
  // queries en paralelo en vez de un .or() con el texto interpolado: un
  // filtro PostgREST .or() se rompe si el texto trae comas o paréntesis
  // (habitual en nombres, "López, Ana"), así que es más robusto separarlo.
  useEffect(() => {
    if (isEdit || !business) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientResults([]);
      return;
    }
    let cancelled = false;
    setSearchingClients(true);
    const handle = setTimeout(async () => {
      const [byName, byPhone] = await Promise.all([
        supabase.from('clients').select('id, name, phone').eq('business_id', business.id).ilike('name', `%${q}%`).limit(6),
        supabase.from('clients').select('id, name, phone').eq('business_id', business.id).ilike('phone', `%${q}%`).limit(6),
      ]);
      if (cancelled) return;
      const byId = new Map<string, ClientOption>();
      for (const c of [...(byName.data ?? []), ...(byPhone.data ?? [])]) byId.set(c.id, c);
      setClientResults([...byId.values()]);
      setSearchingClients(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [clientQuery, business, isEdit]);

  // Horario laboral + excepciones + citas ya ocupadas del día elegido —
  // misma función que disponibilidad.tsx (fetchDaySchedule) y misma que
  // calendario.tsx (fetchAppointmentsInRange) para la parte de citas, pero
  // aquí con el detalle del cliente (para poder nombrar el conflicto en el
  // aviso), no la versión anónima que usa el flujo de cliente.
  const fetchGuide = useCallback(() => {
    if (!business || !selectedDate) return;
    let cancelled = false;
    setLoadingGuide(true);

    (async () => {
      const dayOfWeek = dayOfWeekFromDateStr(selectedDate);
      const dayStartUtc = zonedTimeToUtc(selectedDate, '00:00', business.timezone);
      const dayEndUtc = zonedTimeToUtc(addDaysToDateStr(selectedDate, 1), '00:00', business.timezone);

      const [scheduleRes, appointmentsRes] = await Promise.all([
        fetchDaySchedule(business.id, selectedDate, business.timezone, dayOfWeek),
        fetchAppointmentsInRange(business.id, dayStartUtc, dayEndUtc),
      ]);

      if (cancelled) return;
      setDaySchedule(scheduleRes.data);
      setDayAppointments(appointmentsRes.data ?? []);
      setLoadingGuide(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, selectedDate]);

  useEffect(() => fetchGuide(), [fetchGuide]);

  function selectClient(client: ClientOption) {
    setClientId(client.id);
    setClientName(client.name);
    setClientPhone(client.phone);
    setClientQuery('');
    setClientResults([]);
  }

  function resetClient() {
    setClientId(null);
    setClientName('');
    setClientPhone('');
  }

  const newClientEmailTrimmed = newClientEmail.trim();
  const newClientEmailValid = newClientEmailTrimmed === '' || EMAIL_RE.test(newClientEmailTrimmed);
  const canCreateClient =
    newClientName.trim() !== '' && newClientPhone.trim() !== '' && newClientEmailValid && !savingNewClient;

  async function handleCreateClient() {
    if (!business || !canCreateClient) return;
    setSavingNewClient(true);
    setNewClientError(null);

    const { data, error } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        auth_user_id: null,
        name: newClientName.trim(),
        phone: newClientPhone.trim(),
        email: newClientEmailTrimmed === '' ? null : newClientEmailTrimmed.toLowerCase(),
        consent_data_processing: true,
        consent_marketing: false,
        consent_recorded_at: new Date().toISOString(),
        notes: 'Alta manual por el negocio: declara haber informado al cliente sobre el tratamiento de sus datos.',
      })
      .select('id, name, phone')
      .single();

    setSavingNewClient(false);
    if (error || !data) {
      setNewClientError(
        error?.code === '23505'
          ? 'Ya existe un cliente con ese teléfono en este negocio — búscalo arriba.'
          : 'No se pudo crear el cliente. Inténtalo de nuevo.'
      );
      return;
    }

    selectClient(data);
    setShowNewClientForm(false);
    setNewClientName('');
    setNewClientPhone('');
    setNewClientEmail('');
  }

  if (loadError) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{loadError}</Text>
      </Screen>
    );
  }

  // !selectedDate es la parte crítica: sin ella, el primer render con
  // `business` ya disponible pero el efecto de arriba todavía sin
  // completar (selectedDate === '') llega a zonedTimeToUtc('', ...) más
  // abajo y genera un Invalid Date que revienta al pasar por Intl.
  if (!business || initialLoading || !selectedDate) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const selectedService = services?.find((s) => s.id === serviceId) ?? null;

  const slots: Slot[] =
    daySchedule && selectedService
      ? computeAvailableSlots({
          dateStr: selectedDate,
          timeZone: business.timezone,
          workingRanges: daySchedule.fullDayClosed ? [] : daySchedule.workingRanges,
          blockedRanges: [
            ...daySchedule.exceptionBlockedRanges,
            ...(dayAppointments ?? [])
              .filter((a) => a.id !== appointmentId && (a.status === 'pending' || a.status === 'confirmed'))
              .map((a) => ({ start: new Date(a.start_time), end: new Date(a.end_time) })),
          ],
          durationMinutes: selectedService.duration_minutes,
          now: new Date(),
        })
      : [];

  const chosenMinutes = timeToMinutes(manualTime);
  const chosenStartUtc = selectedDate && chosenMinutes !== null ? zonedTimeToUtc(selectedDate, manualTime, business.timezone) : null;
  const chosenEndUtc =
    chosenStartUtc && selectedService ? new Date(chosenStartUtc.getTime() + selectedService.duration_minutes * 60000) : null;

  const outsideHours = !!(
    chosenStartUtc &&
    chosenEndUtc &&
    daySchedule &&
    !daySchedule.fullDayClosed &&
    !isWithinAnyWorkingRange(chosenStartUtc, chosenEndUtc, selectedDate, business.timezone, daySchedule.workingRanges)
  );
  const closed = !!(
    chosenStartUtc &&
    chosenEndUtc &&
    daySchedule &&
    (daySchedule.fullDayClosed || overlapsAnyRange(chosenStartUtc, chosenEndUtc, daySchedule.exceptionBlockedRanges))
  );
  const closedReason = daySchedule?.fullDayClosed
    ? daySchedule.fullDayClosedReason
    : chosenStartUtc && chosenEndUtc && daySchedule
      ? daySchedule.exceptionBlockedRanges.find((r) => chosenStartUtc < r.end && chosenEndUtc > r.start)?.reason ??
        null
      : null;
  const overlappingAppointments =
    chosenStartUtc && chosenEndUtc
      ? findOverlappingAppointments(chosenStartUtc, chosenEndUtc, dayAppointments ?? [], appointmentId)
      : [];
  const hasWarnings = outsideHours || closed || overlappingAppointments.length > 0;

  const canSubmit = !!clientId && !!selectedService && !!chosenStartUtc && !!chosenEndUtc && !submitting;

  async function handleSubmit() {
    if (!business || !clientId || !selectedService || !chosenStartUtc || !chosenEndUtc) return;
    setSubmitting(true);
    setSubmitError(null);

    if (isEdit) {
      const { error } = await supabase
        .from('appointments')
        .update({
          service_id: selectedService.id,
          start_time: chosenStartUtc.toISOString(),
          end_time: chosenEndUtc.toISOString(),
          price_at_booking: selectedService.price,
        })
        .eq('id', appointmentId);

      setSubmitting(false);
      if (error) {
        setSubmitError('No se pudo mover la cita. Inténtalo de nuevo.');
        return;
      }
    } else {
      const { error } = await supabase.from('appointments').insert({
        business_id: business.id,
        client_id: clientId,
        service_id: selectedService.id,
        start_time: chosenStartUtc.toISOString(),
        end_time: chosenEndUtc.toISOString(),
        status: 'confirmed',
        price_at_booking: selectedService.price,
        payment_status: 'none',
        created_by: 'owner',
      });

      setSubmitting(false);
      if (error) {
        setSubmitError('No se pudo crear la cita. Inténtalo de nuevo.');
        return;
      }
    }

    router.back();
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: 24,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text
            accessibilityRole="header"
            style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}
          >
            {isEdit ? 'Mover cita' : 'Nueva cita'}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>Cancelar</Text>
          </Pressable>
        </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={sectionTitleStyle}>Cliente</Text>
        {isEdit ? (
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
            {clientName}
            {clientPhone ? ` · ${clientPhone}` : ''}
          </Text>
        ) : clientId ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
              {clientName} · {clientPhone}
            </Text>
            <Pressable onPress={resetClient}>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>Cambiar</Text>
            </Pressable>
          </View>
        ) : showNewClientForm ? (
          <View
            style={{
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Input placeholder="Nombre" value={newClientName} onChangeText={setNewClientName} />
            <Input
              placeholder="Teléfono"
              value={newClientPhone}
              onChangeText={setNewClientPhone}
              keyboardType="phone-pad"
            />
            <Input
              placeholder="Email (opcional)"
              value={newClientEmail}
              onChangeText={setNewClientEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={!newClientEmailValid ? 'El email no tiene un formato válido.' : undefined}
            />
            <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>
              Al dar de alta a este cliente confirmas que le has informado de que sus datos se usarán para
              gestionar sus citas.
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={savingNewClient ? 'Creando…' : 'Crear cliente'}
                  onPress={handleCreateClient}
                  disabled={!canCreateClient}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Cancelar" onPress={() => setShowNewClientForm(false)} variant="secondary" />
              </View>
            </View>
            {newClientError && (
              <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{newClientError}</Text>
            )}
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Input
              placeholder="Buscar por nombre o teléfono"
              value={clientQuery}
              onChangeText={setClientQuery}
            />
            {searchingClients && <ActivityIndicator />}
            {clientResults.map((c) => (
              <Pressable key={c.id} onPress={() => selectClient(c)} style={rowStyle}>
                <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                  {c.name} · {c.phone}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowNewClientForm(true)}>
              <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.primary }}>+ Cliente nuevo</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={sectionTitleStyle}>Servicio</Text>
        {services === null ? (
          <ActivityIndicator />
        ) : (
          services.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setServiceId(s.id)}
              style={{
                ...rowStyle,
                borderColor: serviceId === s.id ? theme.colors.primary : theme.colors.border,
                borderWidth: serviceId === s.id ? 2 : 1,
              }}
            >
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                {s.name}
                {!s.active ? ' (Inactivo)' : ''}
              </Text>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                {s.duration_minutes} min · {s.price} €
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={sectionTitleStyle}>Fecha y hora</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, -1))} style={{ padding: theme.spacing.sm }}>
            <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>‹</Text>
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              ...theme.textStyles.bodyMedium,
              color: theme.colors.textPrimary,
              textTransform: 'capitalize',
            }}
          >
            {formatLongDateInZone(zonedTimeToUtc(selectedDate, '00:00', business.timezone), business.timezone)}
          </Text>
          <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, 1))} style={{ padding: theme.spacing.sm }}>
            <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>›</Text>
          </Pressable>
        </View>

        {!selectedService ? (
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
            Elige antes un servicio para ver horas guía.
          </Text>
        ) : loadingGuide ? (
          <ActivityIndicator />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {slots.map((slot) => {
              const label = formatTimeInZone(slot.start, business.timezone);
              const selected = manualTime === label;
              return (
                <Pressable
                  key={slot.start.toISOString()}
                  onPress={() => setManualTime(label)}
                  style={{
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radii.sm,
                    borderWidth: 1,
                    borderStyle: slot.available ? 'solid' : 'dashed',
                    borderColor: selected ? theme.colors.primary : slot.available ? theme.colors.border : theme.colors.disabledBg,
                    backgroundColor: selected ? theme.colors.primary : slot.available ? 'transparent' : theme.colors.disabledBg,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.textOnPrimary : slot.available ? theme.colors.textPrimary : theme.colors.disabledText,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
            {slots.length === 0 && (
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                Sin horas guía ese día — puedes escribir una hora igualmente.
              </Text>
            )}
          </View>
        )}

        <Input placeholder="Hora (HH:mm)" value={manualTime} onChangeText={setManualTime} />

        {hasWarnings && (
          <View
            style={{
              backgroundColor: theme.colors.warningSurface,
              borderRadius: theme.radii.md,
              padding: theme.spacing.md,
              gap: theme.spacing.xs,
            }}
          >
            {outsideHours && (
              <Text style={{ ...theme.textStyles.small, color: theme.colors.warning }}>
                Fuera del horario habitual del negocio.
              </Text>
            )}
            {closed && (
              <Text style={{ ...theme.textStyles.small, color: theme.colors.warning }}>
                Este día está marcado como cerrado{closedReason ? `: ${closedReason}` : '.'}
              </Text>
            )}
            {overlappingAppointments.map((a) => (
              <Text key={a.id} style={{ ...theme.textStyles.small, color: theme.colors.warning }}>
                Se solapa con la cita de {a.clientName} a las {formatTimeInZone(new Date(a.start_time), business.timezone)}.
              </Text>
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={{
          borderRadius: theme.radii.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: !canSubmit ? theme.colors.disabledBg : hasWarnings ? theme.colors.warning : theme.colors.primary,
        }}
      >
        <Text
          style={{
            ...theme.textStyles.bodyMedium,
            color: !canSubmit ? theme.colors.disabledText : theme.colors.textOnPrimary,
          }}
        >
          {submitting ? 'Guardando…' : hasWarnings ? 'Confirmar de todos modos' : 'Confirmar'}
        </Text>
      </Pressable>

      {submitError && <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{submitError}</Text>}
      </ScrollView>
    </Screen>
  );
}
