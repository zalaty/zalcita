import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { computeAvailableSlots, type TimeRange } from '@/lib/availability';
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

  const [slots, setSlots] = useState<TimeRange[] | null>(null);
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

  // Franjas libres del día seleccionado.
  useEffect(() => {
    if (!business || !service || !selectedDate) return;
    let cancelled = false;
    setLoadingSlots(true);

    (async () => {
      const dayOfWeek = dayOfWeekFromDateStr(selectedDate);
      const dayStartUtc = zonedTimeToUtc(selectedDate, '00:00', business.timezone);
      const dayEndUtc = zonedTimeToUtc(addDaysToDateStr(selectedDate, 1), '00:00', business.timezone);

      // TODO: cuando se añadan profesionales (member_id != null en
      // working_hours), la disponibilidad deberá calcularse por member_id:
      // el cliente elegirá profesional (o "cualquiera") y estas tres
      // queries deberán filtrar/agrupar por ese member_id en lugar de
      // asumir horario general (member_id is null), igual que hoy.
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
        supabase
          .from('appointments')
          // Solo horas: nunca se lee el cliente ni ningún otro dato de la
          // cita (RGPD) — los huecos ocupados no deben revelar quién los reservó.
          .select('start_time, end_time')
          .eq('business_id', business.id)
          .is('member_id', null)
          .in('status', ['pending', 'confirmed'])
          .lt('start_time', dayEndUtc.toISOString())
          .gt('end_time', dayStartUtc.toISOString()),
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

  function handleSelectSlot(slot: TimeRange) {
    // TODO: crear app/(client)/confirmacion.tsx — ahí irá el login si hace
    // falta (flujo 1.2/1.3) y la reserva real (insert en `appointments` con
    // status 'pending' + política de pago del negocio).
    router.push({
      pathname: '/(client)/confirmacion',
      params: { slug: slug!, service_id: serviceId!, start_time: slot.start.toISOString() },
      // La ruta todavía no existe (ver TODO de arriba), así que expo-router
      // no puede tipar este pathname contra las rutas reales del proyecto.
    } as unknown as Parameters<typeof router.push>[0]);
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
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelectSlot(item)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  alignItems: 'center',
                }}
              >
                <Text>{formatTimeInZone(item.start, business.timezone)}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text>No hay horas disponibles este día.</Text>}
          />
        )}
      </View>
    </View>
  );
}
