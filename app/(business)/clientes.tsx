import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const rowStyle = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee' };

interface ClientRow {
  id: string;
  name: string;
  phone: string;
}

// Los clientes anonimizados (is_anonymized=true) se excluyen del listado a
// propósito: sin nombre/teléfono utilizables no hay nada que el negocio
// pueda hacer con ellos aquí — sus citas pasadas siguen intactas en la BD
// por integridad referencial, solo desaparecen de esta lista de gestión.
export default function Clientes() {
  const router = useRouter();
  const { business } = useBusiness();

  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClientRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchClients = useCallback(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);

    (async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('business_id', business.id)
        .eq('is_anonymized', false)
        .order('name', { ascending: true });

      if (cancelled) return;
      if (error) {
        setListError('No se pudieron cargar los clientes.');
        setLoading(false);
        return;
      }
      setClients(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  useFocusEffect(fetchClients);

  // Búsqueda por nombre/teléfono: dos queries en paralelo en vez de un
  // .or() con el texto interpolado — un .or() se rompe si el texto trae
  // comas o paréntesis (habitual en nombres, "López, Ana"). Mismo patrón
  // que la búsqueda de cliente en cita.tsx.
  useEffect(() => {
    if (!business) return;
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      const [byName, byPhone] = await Promise.all([
        supabase
          .from('clients')
          .select('id, name, phone')
          .eq('business_id', business.id)
          .eq('is_anonymized', false)
          .ilike('name', `%${q}%`)
          .limit(10),
        supabase
          .from('clients')
          .select('id, name, phone')
          .eq('business_id', business.id)
          .eq('is_anonymized', false)
          .ilike('phone', `%${q}%`)
          .limit(10),
      ]);
      if (cancelled) return;
      const byId = new Map<string, ClientRow>();
      for (const c of [...(byName.data ?? []), ...(byPhone.data ?? [])]) byId.set(c.id, c);
      setSearchResults([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setSearching(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, business]);

  if (!business) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Mientras hay texto de búsqueda, se muestran sus resultados; al vaciar
  // el campo, vuelve la lista completa ya cargada.
  const showingSearch = query.trim().length >= 2;
  const listToShow = showingSearch ? searchResults ?? [] : clients ?? [];

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput placeholder="Buscar por nombre o teléfono" value={query} onChangeText={setQuery} style={inputStyle} />

      {(loading && !clients) || (showingSearch && searching && searchResults === null) ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={listToShow}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(business)/cliente/[id]', params: { id: item.id } })}
              style={rowStyle}
            >
              <Text style={{ fontSize: 15, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ fontSize: 13, color: '#666' }}>{item.phone}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={{ color: '#666' }}>
              {showingSearch ? 'No hay clientes que coincidan con la búsqueda.' : 'Todavía no tienes clientes.'}
            </Text>
          }
        />
      )}

      {listError && <Text style={{ color: 'crimson' }}>{listError}</Text>}
    </View>
  );
}
