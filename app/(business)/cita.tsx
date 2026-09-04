import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const warningButtonStyle = { ...buttonStyle, backgroundColor: '#b45309' };
const formBoxStyle = { gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#f7f7f7' };
const rowStyle = {
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#eee',
};
const sectionTitleStyle = { fontSize: 15, fontWeight: '700' as const };

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
  const router = useRouter();
  const { business } = useBusiness();
  const { appointment_id: appointmentId, date: dateParam } = useLocalSearchParams<{
    appointment_id?: string;
    date?: string;
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
  // appointment_id (identifica sin ambigüedad una visita en modo mover) y
  // date (identifica una visita en modo crear para un día concreto); si
  // ninguno de los dos cambia respecto a la última vez, no se toca nada
  // (así el usuario puede navegar de día con ‹/› sin que este efecto se lo
  // pise). Si cambia, se resetea el formulario entero antes de recargar —
  // sin esto, reabrir "Nueva cita" para OTRO día arrastraría cliente/
  // servicio/fecha de la visita anterior.
  useEffect(() => {
    if (!business) return;
    const currentKey = `${appointmentId ?? 'new'}:${dateParam ?? ''}`;
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
      // Modo crear: fecha = la que traía calendario.tsx, o si no, hoy.
      setSelectedDate(dateParam ?? todayDateStrInZone(business.timezone));
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

  const canCreateClient = newClientName.trim() !== '' && newClientPhone.trim() !== '' && !savingNewClient;

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
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: 'crimson' }}>{loadError}</Text>
      </View>
    );
  }

  // !selectedDate es la parte crítica: sin ella, el primer render con
  // `business` ya disponible pero el efecto de arriba todavía sin
  // completar (selectedDate === '') llega a zonedTimeToUtc('', ...) más
  // abajo y genera un Invalid Date que revienta al pasar por Intl.
  if (!business || initialLoading || !selectedDate) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>{isEdit ? 'Mover cita' : 'Nueva cita'}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: '#666' }}>Cancelar</Text>
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={sectionTitleStyle}>Cliente</Text>
        {isEdit ? (
          <Text style={{ fontSize: 15 }}>
            {clientName}
            {clientPhone ? ` · ${clientPhone}` : ''}
          </Text>
        ) : clientId ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 15 }}>
              {clientName} · {clientPhone}
            </Text>
            <Pressable onPress={resetClient}>
              <Text style={{ color: '#1d4ed8' }}>Cambiar</Text>
            </Pressable>
          </View>
        ) : showNewClientForm ? (
          <View style={formBoxStyle}>
            <TextInput placeholder="Nombre" value={newClientName} onChangeText={setNewClientName} style={inputStyle} />
            <TextInput
              placeholder="Teléfono"
              value={newClientPhone}
              onChangeText={setNewClientPhone}
              keyboardType="phone-pad"
              style={inputStyle}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleCreateClient}
                disabled={!canCreateClient}
                style={{ flex: 1, ...(canCreateClient ? buttonStyle : buttonDisabledStyle) }}
              >
                <Text style={buttonTextStyle}>{savingNewClient ? 'Creando…' : 'Crear cliente'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowNewClientForm(false)}
                style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
              >
                <Text style={{ textAlign: 'center' }}>Cancelar</Text>
              </Pressable>
            </View>
            {newClientError && <Text style={{ color: 'crimson' }}>{newClientError}</Text>}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <TextInput
              placeholder="Buscar por nombre o teléfono"
              value={clientQuery}
              onChangeText={setClientQuery}
              style={inputStyle}
            />
            {searchingClients && <ActivityIndicator />}
            {clientResults.map((c) => (
              <Pressable key={c.id} onPress={() => selectClient(c)} style={rowStyle}>
                <Text>
                  {c.name} · {c.phone}
                </Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowNewClientForm(true)}>
              <Text style={{ color: '#1d4ed8', fontWeight: '600' }}>+ Cliente nuevo</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={sectionTitleStyle}>Servicio</Text>
        {services === null ? (
          <ActivityIndicator />
        ) : (
          services.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setServiceId(s.id)}
              style={{ ...rowStyle, borderColor: serviceId === s.id ? '#111' : '#eee', borderWidth: serviceId === s.id ? 2 : 1 }}
            >
              <Text style={{ fontSize: 15 }}>
                {s.name}
                {!s.active ? ' (Inactivo)' : ''}
              </Text>
              <Text style={{ fontSize: 13, color: '#666' }}>
                {s.duration_minutes} min · {s.price} €
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={sectionTitleStyle}>Fecha y hora</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, -1))} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18 }}>‹</Text>
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' }}>
            {formatLongDateInZone(zonedTimeToUtc(selectedDate, '00:00', business.timezone), business.timezone)}
          </Text>
          <Pressable onPress={() => setSelectedDate((d) => addDaysToDateStr(d, 1))} style={{ padding: 8 }}>
            <Text style={{ fontSize: 18 }}>›</Text>
          </Pressable>
        </View>

        {!selectedService ? (
          <Text style={{ color: '#666' }}>Elige antes un servicio para ver horas guía.</Text>
        ) : loadingGuide ? (
          <ActivityIndicator />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {slots.map((slot) => {
              const label = formatTimeInZone(slot.start, business.timezone);
              const selected = manualTime === label;
              return (
                <Pressable
                  key={slot.start.toISOString()}
                  onPress={() => setManualTime(label)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderStyle: slot.available ? 'solid' : 'dashed',
                    borderColor: selected ? '#111' : slot.available ? '#ddd' : '#ccc',
                    backgroundColor: selected ? '#111' : slot.available ? 'transparent' : '#f2f2f2',
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : slot.available ? '#111' : '#999' }}>{label}</Text>
                </Pressable>
              );
            })}
            {slots.length === 0 && (
              <Text style={{ color: '#666' }}>Sin horas guía ese día — puedes escribir una hora igualmente.</Text>
            )}
          </View>
        )}

        <TextInput placeholder="Hora (HH:mm)" value={manualTime} onChangeText={setManualTime} style={inputStyle} />

        {hasWarnings && (
          <View style={{ backgroundColor: '#fff3cd', borderWidth: 1, borderColor: '#ffe69c', borderRadius: 8, padding: 10, gap: 4 }}>
            {outsideHours && <Text style={{ color: '#664d03', fontSize: 13 }}>Fuera del horario habitual del negocio.</Text>}
            {closed && <Text style={{ color: '#664d03', fontSize: 13 }}>Este día está marcado como cerrado.</Text>}
            {overlappingAppointments.map((a) => (
              <Text key={a.id} style={{ color: '#664d03', fontSize: 13 }}>
                Se solapa con la cita de {a.clientName} a las {formatTimeInZone(new Date(a.start_time), business.timezone)}.
              </Text>
            ))}
          </View>
        )}
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={!canSubmit ? buttonDisabledStyle : hasWarnings ? warningButtonStyle : buttonStyle}
      >
        <Text style={buttonTextStyle}>
          {submitting ? 'Guardando…' : hasWarnings ? 'Confirmar de todos modos' : 'Confirmar'}
        </Text>
      </Pressable>

      {submitError && <Text style={{ color: 'crimson' }}>{submitError}</Text>}
    </ScrollView>
  );
}
