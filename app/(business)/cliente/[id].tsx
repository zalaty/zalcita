import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Badge, Button, Card, Input, Screen } from '@/components/ui';
import { fetchClientAppointmentHistory, type ClientHistoryAppointment } from '@/lib/appointments';
import { APPOINTMENT_STATUS_PRESENTATION } from '@/lib/appointmentStatusPresentation';
import { formatLongDateInZone, formatTimeInZone } from '@/lib/timezone';

// Verde de marca de WhatsApp, NO un token del sistema a propósito: es la
// marca reconocible de un tercero (como un botón "Entrar con Google"), no
// un color de nuestra paleta — solo se le aplica la forma/tipografía del
// sistema, no se recolorea a teal.
const WHATSAPP_GREEN = '#25D366';

interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

// Normaliza a formato E.164 sin '+' para wa.me. Asume España (34) solo
// cuando el número son exactamente 9 dígitos sin ningún prefijo — heurística
// razonable para una app de negocio español, no un intento de adivinar
// cualquier país. Si el resultado no tiene una longitud plausible (E.164:
// 8-15 dígitos), se marca inválido en vez de dejar que el botón abra un
// enlace de WhatsApp que sabemos que va a fallar.
function normalizePhoneForWhatsApp(phone: string): { valid: boolean; number: string } {
  const digits = phone.replace(/[^\d+]/g, '');
  let normalized: string;
  if (digits.startsWith('+')) normalized = digits.slice(1);
  else if (digits.startsWith('00')) normalized = digits.slice(2);
  else if (digits.length === 9) normalized = '34' + digits;
  else normalized = digits;

  const valid = /^\d{8,15}$/.test(normalized);
  return { valid, number: normalized };
}

export default function ClienteFicha() {
  const router = useRouter();
  const { business } = useBusiness();
  const { id: clientId } = useLocalSearchParams<{ id: string }>();

  const [client, setClient] = useState<ClientProfile | null>(null);
  const [history, setHistory] = useState<ClientHistoryAppointment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const fetchProfile = useCallback(() => {
    if (!business || !clientId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      const [clientRes, historyRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, name, phone, email, notes')
          .eq('id', clientId)
          .eq('business_id', business.id)
          .single(),
        fetchClientAppointmentHistory(business.id, clientId),
      ]);

      if (cancelled) return;
      if (clientRes.error || !clientRes.data) {
        setLoadError('No se pudo cargar la ficha del cliente.');
        setLoading(false);
        return;
      }
      if (historyRes.error) {
        setLoadError('No se pudo cargar el historial de citas.');
        setLoading(false);
        return;
      }

      setClient(clientRes.data);
      setHistory(historyRes.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, clientId]);

  useFocusEffect(fetchProfile);

  function openEditNotes() {
    setNotesDraft(client?.notes ?? '');
    setNotesError(null);
    setEditingNotes(true);
  }

  async function handleSaveNotes() {
    if (!client) return;
    setSavingNotes(true);
    setNotesError(null);

    const trimmed = notesDraft.trim();
    const { error } = await supabase
      .from('clients')
      .update({ notes: trimmed === '' ? null : trimmed })
      .eq('id', client.id);

    setSavingNotes(false);
    if (error) {
      setNotesError('No se pudieron guardar las notas. Inténtalo de nuevo.');
      return;
    }
    setClient({ ...client, notes: trimmed === '' ? null : trimmed });
    setEditingNotes(false);
  }

  if (!business || loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  if (loadError || !client) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.danger, textAlign: 'center' }}>
          {loadError ?? 'No se encontró el cliente.'}
        </Text>
      </Screen>
    );
  }

  const now = new Date();
  const completed = (history ?? []).filter((a) => a.status === 'completed');
  const spent = completed.reduce((sum, a) => sum + Number(a.price_at_booking), 0);
  const upcomingConfirmed = (history ?? []).filter((a) => a.status === 'confirmed' && new Date(a.start_time) > now);
  const expected = upcomingConfirmed.reduce((sum, a) => sum + Number(a.price_at_booking), 0);
  const nextAppointment = (history ?? [])
    .filter((a) => (a.status === 'pending' || a.status === 'confirmed') && new Date(a.start_time) > now)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

  const whatsapp = normalizePhoneForWhatsApp(client.phone);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        {/* Navegación EXPLÍCITA, nunca router.back(): esta pantalla también
            se puede abrir en otros contextos futuros, y "atrás" en un stack
            montado sobre tabs puede caer en la pestaña por defecto
            (Calendario) en vez de en la lista de clientes — bug real,
            confirmado en vivo. replace() además no acumula historial. */}
        <Pressable onPress={() => router.replace('/(business)/clientes')}>
          <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>‹ Volver a clientes</Text>
        </Pressable>

        <Card>
          <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
            <Text style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>{client.name}</Text>
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>{client.phone}</Text>
            {client.email && (
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>{client.email}</Text>
            )}
          </View>

          {whatsapp.valid ? (
            <Pressable
              onPress={() => Linking.openURL(`https://wa.me/${whatsapp.number}`)}
              style={{
                backgroundColor: WHATSAPP_GREEN,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                marginBottom: theme.spacing.md,
              }}
            >
              <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textOnPrimary, textAlign: 'center' }}>
                Contactar por WhatsApp
              </Text>
            </Pressable>
          ) : (
            <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginBottom: theme.spacing.md }}>
              El teléfono no tiene un formato válido para abrir WhatsApp directamente — el número sigue visible arriba
              para marcarlo a mano.
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View
              style={{
                flex: 1,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                ...theme.shadows.sm,
                gap: theme.spacing.xs,
              }}
            >
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{completed.length}</Text>
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>Citas completadas</Text>
            </View>
            <View
              style={{
                flex: 1,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                ...theme.shadows.sm,
                gap: theme.spacing.xs,
              }}
            >
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{spent.toFixed(2)} €</Text>
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>Gastado</Text>
            </View>
            <View
              style={{
                flex: 1,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                ...theme.shadows.sm,
                gap: theme.spacing.xs,
              }}
            >
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{expected.toFixed(2)} €</Text>
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>Previsto</Text>
            </View>
          </View>

          {nextAppointment && (
            <View
              style={{
                marginTop: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: theme.colors.info,
                backgroundColor: theme.colors.infoSurface,
                gap: theme.spacing.xs,
              }}
            >
              <Text style={{ ...theme.textStyles.small, fontWeight: theme.fontWeights.semibold, color: theme.colors.info }}>
                Próxima cita
              </Text>
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                {formatLongDateInZone(new Date(nextAppointment.start_time), business.timezone)} ·{' '}
                {formatTimeInZone(new Date(nextAppointment.start_time), business.timezone)} · {nextAppointment.serviceName}
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Notas internas
          </Text>
          {editingNotes ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Input
                value={notesDraft}
                onChangeText={setNotesDraft}
                multiline
                numberOfLines={4}
                style={{ minHeight: 100, textAlignVertical: 'top' }}
                placeholder="Notas visibles solo para el negocio"
              />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label={savingNotes ? 'Guardando…' : 'Guardar'} onPress={handleSaveNotes} disabled={savingNotes} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" onPress={() => setEditingNotes(false)} disabled={savingNotes} variant="secondary" />
                </View>
              </View>
              {notesError && <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>{notesError}</Text>}
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Text style={{ ...theme.textStyles.body, color: client.notes ? theme.colors.textPrimary : theme.colors.textSecondary }}>
                {client.notes || 'Sin notas todavía.'}
              </Text>
              <Pressable onPress={openEditNotes}>
                <Text style={{ ...theme.textStyles.small, fontWeight: theme.fontWeights.semibold, color: theme.colors.primary }}>
                  Editar notas
                </Text>
              </Pressable>
            </View>
          )}
        </Card>

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Historial de citas
          </Text>
          {(history ?? []).length === 0 ? (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>Todavía no tiene citas.</Text>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {(history ?? []).map((a) => (
                <View
                  key={a.id}
                  style={{
                    padding: theme.spacing.md,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surface,
                    ...theme.shadows.sm,
                    gap: theme.spacing.xs,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>
                      {formatLongDateInZone(new Date(a.start_time), business.timezone)} ·{' '}
                      {formatTimeInZone(new Date(a.start_time), business.timezone)}
                    </Text>
                    <Badge label={APPOINTMENT_STATUS_PRESENTATION[a.status].label} tone={APPOINTMENT_STATUS_PRESENTATION[a.status].tone} />
                  </View>
                  <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                    {a.serviceName} · {a.price_at_booking} €
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
