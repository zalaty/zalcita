import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { fetchClientAppointmentHistory, STATUS_COLORS, STATUS_LABELS, type ClientHistoryAppointment } from '@/lib/appointments';
import { formatLongDateInZone, formatTimeInZone } from '@/lib/timezone';

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const cardStyle = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', gap: 4 };
const statBoxStyle = { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7', gap: 4 };
const sectionTitleStyle = { fontSize: 16, fontWeight: '700' as const };

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError || !client) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: 'crimson' }}>{loadError ?? 'No se encontró el cliente.'}</Text>
      </View>
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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: '#666' }}>‹ Volver a clientes</Text>
      </Pressable>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>{client.name}</Text>
        <Text style={{ fontSize: 14, color: '#444' }}>{client.phone}</Text>
        {client.email && <Text style={{ fontSize: 14, color: '#444' }}>{client.email}</Text>}
      </View>

      {whatsapp.valid ? (
        <Pressable
          onPress={() => Linking.openURL(`https://wa.me/${whatsapp.number}`)}
          style={{ backgroundColor: '#25D366', padding: 14, borderRadius: 8 }}
        >
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>Contactar por WhatsApp</Text>
        </Pressable>
      ) : (
        <Text style={{ fontSize: 13, color: '#666' }}>
          El teléfono no tiene un formato válido para abrir WhatsApp directamente — el número sigue visible arriba
          para marcarlo a mano.
        </Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={statBoxStyle}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>{completed.length}</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>Citas completadas</Text>
        </View>
        <View style={statBoxStyle}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>{spent.toFixed(2)} €</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>Gastado</Text>
        </View>
        <View style={statBoxStyle}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>{expected.toFixed(2)} €</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>Previsto</Text>
        </View>
      </View>

      {nextAppointment && (
        <View style={{ ...cardStyle, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Próxima cita</Text>
          <Text style={{ fontSize: 14 }}>
            {formatLongDateInZone(new Date(nextAppointment.start_time), business.timezone)} ·{' '}
            {formatTimeInZone(new Date(nextAppointment.start_time), business.timezone)} · {nextAppointment.serviceName}
          </Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={sectionTitleStyle}>Notas internas</Text>
        {editingNotes ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={notesDraft}
              onChangeText={setNotesDraft}
              multiline
              numberOfLines={4}
              style={{ ...inputStyle, minHeight: 100, textAlignVertical: 'top' }}
              placeholder="Notas visibles solo para el negocio"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={handleSaveNotes}
                disabled={savingNotes}
                style={{ flex: 1, ...(savingNotes ? buttonDisabledStyle : buttonStyle) }}
              >
                <Text style={buttonTextStyle}>{savingNotes ? 'Guardando…' : 'Guardar'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setEditingNotes(false)}
                disabled={savingNotes}
                style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
              >
                <Text style={{ textAlign: 'center' }}>Cancelar</Text>
              </Pressable>
            </View>
            {notesError && <Text style={{ color: 'crimson' }}>{notesError}</Text>}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={{ color: client.notes ? '#111' : '#666' }}>{client.notes || 'Sin notas todavía.'}</Text>
            <Pressable onPress={openEditNotes}>
              <Text style={{ color: '#1d4ed8', fontWeight: '600' }}>Editar notas</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={sectionTitleStyle}>Historial de citas</Text>
        {(history ?? []).length === 0 ? (
          <Text style={{ color: '#666' }}>Todavía no tiene citas.</Text>
        ) : (
          (history ?? []).map((a) => (
            <View key={a.id} style={cardStyle}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '600' }}>
                  {formatLongDateInZone(new Date(a.start_time), business.timezone)} ·{' '}
                  {formatTimeInZone(new Date(a.start_time), business.timezone)}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: STATUS_COLORS[a.status] }}>
                  {STATUS_LABELS[a.status]}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#666' }}>
                {a.serviceName} · {a.price_at_booking} €
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
