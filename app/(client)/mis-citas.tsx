import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { theme } from '@/theme';
import { Badge, Button, Card, Screen } from '@/components/ui';
import { fetchClientAppointments, type ClientAppointmentDetails } from '@/lib/appointments';
import { APPOINTMENT_STATUS_PRESENTATION } from '@/lib/appointmentStatusPresentation';
import { formatLongDateInZone, formatTimeInZone } from '@/lib/timezone';

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
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary, textAlign: 'center' }}>
          Inicia sesión para ver tus citas.
        </Text>
        <Button label="Iniciar sesión" onPress={() => router.push('/(auth)/login')} />
      </Screen>
    );
  }

  if (loading && !appointments) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  const upcoming = (appointments ?? []).filter(isUpcoming);
  const past = (appointments ?? []).filter((a) => !isUpcoming(a));

  function renderAppointment(a: ClientAppointmentDetails, withActions: boolean) {
    const isActing = actingId === a.id;
    const isConfirming = cancelingId === a.id;
    const withinNotice = hoursUntilStart(a) >= a.minHoursNotice;

    return (
      <Card key={a.id} style={{ gap: theme.spacing.xs }}>
        <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{a.businessName}</Text>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>{a.serviceName}</Text>
        <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
          {formatLongDateInZone(new Date(a.start_time), a.businessTimezone)} ·{' '}
          {formatTimeInZone(new Date(a.start_time), a.businessTimezone)}–
          {formatTimeInZone(new Date(a.end_time), a.businessTimezone)}
        </Text>
        <Badge label={APPOINTMENT_STATUS_PRESENTATION[a.status].label} tone={APPOINTMENT_STATUS_PRESENTATION[a.status].tone} />

        {withActions &&
          (!a.allowClientCancellation ? (
            <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
              Para cancelar, contacta con el negocio.
            </Text>
          ) : isConfirming ? (
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
              {!withinNotice && (
                <View
                  style={{
                    backgroundColor: theme.colors.warningSurface,
                    borderWidth: 1,
                    borderColor: theme.colors.warning,
                    borderRadius: theme.radii.md,
                    padding: theme.spacing.sm,
                  }}
                >
                  <Text style={{ ...theme.textStyles.small, color: theme.colors.warning }}>
                    Estás fuera del plazo de aviso de este negocio (mínimo {a.minHoursNotice} horas). Cancelar ahora
                    podría conllevar una penalización según su política.
                  </Text>
                </View>
              )}
              <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>
                ¿Seguro que quieres cancelar esta cita?
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={isActing ? '…' : 'Sí, cancelar'}
                    onPress={() => handleCancel(a.id)}
                    disabled={isActing}
                    variant="danger"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="No, mantener" onPress={() => setCancelingId(null)} disabled={isActing} variant="secondary" />
                </View>
              </View>
            </View>
          ) : (
            // Secundario, no danger: cancelar es una acción normal del
            // cliente, no debería leerse tan agresiva como confirmarla —
            // el rojo se reserva para el paso irreversible de verdad
            // ("Sí, cancelar", más abajo).
            <View style={{ marginTop: theme.spacing.xs }}>
              <Button label="Cancelar cita" onPress={() => setCancelingId(a.id)} variant="secondary" />
            </View>
          ))}
      </Card>
    );
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.xl,
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
          Mis citas
        </Text>

        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>Próximas citas</Text>
          {upcoming.length === 0 ? (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>No tienes citas próximas.</Text>
          ) : (
            upcoming.map((a) => renderAppointment(a, true))
          )}
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>Historial</Text>
          {past.length === 0 ? (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
              Todavía no tienes citas pasadas.
            </Text>
          ) : (
            past.map((a) => renderAppointment(a, false))
          )}
        </View>

        {listError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{listError}</Text>}
      </ScrollView>
    </Screen>
  );
}
