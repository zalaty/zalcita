import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/theme';
import { Card, Screen } from '@/components/ui';
import type { Service } from '@/types/database';

// Punto de entrada del cliente: app.zalaty.com/{slug} en web, o deep link
// zalaty://{slug} en móvil. No requiere login (ver pantallas-flujos.md,
// sección 1.1 "Acceso al negocio").
//
// TODO (siguientes iteraciones, en orden):
//  1. Selección de servicio (esta pantalla) -> guardar service_id elegido
//  2. Calendario de disponibilidad ((client)/disponibilidad, hecho)
//  3. Crear perfil / login (solo aquí se exige, ver flujo 1.2 y 1.3)
//  4. Confirmación + reserva + pago condicional (payment_policy del negocio)
export default function ClientHome() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { width } = useWindowDimensions();
  const isNarrow = width < theme.breakpoints.narrow;

  const [businessName, setBusinessName] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

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
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl }}>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' }}>
          Accede desde el enlace o QR de tu negocio para ver su disponibilidad.
        </Text>
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
