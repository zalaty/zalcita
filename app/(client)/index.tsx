import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/theme';
import { Card } from '@/components/ui';
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
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    supabase
      .from('businesses')
      .select('id, services(*)')
      .eq('slug', slug)
      .eq('active', true)
      .single()
      .then(({ data, error }) => {
        if (error) console.warn(error.message);
        // @ts-expect-error — el tipo del join se afinará al generar los
        // tipos reales con `supabase gen types`.
        setServices(data?.services?.filter((s: Service) => s.active) ?? []);
        setLoading(false);
      });
  }, [slug]);

  if (!slug) {
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
          Accede desde el enlace o QR de tu negocio para ver su disponibilidad.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
        Elige un servicio
      </Text>
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: theme.spacing.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(client)/disponibilidad',
                params: { slug: slug!, service_id: item.id },
              })
            }
          >
            <Card>
              <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{item.name}</Text>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
                {item.duration_minutes} min · {item.price} €
              </Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
            Este negocio todavía no tiene servicios publicados.
          </Text>
        }
      />
    </View>
  );
}
