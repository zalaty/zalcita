import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Badge, Button, Card, Input, Screen } from '@/components/ui';
import type { Service } from '@/types/database';

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
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

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
        <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
          Servicios
        </Text>

        {editing !== null ? (
          <Card>
            <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
              {editing === 'new' ? 'Nuevo servicio' : 'Editar servicio'}
            </Text>
            <View style={{ gap: theme.spacing.md }}>
              <Input placeholder="Nombre" value={name} onChangeText={setName} />
              <Input
                placeholder="Duración (minutos)"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="number-pad"
              />
              <Input placeholder="Precio (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleSave} disabled={!canSubmit} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Cancelar" onPress={closeForm} variant="secondary" />
                </View>
              </View>
              {formError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{formError}</Text>}
            </View>
          </Card>
        ) : (
          <Button label="+ Nuevo servicio" onPress={openNew} />
        )}

        {loading && !services ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <FlatList
            data={services ?? []}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openEdit(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                  ...theme.shadows.sm,
                  opacity: item.active ? 1 : 0.6,
                }}
              >
                <View style={{ flex: 1, gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                    <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{item.name}</Text>
                    {!item.active && <Badge label="Inactivo" tone="neutral" />}
                  </View>
                  <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
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
                    paddingVertical: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.sm,
                    borderRadius: theme.radii.sm,
                    borderWidth: 1,
                    borderColor: theme.colors.borderStrong,
                  }}
                >
                  <Text style={{ ...theme.textStyles.small, color: theme.colors.textPrimary }}>
                    {togglingId === item.id ? '…' : item.active ? 'Desactivar' : 'Activar'}
                  </Text>
                </Pressable>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                Todavía no tienes servicios.
              </Text>
            }
          />
        )}

        {listError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{listError}</Text>}
      </ScrollView>
    </Screen>
  );
}
