import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { addDaysToDateStr, formatLongDateInZone, formatTimeInZone, todayDateStrInZone, zonedTimeToUtc } from '@/lib/timezone';
import { fetchAppointmentsInRange, type AppointmentDetails } from '@/lib/appointments';
import type { Appointment, AppointmentStatus } from '@/types/database';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  no_show: 'No se presentó',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: '#b45309',
  confirmed: '#15803d',
  cancelled: '#6b7280',
  completed: '#1d4ed8',
  no_show: '#b91c1c',
};

const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };

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

export default function Calendario() {
  const router = useRouter();
  const { business } = useBusiness();

  const [selectedDate, setSelectedDate] = useState('');
  const [appointments, setAppointments] = useState<AppointmentDetails[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);

  // Fecha inicial = hoy en la zona horaria del negocio. Solo se fija una vez
  // (guard `!selectedDate`): tras eso el usuario navega con ‹/›/"Hoy" y este
  // efecto no vuelve a tocar el estado aunque `business` se re-renderice.
  useEffect(() => {
    if (business && !selectedDate) {
      setSelectedDate(todayDateStrInZone(business.timezone));
    }
  }, [business, selectedDate]);

  // useCallback + useFocusEffect, mismo patrón que disponibilidad.tsx/
  // servicios.tsx: además de recalcularse al cambiar negocio/día, se repite
  // al recuperar el foco de la pestaña (los Tabs de expo-router no
  // desmontan), para reflejar altas/cambios hechos desde otra pantalla.
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

  if (!business || !selectedDate) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
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
