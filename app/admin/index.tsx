import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatLongDateInZone } from '@/lib/timezone';

interface BusinessRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  active: boolean;
  timezone: string;
}

const buttonStyle = { backgroundColor: '#111', padding: 10, borderRadius: 8 };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const cardStyle = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', gap: 6 };
const sectionTitleStyle = { fontSize: 16, fontWeight: '700' as const };

function contactLabel(b: BusinessRow): string {
  const parts = [b.phone, b.email].filter((v): v is string => !!v);
  return parts.length > 0 ? parts.join(' · ') : 'Sin contacto registrado';
}

// Aprobar/desactivar negocios: hasta ahora había que hacerlo a mano en el
// SQL Editor desactivando protect_business_active_column. Aquí el UPDATE lo
// hace el propio admin autenticado, así que el trigger (0004/0006) lo deja
// pasar sin tocar nada más — is_platform_admin() ya es cierto para él.
export default function AdminNegocios() {
  const [businesses, setBusinesses] = useState<BusinessRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmingDeactivateId, setConfirmingDeactivateId] = useState<string | null>(null);

  // Una sola query trae todos los negocios (la política de admin es FOR ALL
  // sin restricción) y se separan en dos grupos en JS — evita dos
  // round-trips para lo que en el fondo es el mismo conjunto de datos.
  const fetchBusinesses = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);

    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, phone, email, created_at, active, timezone')
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        setListError('No se pudieron cargar los negocios.');
        setLoading(false);
        return;
      }
      setBusinesses(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(fetchBusinesses);

  async function handleApprove(id: string) {
    setListError(null);
    setActingId(id);

    const { error } = await supabase.from('businesses').update({ active: true }).eq('id', id);

    setActingId(null);
    if (error) {
      setListError(
        error.code === '42501' ? 'No tienes permisos de administrador para esta acción.' : 'No se pudo aprobar el negocio.'
      );
      return;
    }
    fetchBusinesses();
  }

  async function handleDeactivate(id: string) {
    setListError(null);
    setActingId(id);

    const { error } = await supabase.from('businesses').update({ active: false }).eq('id', id);

    setActingId(null);
    if (error) {
      setListError(
        error.code === '42501' ? 'No tienes permisos de administrador para esta acción.' : 'No se pudo desactivar el negocio.'
      );
      return;
    }
    setConfirmingDeactivateId(null);
    fetchBusinesses();
  }

  if (loading && !businesses) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const pending = (businesses ?? []).filter((b) => !b.active);
  const approved = (businesses ?? []).filter((b) => b.active);

  function renderBusiness(b: BusinessRow, action: 'approve' | 'deactivate') {
    const isActing = actingId === b.id;
    const isConfirming = confirmingDeactivateId === b.id;

    return (
      <View key={b.id} style={cardStyle}>
        <Text style={{ fontSize: 15, fontWeight: '600' }}>{b.name}</Text>
        <Text style={{ fontSize: 13, color: '#666' }}>{contactLabel(b)}</Text>
        <Text style={{ fontSize: 12, color: '#999' }}>
          Registrado el {formatLongDateInZone(new Date(b.created_at), b.timezone)}
        </Text>

        {action === 'approve' ? (
          <Pressable onPress={() => handleApprove(b.id)} disabled={isActing} style={buttonStyle}>
            <Text style={buttonTextStyle}>{isActing ? 'Aprobando…' : 'Aprobar'}</Text>
          </Pressable>
        ) : isConfirming ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, color: '#b91c1c' }}>
              Este negocio dejará de ser visible para clientes y no podrá recibir nuevas reservas. Las citas ya
              existentes no se borran, pero el negocio queda congelado.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => handleDeactivate(b.id)}
                disabled={isActing}
                style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#b91c1c' }}
              >
                <Text style={{ color: '#b91c1c', textAlign: 'center', fontWeight: '600' }}>
                  {isActing ? '…' : 'Sí, desactivar'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingDeactivateId(null)}
                disabled={isActing}
                style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
              >
                <Text style={{ textAlign: 'center' }}>No, mantener</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmingDeactivateId(b.id)}
            style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#b91c1c' }}
          >
            <Text style={{ color: '#b91c1c', textAlign: 'center', fontWeight: '600' }}>Desactivar</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ gap: 12 }}>
        <Text style={sectionTitleStyle}>Pendientes de aprobación</Text>
        {pending.length === 0 ? (
          <Text style={{ color: '#666' }}>No hay negocios pendientes.</Text>
        ) : (
          pending.map((b) => renderBusiness(b, 'approve'))
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Text style={sectionTitleStyle}>Negocios aprobados</Text>
        {approved.length === 0 ? (
          <Text style={{ color: '#666' }}>No hay negocios aprobados todavía.</Text>
        ) : (
          approved.map((b) => renderBusiness(b, 'deactivate'))
        )}
      </View>

      {listError && <Text style={{ color: 'crimson' }}>{listError}</Text>}
    </ScrollView>
  );
}
