import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import type { Service } from '@/types/database';

// Punto de entrada del cliente: app.zalaty.com/{slug} en web, o deep link
// zalaty://{slug} en móvil. No requiere login (ver pantallas-flujos.md,
// sección 1.1 "Acceso al negocio").
//
// TODO (siguientes iteraciones, en orden):
//  1. Selección de servicio (esta pantalla) -> guardar service_id elegido
//  2. Calendario de disponibilidad (nueva ruta (client)/[slug]/disponibilidad)
//  3. Selector de hora
//  4. Crear perfil / login (solo aquí se exige, ver flujo 1.2 y 1.3)
//  5. Confirmación + pago condicional (payment_policy del negocio)
export default function ClientHome() {
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Accede desde el enlace o QR de tu negocio para ver su disponibilidad.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Elige un servicio</Text>
      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontSize: 15 }}>{item.name}</Text>
            <Text style={{ fontSize: 13, color: '#666' }}>
              {item.duration_minutes} min · {item.price} €
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text>Este negocio todavía no tiene servicios publicados.</Text>}
      />
    </View>
  );
}
