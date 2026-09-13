import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/theme';
import { Badge, Card } from '@/components/ui';
import { computeAvailableSlots, type Slot, type TimeRange } from '@/lib/availability';
import { fetchDaySchedule, type DaySchedule } from '@/lib/schedule';
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
  const { width } = useWindowDimensions();
  const isNarrow = width < theme.breakpoints.narrow;

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(false);

  const [todayStr, setTodayStr] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [daySchedule, setDaySchedule] = useState<DaySchedule | null>(null);
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
      const [scheduleRes, appointmentsRes] = await Promise.all([
        fetchDaySchedule(business.id, selectedDate, business.timezone, dayOfWeek),
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
      if (scheduleRes.error) console.warn(scheduleRes.error);
      if (appointmentsRes.error) console.warn(appointmentsRes.error.message);

      const schedule = scheduleRes.data;
      const blockedRanges: TimeRange[] = [...(schedule?.exceptionBlockedRanges ?? [])];

      for (const a of appointmentsRes.data ?? []) {
        blockedRanges.push({ start: new Date(a.start_time), end: new Date(a.end_time) });
      }

      const computed = computeAvailableSlots({
        dateStr: selectedDate,
        timeZone: business.timezone,
        workingRanges: schedule?.fullDayClosed ? [] : schedule?.workingRanges ?? [],
        blockedRanges,
        durationMinutes: service.duration_minutes,
        now: new Date(),
      });

      setDaySchedule(schedule ?? null);
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
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background,
        }}
      >
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' }}>
          Elige antes un servicio para ver su disponibilidad.
        </Text>
      </View>
    );
  }

  if (loadingBusiness || !business || !service || !weekStart) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const currentWeekStart = mondayOfWeek(todayStr);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToDateStr(weekStart, i));

  const avatarSize = isNarrow ? 40 : 56;
  const businessInitial = business.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {/* Tarjeta contenedora: agrupa cabecera + navegación + huecos como
            una sola unidad ("el panel de reserva de este negocio") en vez
            de piezas sueltas sobre el fondo — mismo patrón a reutilizar en
            el resto de pantallas del cliente. Card ya trae de fábrica
            surface/radii.lg/shadows.sm/padding lg, así que las secciones de
            dentro solo aportan su ritmo vertical interno, no repiten el
            padding exterior. */}
        <Card>
          <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border }}>
            {/* Identidad del negocio: nombre destacado en color de marca +
                hueco reservado para su logo (avatar con la inicial, por
                ahora). Sustituir por <Image source={{ uri: business.logo_url }} />
                cuando exista la subida de logo — el círculo ya tiene el
                tamaño/posición pensados para admitir una imagen ahí mismo. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
              }}
            >
              <View
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  backgroundColor: theme.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textOnPrimary,
                    fontWeight: theme.fontWeights.bold,
                    fontSize: avatarSize * 0.4,
                  }}
                >
                  {businessInitial}
                </Text>
              </View>
              <Text
                numberOfLines={2}
                style={{
                  ...(isNarrow ? theme.textStyles.heading2 : theme.textStyles.heading1),
                  color: theme.colors.primary,
                  flexShrink: 1,
                }}
              >
                {business.name}
              </Text>
            </View>

            {/* Más aire entre el nombre del negocio y el del servicio (antes
                spacing.sm, competían visualmente) — el resto de la tarjeta
                no repite padding horizontal, ya lo da Card. */}
            <View style={{ paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.lg }}>
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{service.name}</Text>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
                {service.duration_minutes} min · {service.price} €
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: theme.spacing.md }}>
            <Pressable
              onPress={() => setWeekStart((w) => (addDaysToDateStr(w, -7) < currentWeekStart ? currentWeekStart : addDaysToDateStr(w, -7)))}
              disabled={weekStart <= currentWeekStart}
              style={{ padding: theme.spacing.sm, opacity: weekStart <= currentWeekStart ? 0.3 : 1 }}
            >
              <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>‹</Text>
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', ...theme.textStyles.small, color: theme.colors.textSecondary }}>
              {dayMonthLabel(weekDays[0])} – {dayMonthLabel(weekDays[6])}
            </Text>
            <Pressable onPress={() => setWeekStart((w) => addDaysToDateStr(w, 7))} style={{ padding: theme.spacing.sm }}>
              <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>›</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', paddingVertical: theme.spacing.md }}>
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
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radii.md,
                    alignItems: 'center',
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                    opacity: disabled ? 0.3 : 1,
                  }}
                >
                  <Text style={{ fontSize: theme.fontSizes.xs, color: selected ? theme.colors.textOnPrimary : theme.colors.textSecondary }}>
                    {weekdayShortLabel(dateStr)}
                  </Text>
                  <Text
                    style={{
                      ...theme.textStyles.bodyMedium,
                      color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary,
                    }}
                  >
                    {Number(dateStr.slice(8, 10))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginTop: theme.spacing.xs }}>
            {!loadingSlots && daySchedule?.fullDayClosed && (
              <View
                style={{
                  backgroundColor: theme.colors.disabledBg,
                  borderRadius: theme.radii.md,
                  padding: theme.spacing.md,
                  marginBottom: theme.spacing.md,
                }}
              >
                <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                  Cerrado este día{daySchedule.fullDayClosedReason ? `: ${daySchedule.fullDayClosedReason}` : '.'}
                </Text>
              </View>
            )}
            {!loadingSlots &&
              !daySchedule?.fullDayClosed &&
              (daySchedule?.exceptionBlockedRanges ?? []).some((r) => r.reason) && (
                <View
                  style={{
                    backgroundColor: theme.colors.disabledBg,
                    borderRadius: theme.radii.md,
                    padding: theme.spacing.md,
                    marginBottom: theme.spacing.md,
                    gap: 2,
                  }}
                >
                  {(daySchedule?.exceptionBlockedRanges ?? [])
                    .filter((r) => r.reason)
                    .map((r, i) => (
                      <Text key={i} style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                        De {formatTimeInZone(r.start, business.timezone)} a {formatTimeInZone(r.end, business.timezone)}:{' '}
                        {r.reason}
                      </Text>
                    ))}
                </View>
              )}
            {loadingSlots ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <FlatList
                data={slots ?? []}
                keyExtractor={(item) => item.start.toISOString()}
                numColumns={3}
                scrollEnabled={false}
                columnWrapperStyle={{ gap: theme.spacing.sm }}
                contentContainerStyle={{ gap: theme.spacing.sm }}
                renderItem={({ item }) => {
                  const time = formatTimeInZone(item.start, business.timezone);

                  if (!item.available) {
                    // Ocupada: se muestra (nunca se oculta) pero claramente no
                    // pulsable — tachado + Badge "Ocupado" (color + texto, nunca
                    // solo color) + borde discontinuo. Nunca se muestra qué cita
                    // la ocupa: solo llegan start/end del negocio (ver query de
                    // `appointments` más arriba). Misma altura compacta que el
                    // hueco libre (paddingVertical.sm) para que la rejilla de 3
                    // columnas quede alineada aunque se mezclen libres/ocupados.
                    return (
                      <View
                        accessible
                        accessibilityLabel={`${time}, hora no disponible`}
                        style={{
                          flex: 1,
                          paddingVertical: theme.spacing.sm,
                          borderRadius: theme.radii.md,
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.disabledBg,
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                        }}
                      >
                        <Text style={{ color: theme.colors.disabledText, textDecorationLine: 'line-through' }}>
                          {time}
                        </Text>
                        <Badge label="Ocupado" tone="neutral" />
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
                        // Compacto tipo "chip de hora" (antes spacing.md,
                        // quedaba demasiado alto para una sola línea de texto).
                        paddingVertical: theme.spacing.sm,
                        borderRadius: theme.radii.md,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        // Superficie propia (blanca, igual que la Card que lo
                        // envuelve) + borde + sombra: las tres señales juntas
                        // son las que lo definen como caja tocable nítida —
                        // solo sombra sobre una Card ya blanca no bastaba
                        // (mismo color de fondo que su contenedor).
                        backgroundColor: theme.colors.surface,
                        ...theme.shadows.sm,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: theme.colors.textPrimary }}>{time}</Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                    No hay horas disponibles este día.
                  </Text>
                }
              />
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
