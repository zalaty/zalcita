import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { fetchClientAppointments, STATUS_COLORS, STATUS_LABELS, type ClientAppointmentDetails } from '@/lib/appointments';
import { formatLongDateInZone, formatTimeInZone } from '@/lib/timezone';

const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const cardStyle = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', gap: 6 };
const sectionTitleStyle = { fontSize: 16, fontWeight: '700' as const };
const warningBoxStyle = { backgroundColor: '#fff3cd', borderWidth: 1, borderColor: '#ffe69c', borderRadius: 8, padding: 10, gap: 6 };

function isUpcoming(a: ClientAppointmentDetails): boolean {
  return (a.status === 'pending' || a.status === 'confirmed') && new Date(a.end_time) > new Date();
}

function hoursUntilStart(a: ClientAppointmentDetails): number {
  return (new Date(a.start_time).getTime() - Date.now()) / 3600000;
}

// Cancelar (SOLO cancelar — modificar/mover queda para otra tanda). El
// UPDATE lo protegen la política RLS + el trigger de la migración 0010:
// esta pantalla solo necesita mandar status/cancelled_at, y confiar en que
// la BD rechaza cualquier otra cosa.
export default function MisCitas() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const [appointments, setAppointments] = useState<ClientAppointmentDetails[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const fetchAppointments = useCallback(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);

    (async () => {
      const { data, error } = await fetchClientAppointments(session.user.id);
      if (cancelled) return;
      if (error) {
        setListError('No se pudieron cargar tus citas.');
        setLoading(false);
        return;
      }
      setAppointments(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  useFocusEffect(fetchAppointments);

  async function handleCancel(appointmentId: string) {
    setListError(null);
    setActingId(appointmentId);

    const { error } = await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', appointmentId);

    setActingId(null);
    if (error) {
      setListError(
        error.code === '42501'
          ? 'No se pudo cancelar: el negocio no permite cancelar esta cita, o ya no está en un estado cancelable.'
          : 'No se pudo cancelar la cita. Inténtalo de nuevo.'
      );
      return;
    }
    setCancelingId(null);
    fetchAppointments();
  }

  if (authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
        <Text style={{ textAlign: 'center' }}>Inicia sesión para ver tus citas.</Text>
        <Pressable onPress={() => router.push('/(auth)/login')} style={buttonStyle}>
          <Text style={buttonTextStyle}>Iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && !appointments) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const upcoming = (appointments ?? []).filter(isUpcoming);
  const past = (appointments ?? []).filter((a) => !isUpcoming(a));

  function renderAppointment(a: ClientAppointmentDetails, withActions: boolean) {
    const isActing = actingId === a.id;
    const isConfirming = cancelingId === a.id;
    const withinNotice = hoursUntilStart(a) >= a.minHoursNotice;

    return (
      <View key={a.id} style={cardStyle}>
        <Text style={{ fontSize: 15, fontWeight: '600' }}>{a.businessName}</Text>
        <Text style={{ fontSize: 14 }}>{a.serviceName}</Text>
        <Text style={{ fontSize: 13, color: '#666' }}>
          {formatLongDateInZone(new Date(a.start_time), a.businessTimezone)} ·{' '}
          {formatTimeInZone(new Date(a.start_time), a.businessTimezone)}–
          {formatTimeInZone(new Date(a.end_time), a.businessTimezone)}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[a.status] }}>{STATUS_LABELS[a.status]}</Text>

        {withActions &&
          (!a.allowClientCancellation ? (
            <Text style={{ fontSize: 13, color: '#666' }}>Para cancelar, contacta con el negocio.</Text>
          ) : isConfirming ? (
            <View style={{ gap: 8 }}>
              {!withinNotice && (
                <View style={warningBoxStyle}>
                  <Text style={{ fontSize: 13, color: '#664d03' }}>
                    Estás fuera del plazo de aviso de este negocio (mínimo {a.minHoursNotice} horas). Cancelar ahora
                    podría conllevar una penalización según su política.
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 13, color: '#b91c1c' }}>¿Seguro que quieres cancelar esta cita?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => handleCancel(a.id)}
                  disabled={isActing}
                  style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#b91c1c' }}
                >
                  <Text style={{ color: '#b91c1c', textAlign: 'center', fontWeight: '600' }}>
                    {isActing ? '…' : 'Sí, cancelar'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setCancelingId(null)}
                  disabled={isActing}
                  style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
                >
                  <Text style={{ textAlign: 'center' }}>No, mantener</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setCancelingId(a.id)}
              style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#b91c1c' }}
            >
              <Text style={{ color: '#b91c1c', textAlign: 'center', fontWeight: '600' }}>Cancelar cita</Text>
            </Pressable>
          ))}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ gap: 12 }}>
        <Text style={sectionTitleStyle}>Próximas citas</Text>
        {upcoming.length === 0 ? (
          <Text style={{ color: '#666' }}>No tienes citas próximas.</Text>
        ) : (
          upcoming.map((a) => renderAppointment(a, true))
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Text style={sectionTitleStyle}>Historial</Text>
        {past.length === 0 ? (
          <Text style={{ color: '#666' }}>Todavía no tienes citas pasadas.</Text>
        ) : (
          past.map((a) => renderAppointment(a, false))
        )}
      </View>

      {listError && <Text style={{ color: 'crimson' }}>{listError}</Text>}
    </ScrollView>
  );
}
