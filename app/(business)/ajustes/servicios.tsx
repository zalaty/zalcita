import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import type { Service } from '@/types/database';

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };

type Editing = Service | 'new' | null;

// Sin borrado a propósito: un servicio nunca se elimina (las citas pasadas
// lo referencian), solo se activa/desactiva. El lado cliente ya filtra por
// active=true (ver app/(client)/index.tsx), así que desactivar aquí basta
// para que deje de ofrecerse en nuevas reservas sin tocar el histórico.
export default function Servicios() {
  const { business } = useBusiness();

  const [services, setServices] = useState<Service[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Igual que en disponibilidad.tsx: useFocusEffect (no un useEffect suelto)
  // para que la lista se recargue también al volver a esta pestaña, no solo
  // al montar — los Tabs/Stacks de expo-router no desmontan las pantallas
  // entre navegaciones.
  const fetchServices = useCallback(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);

    (async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', business.id)
        .order('active', { ascending: false })
        .order('name', { ascending: true });

      if (cancelled) return;
      if (error) {
        setListError('No se pudieron cargar los servicios.');
        setLoading(false);
        return;
      }
      setServices(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  useFocusEffect(fetchServices);

  function openNew() {
    setEditing('new');
    setName('');
    setDurationMinutes('');
    setPrice('');
    setFormError(null);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setName(service.name);
    setDurationMinutes(String(service.duration_minutes));
    setPrice(String(service.price));
    setFormError(null);
  }

  function closeForm() {
    setEditing(null);
    setFormError(null);
  }

  const parsedDuration = Number(durationMinutes);
  const parsedPrice = Number(price);
  const canSubmit =
    name.trim() !== '' &&
    Number.isFinite(parsedDuration) &&
    parsedDuration > 0 &&
    Number.isFinite(parsedPrice) &&
    parsedPrice >= 0 &&
    !saving;

  async function handleSave() {
    if (!business || editing === null || !canSubmit) return;
    setSaving(true);
    setFormError(null);

    if (editing === 'new') {
      const { error } = await supabase.from('services').insert({
        business_id: business.id,
        name: name.trim(),
        duration_minutes: parsedDuration,
        price: parsedPrice,
        active: true,
      });

      if (error) {
        setFormError('No se pudo crear el servicio. Inténtalo de nuevo.');
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from('services')
        .update({
          name: name.trim(),
          duration_minutes: parsedDuration,
          price: parsedPrice,
        })
        .eq('id', editing.id);

      if (error) {
        setFormError('No se pudo guardar el servicio. Inténtalo de nuevo.');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setEditing(null);
    fetchServices();
  }

  async function handleToggleActive(service: Service) {
    setListError(null);
    setTogglingId(service.id);

    const { error } = await supabase
      .from('services')
      .update({ active: !service.active })
      .eq('id', service.id);

    setTogglingId(null);
    if (error) {
      setListError('No se pudo cambiar el estado del servicio.');
      return;
    }
    fetchServices();
  }

  if (!business) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      {editing !== null ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' }}>
            {editing === 'new' ? 'Nuevo servicio' : 'Editar servicio'}
          </Text>
          <TextInput placeholder="Nombre" value={name} onChangeText={setName} style={inputStyle} />
          <TextInput
            placeholder="Duración (minutos)"
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            keyboardType="number-pad"
            style={inputStyle}
          />
          <TextInput
            placeholder="Precio (€)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={handleSave}
              disabled={!canSubmit}
              style={{ flex: 1, ...(canSubmit ? buttonStyle : buttonDisabledStyle) }}
            >
              <Text style={buttonTextStyle}>{saving ? 'Guardando…' : 'Guardar'}</Text>
            </Pressable>
            <Pressable
              onPress={closeForm}
              style={{ flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' }}
            >
              <Text style={{ textAlign: 'center' }}>Cancelar</Text>
            </Pressable>
          </View>
          {formError && <Text style={{ color: 'crimson' }}>{formError}</Text>}
        </View>
      ) : (
        <Pressable onPress={openNew} style={buttonStyle}>
          <Text style={buttonTextStyle}>Nuevo servicio</Text>
        </Pressable>
      )}

      {loading && !services ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={services ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#eee',
                opacity: item.active ? 1 : 0.6,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600' }}>
                  {item.name}
                  {!item.active ? ' (Inactivo)' : ''}
                </Text>
                <Text style={{ fontSize: 13, color: '#666' }}>
                  {item.duration_minutes} min · {item.price} €
                </Text>
              </View>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  handleToggleActive(item);
                }}
                disabled={togglingId === item.id}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: '#ccc',
                }}
              >
                <Text style={{ fontSize: 13 }}>
                  {togglingId === item.id ? '…' : item.active ? 'Desactivar' : 'Activar'}
                </Text>
              </Pressable>
            </Pressable>
          )}
          ListEmptyComponent={<Text>Todavía no tienes servicios.</Text>}
        />
      )}

      {listError && <Text style={{ color: 'crimson' }}>{listError}</Text>}
    </View>
  );
}
