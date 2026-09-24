import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { formatLongDateInZone } from '@/lib/timezone';
import { theme } from '@/theme';
import { Badge, Button, Screen } from '@/components/ui';

const TAB_ICON_SIZE = 24;

interface BusinessRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  active: boolean;
  timezone: string;
}

const cardStyle = {
  padding: theme.spacing.md,
  borderRadius: theme.radii.md,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.surface,
  gap: theme.spacing.xs,
  ...theme.shadows.sm,
};

// /admin vive FUERA de (business) a propósito (ver app/admin/_layout.tsx):
// su guarda es solo session + is_platform_admin(), independiente de tener
// negocio propio. Por eso esta tira NO es el <Tabs> real del panel — es una
// fila con el mismo aspecto que navega a (business)/... por ruta explícita.
// Ninguna se marca "activa": Administración no es una de las cuatro
// secciones. Cuando se rediseñe la tab bar real, alinear esta tira también.
const NAV_ITEMS = [
  { label: 'Calendario', href: '/(business)/calendario' as const, icon: 'calendar-outline' as const },
  { label: 'Clientes', href: '/(business)/clientes' as const, icon: 'people-outline' as const },
  { label: 'Resumen', href: '/(business)/resumen' as const, icon: 'bar-chart-outline' as const },
  { label: 'Ajustes', href: '/(business)/ajustes' as const, icon: 'settings-outline' as const },
];

function contactLabel(b: BusinessRow): string {
  const parts = [b.phone, b.email].filter((v): v is string => !!v);
  return parts.length > 0 ? parts.join(' · ') : 'Sin contacto registrado';
}

// Aprobar/desactivar negocios: hasta ahora había que hacerlo a mano en el
// SQL Editor desactivando protect_business_active_column. Aquí el UPDATE lo
// hace el propio admin autenticado, así que el trigger (0004/0006) lo deja
// pasar sin tocar nada más — is_platform_admin() ya es cierto para él.
export default function AdminNegocios() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }

  const pending = (businesses ?? []).filter((b) => !b.active);
  const approved = (businesses ?? []).filter((b) => b.active);

  function renderBusiness(b: BusinessRow, action: 'approve' | 'deactivate') {
    const isActing = actingId === b.id;
    const isConfirming = confirmingDeactivateId === b.id;

    return (
      <View key={b.id} style={cardStyle}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
          <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 }}>{b.name}</Text>
          <Badge label={b.active ? 'Aprobado' : 'Pendiente'} tone={b.active ? 'success' : 'warning'} />
        </View>
        <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>{contactLabel(b)}</Text>
        <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>
          Registrado el {formatLongDateInZone(new Date(b.created_at), b.timezone)}
        </Text>

        {action === 'approve' ? (
          <Button label={isActing ? 'Aprobando…' : 'Aprobar'} onPress={() => handleApprove(b.id)} disabled={isActing} />
        ) : isConfirming ? (
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
            <Text style={{ ...theme.textStyles.small, color: theme.colors.danger }}>
              Este negocio dejará de ser visible para clientes y no podrá recibir nuevas reservas. Las citas ya
              existentes no se borran, pero el negocio queda congelado.
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={isActing ? '…' : 'Sí, desactivar'}
                  onPress={() => handleDeactivate(b.id)}
                  disabled={isActing}
                  variant="danger"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="No, mantener"
                  onPress={() => setConfirmingDeactivateId(null)}
                  disabled={isActing}
                  variant="secondary"
                />
              </View>
            </View>
          </View>
        ) : (
          // Fuera del Button del sistema a propósito: aquí SÍ hace falta un
          // outline en tono danger ("acción de riesgo, todavía no confirmada"),
          // y la variante "secondary" de Button siempre es teal — no hay
          // combinación outline+danger en el componente. Mismos tokens, solo
          // el hex suelto de antes pasa a theme.colors.danger.
          <Pressable
            onPress={() => setConfirmingDeactivateId(b.id)}
            style={{
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.danger,
              alignItems: 'center',
            }}
          >
            <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.danger }}>Desactivar</Text>
          </Pressable>
        )}
      </View>
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
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
            Administración
          </Text>
          {/* Navegación EXPLÍCITA a Ajustes, nunca router.back(): /admin no
              está dentro del stack de (business), así que "atrás" no tiene
              garantizado a dónde cae (mismo motivo que el fix de
              cliente/[id].tsx). */}
          <Pressable onPress={() => router.replace('/(business)/ajustes')}>
            <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>‹ Ajustes</Text>
          </Pressable>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>Negocios pendientes</Text>
          {pending.length === 0 ? (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
              No hay negocios pendientes.
            </Text>
          ) : (
            pending.map((b) => renderBusiness(b, 'approve'))
          )}
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>Negocios aprobados</Text>
          {approved.length === 0 ? (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
              No hay negocios aprobados todavía.
            </Text>
          ) : (
            approved.map((b) => renderBusiness(b, 'deactivate'))
          )}
        </View>

        {listError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{listError}</Text>}
      </ScrollView>

      {/* Tira de navegación con el mismo aspecto que la tab bar del panel —
          NO es el <Tabs> real (ver NAV_ITEMS): admin queda fuera de
          (business) para no acoplar su guarda a role==='business'. */}
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingBottom: insets.bottom,
        }}
      >
        {NAV_ITEMS.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.replace(item.href)}
            style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: theme.spacing.sm }}
          >
            {/* Siempre en tono inactivo: Administración no es una de estas
                cuatro secciones, así que ninguna se marca como activa. */}
            <Ionicons name={item.icon} size={TAB_ICON_SIZE} color={theme.colors.textSecondary} />
            <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
