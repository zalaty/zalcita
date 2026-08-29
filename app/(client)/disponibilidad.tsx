import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { computeAvailableSlots, type Slot, type TimeRange } from '@/lib/availability';
import {
  addDaysToDateStr,
  dayMonthLabel,
  dayOfWeekFromDateStr,
  formatTimeInZone,
  mondayOfWeek,
  todayDateStrInZone,
  weekdayShortLabel,
  zonedTimeToUtc,
} from '@/lib/timezone';

interface BusinessInfo {
  id: string;
  name: string;
  timezone: string;
}

interface ServiceInfo {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

export default function Disponibilidad() {
  const router = useRouter();
  const { slug, service_id: serviceId } = useLocalSearchParams<{
    slug?: string;
    service_id?: string;
  }>();

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(false);

  const [todayStr, setTodayStr] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Negocio + servicio elegido, a partir de los parámetros de navegación.
  useEffect(() => {
    if (!slug || !serviceId) return;
    let cancelled = false;
    setLoadingBusiness(true);

    (async () => {
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('id, name, timezone')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (cancelled) return;
      if (businessError || !businessData) {
        console.warn(businessError?.message);
        setLoadingBusiness(false);
        return;
      }

      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('id', serviceId)
        .eq('business_id', businessData.id)
        .eq('active', true)
        .single();

      if (cancelled) return;
      if (serviceError || !serviceData) {
        console.warn(serviceError?.message);
        setLoadingBusiness(false);
        return;
      }

      const today = todayDateStrInZone(businessData.timezone);
      setBusiness(businessData);
      setService(serviceData);
      setTodayStr(today);
      setWeekStart(mondayOfWeek(today));
      setSelectedDate(today);
      setLoadingBusiness(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, serviceId]);

  // Franjas del día seleccionado (libres y ocupadas). Va envuelto en
  // useCallback + useFocusEffect en vez de un useEffect normal: además de
  // recalcularse cuando cambian negocio/servicio/día (las dependencias del
  // useCallback — todas estables entre renders: `business`/`service` son
  // objetos de estado que solo se reasignan cuando el otro efecto los
  // recarga de verdad, y `selectedDate` es un string 'YYYY-MM-DD', no un
  // Date), también se repite cada vez que esta pestaña recupera el foco.
  // Sin esto, si el cliente reserva una hora y vuelve al calendario, la
  // pestaña sigue montada (los Tabs de expo-router no la desmontan) y
  // mostraría la disponibilidad cacheada de la primera carga, con la hora
  // recién ocupada todavía como libre.
  const fetchSlots = useCallback(() => {
    if (!business || !service || !selectedDate) return;
    let cancelled = false;
    setLoadingSlots(true);

    (async () => {
      const dayOfWeek = dayOfWeekFromDateStr(selectedDate);
      const dayStartUtc = zonedTimeToUtc(selectedDate, '00:00', business.timezone);
      const dayEndUtc = zonedTimeToUtc(addDaysToDateStr(selectedDate, 1), '00:00', business.timezone);

      // TODO: cuando se añadan profesionales (member_id != null en
      // working_hours), la disponibilidad deberá calcularse por member_id:
      // el cliente elegirá profesional (o "cualquiera") y working_hours y
      // schedule_exceptions deberán filtrar/agrupar por ese member_id en
      // lugar de asumir horario general (member_id is null), igual que hoy.
      const [workingHoursRes, exceptionsRes, appointmentsRes] = await Promise.all([
        supabase
          .from('working_hours')
          .select('start_time, end_time')
          .eq('business_id', business.id)
          .eq('day_of_week', dayOfWeek)
          .is('member_id', null),
        supabase
          .from('schedule_exceptions')
          .select('is_closed, start_time, end_time')
          .eq('business_id', business.id)
          .eq('date', selectedDate)
          .is('member_id', null),
        // RLS solo deja leer las citas propias directamente de `appointments`
        // ("cliente ve sus propias citas", supabase/migrations/0001_init.sql),
        // así que las citas de otros clientes quedarían invisibles y
        // aparecerían como libres. Esta función SECURITY DEFINER (ver
        // supabase/migrations/0003_business_busy_slots.sql) expone solo
        // start_time/end_time de TODAS las citas activas de este negocio —
        // nunca client_id, service_id ni ningún otro dato de la cita — y
        // exige business_id como parámetro obligatorio, así que nunca puede
        // devolver la agenda de otro negocio.
        supabase.rpc('get_business_busy_slots', {
          p_business_id: business.id,
          p_from: dayStartUtc.toISOString(),
          p_to: dayEndUtc.toISOString(),
        }),
      ]);

      if (cancelled) return;
      if (workingHoursRes.error) console.warn(workingHoursRes.error.message);
      if (exceptionsRes.error) console.warn(exceptionsRes.error.message);
      if (appointmentsRes.error) console.warn(appointmentsRes.error.message);

      const exceptions = exceptionsRes.data ?? [];
      // is_closed=true SIN horas -> cierra el día completo.
      // is_closed=true CON start_time/end_time -> bloquea solo esa franja.
      const fullDayClosed = exceptions.some((e) => e.is_closed && !e.start_time && !e.end_time);

      const blockedRanges: TimeRange[] = [];

      for (const e of exceptions) {
        if (e.is_closed && e.start_time && e.end_time) {
          blockedRanges.push({
            start: zonedTimeToUtc(selectedDate, e.start_time.slice(0, 5), business.timezone),
            end: zonedTimeToUtc(selectedDate, e.end_time.slice(0, 5), business.timezone),
          });
        }
      }

      for (const a of appointmentsRes.data ?? []) {
        blockedRanges.push({ start: new Date(a.start_time), end: new Date(a.end_time) });
      }

      const computed = computeAvailableSlots({
        dateStr: selectedDate,
        timeZone: business.timezone,
        workingRanges: fullDayClosed ? [] : workingHoursRes.data ?? [],
        blockedRanges,
        durationMinutes: service.duration_minutes,
        now: new Date(),
      });

      setSlots(computed);
      setLoadingSlots(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, service, selectedDate]);

  useFocusEffect(fetchSlots);

  function handleSelectSlot(slot: TimeRange) {
    router.push({
      pathname: '/(client)/confirmacion',
      params: { slug: slug!, service_id: serviceId!, start_time: slot.start.toISOString() },
    });
  }

  if (!slug || !serviceId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Elige antes un servicio para ver su disponibilidad.</Text>
      </View>
    );
  }

  if (loadingBusiness || !business || !service || !weekStart) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const currentWeekStart = mondayOfWeek(todayStr);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{service.name}</Text>
        <Text style={{ fontSize: 13, color: '#666' }}>
          {service.duration_minutes} min · {service.price} €
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable
          onPress={() => setWeekStart((w) => (addDaysToDateStr(w, -7) < currentWeekStart ? currentWeekStart : addDaysToDateStr(w, -7)))}
          disabled={weekStart <= currentWeekStart}
          style={{ padding: 8, opacity: weekStart <= currentWeekStart ? 0.3 : 1 }}
        >
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#666' }}>
          {dayMonthLabel(weekDays[0])} – {dayMonthLabel(weekDays[6])}
        </Text>
        <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, 7))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 12 }}>
        {weekDays.map((dateStr) => {
          const disabled = dateStr < todayStr;
          const selected = dateStr === selectedDate;
          return (
            <Pressable
              key={dateStr}
              disabled={disabled}
              onPress={() => setSelectedDate(dateStr)}
              style={{
                flex: 1,
                marginHorizontal: 2,
                paddingVertical: 8,
                borderRadius: 8,
                alignItems: 'center',
                backgroundColor: selected ? '#111' : 'transparent',
                opacity: disabled ? 0.3 : 1,
              }}
            >
              <Text style={{ fontSize: 11, color: selected ? '#fff' : '#666' }}>
                {weekdayShortLabel(dateStr)}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: selected ? '#fff' : '#111' }}>
                {Number(dateStr.slice(8, 10))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1, padding: 16 }}>
        {loadingSlots ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={slots ?? []}
            keyExtractor={(item) => item.start.toISOString()}
            numColumns={3}
            columnWrapperStyle={{ gap: 8 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => {
              const time = formatTimeInZone(item.start, business.timezone);

              if (!item.available) {
                // Ocupada: se muestra (nunca se oculta) pero claramente no
                // pulsable — tachado + etiqueta "Ocupado" + borde
                // discontinuo, para que no dependa solo del gris (accesible
                // también para quien no distinga bien el color). Nunca se
                // muestra qué cita la ocupa: solo llegan start/end del
                // negocio (ver query de `appointments` más arriba).
                return (
                  <View
                    accessible
                    accessibilityLabel={`${time}, hora no disponible`}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#ccc',
                      backgroundColor: '#f2f2f2',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#999', textDecorationLine: 'line-through' }}>{time}</Text>
                    <Text style={{ color: '#999', fontSize: 10, fontWeight: '600' }}>Ocupado</Text>
                  </View>
                );
              }

              return (
                <Pressable
                  onPress={() => handleSelectSlot(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reservar a las ${time}`}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#ddd',
                    alignItems: 'center',
                  }}
                >
                  <Text>{time}</Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text>No hay horas disponibles este día.</Text>}
          />
        )}
      </View>
    </View>
  );
}
