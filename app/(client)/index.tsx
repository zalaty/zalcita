import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Card, Screen } from '@/components/ui';
import { fetchClientBusinesses, type ClientBusiness } from '@/lib/appointments';
import type { Service } from '@/types/database';

// Punto de entrada del cliente: zalcita.com/?slug={slug} en web (query
// param, no path — ver lib/config.ts). No requiere login (ver
// pantallas-flujos.md, sección 1.1 "Acceso al negocio").
//
// TODO (siguientes iteraciones, en orden):
//  1. Selección de servicio (esta pantalla) -> guardar service_id elegido
//  2. Calendario de disponibilidad ((client)/disponibilidad, hecho)
//  3. Crear perfil / login (solo aquí se exige, ver flujo 1.2 y 1.3)
//  4. Confirmación + reserva + pago condicional (payment_policy del negocio)
export default function ClientHome() {
  const theme = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { width } = useWindowDimensions();
  const isNarrow = width < theme.breakpoints.narrow;
  const { session, loading: authLoading } = useAuth();

  const [businessName, setBusinessName] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  // Selector de negocio: solo aplica cuando NO hay slug y hay sesión — el
  // cliente que entra por enlace/QR nunca pasa por aquí. Sin slug, un
  // cliente con 1 sola ficha va directo a reservar (abajo); con 2+, ve un
  // selector; sin sesión o sin ninguna ficha, se queda con el mensaje
  // genérico de siempre.
  const [clientBusinesses, setClientBusinesses] = useState<ClientBusiness[] | null>(null);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);

  // Se pide con o sin slug: sin slug decide el auto-redirect/selector de
  // abajo; CON slug (ya viendo un negocio) sirve para saber si mostrar
  // "Cambiar de negocio" (solo tiene sentido con 2+ negocios).
  useEffect(() => {
    if (!session) {
      setClientBusinesses(null);
      return;
    }
    let cancelled = false;
    setLoadingBusinesses(true);
    fetchClientBusinesses(session.user.id).then(({ data }) => {
      if (cancelled) return;
      setClientBusinesses(data ?? []);
      setLoadingBusinesses(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Negocio único: no tiene sentido preguntar, se entra directo — mismo
  // router.replace con slug en params que ya usa confirmacion.tsx al volver
  // al inicio, así que el flujo de abajo arranca exactamente como si el
  // cliente hubiera entrado por su enlace real.
  useEffect(() => {
    if (!slug && clientBusinesses && clientBusinesses.length === 1) {
      router.replace({ pathname: '/(client)', params: { slug: clientBusinesses[0].slug } });
    }
  }, [slug, clientBusinesses, router]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    supabase
      .from('businesses')
      .select('id, name, services(*)')
      .eq('slug', slug)
      .eq('active', true)
      .single()
      .then(({ data, error }) => {
        if (error) console.warn(error.message);
        setBusinessName(data?.name ?? null);
        // @ts-expect-error — el tipo del join se afinará al generar los
        // tipos reales con `supabase gen types`.
        setServices(data?.services?.filter((s: Service) => s.active) ?? []);
        setLoading(false);
      });
  }, [slug]);

  if (!slug) {
    // authLoading: todavía no sabemos si hay sesión. loadingBusinesses: sí
    // hay sesión, cargando sus fichas. length===1: ya se sabe que hay
    // exactamente un negocio — el efecto de arriba está redirigiendo, este
    // spinner cubre ese instante en vez de mostrar el mensaje genérico un
    // frame para luego saltar.
    if (authLoading || (session && loadingBusinesses) || (session && clientBusinesses?.length === 1)) {
      return (
        <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </Screen>
      );
    }

    if (session && clientBusinesses && clientBusinesses.length > 1) {
      return (
        <Screen>
          <ScrollView
            contentContainerStyle={{
              padding: theme.spacing.lg,
              width: '100%',
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: 'center',
            }}
          >
            <Card>
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
                ¿Dónde quieres reservar?
              </Text>
              <View style={{ gap: theme.spacing.sm }}>
                {clientBusinesses.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => router.push({ pathname: '/(client)', params: { slug: b.slug } })}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radii.md,
                      backgroundColor: theme.colors.surface,
                      padding: theme.spacing.md,
                      ...theme.shadows.sm,
                    }}
                  >
                    <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{b.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          </ScrollView>
        </Screen>
      );
    }

    // Sin sesión, o logueado pero sin ninguna ficha todavía: mismo mensaje
    // genérico de siempre. El enlace a login solo tiene sentido sin sesión
    // — es opcional, nunca se fuerza el login para reservar por enlace.
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' }}>
          Accede desde el enlace de tu negocio para reservar una cita.
        </Text>
        {!session && (
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text style={{ ...theme.textStyles.small, color: theme.colors.primary, textAlign: 'center' }}>
              ¿Ya has reservado antes? Inicia sesión para ver tus reservas
            </Text>
          </Pressable>
        )}
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  const avatarSize = isNarrow ? 40 : 56;
  const businessInitial = (businessName ?? '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: theme.spacing.lg,
          width: '100%',
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: 'center',
        }}
      >
        {/* Mismo patrón que disponibilidad.tsx: una Card contenedora agrupa
            identidad del negocio + contenido de la pantalla. */}
        <Card>
          {businessName && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                paddingBottom: theme.spacing.lg,
                marginBottom: theme.spacing.lg,
              }}
            >
              {/* Hueco reservado para el logo del negocio (tanda futura) —
                  ver la misma nota en disponibilidad.tsx. */}
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
                {businessName}
              </Text>
            </View>
          )}

          {/* Salida del negocio actual hacia el selector — solo tiene
              sentido si hay a dónde cambiar (2+ negocios); con 1 solo o sin
              sesión no se muestra. router.replace sin slug reentra por el
              mismo arranque sin slug de arriba (auto-redirect/selector/
              mensaje), no duplica esa lógica. */}
          {session && clientBusinesses && clientBusinesses.length > 1 && (
            <Pressable onPress={() => router.replace('/(client)')} style={{ marginBottom: theme.spacing.md }}>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>Cambiar de negocio</Text>
            </Pressable>
          )}

          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Elige un servicio
          </Text>
          <FlatList
            data={services}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(client)/disponibilidad',
                    params: { slug: slug!, service_id: item.id },
                  })
                }
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                  padding: theme.spacing.md,
                  ...theme.shadows.sm,
                }}
              >
                <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{item.name}</Text>
                <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
                  {item.duration_minutes} min · {item.price} €
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                Este negocio todavía no tiene servicios publicados.
              </Text>
            }
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}
