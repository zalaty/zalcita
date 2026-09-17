import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Button, Card, Input } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// La más sencilla de Ajustes: solo name/phone/email/address. slug y
// timezone se muestran pero no se editan aquí — slug es la dirección
// pública ya compartida (cambiarla rompería enlaces/QR existentes) y
// timezone queda fijo en Europe/Madrid para el MVP.
export default function DatosNegocio() {
  const { business, refreshBusiness } = useBusiness();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // business ya viene completo de useBusiness() — no hace falta una query
  // aparte. Se sincroniza cuando business cambia de verdad (incluido tras
  // el refreshBusiness() posterior a guardar).
  useEffect(() => {
    if (!business) return;
    setName(business.name);
    setPhone(business.phone ?? '');
    setEmail(business.email ?? '');
    setAddress(business.address ?? '');
  }, [business]);

  const canSave = name.trim() !== '' && (email.trim() === '' || EMAIL_RE.test(email.trim())) && !saving;

  async function handleSave() {
    if (!business || !canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const { error } = await supabase
      .from('businesses')
      .update({
        name: name.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        email: email.trim() === '' ? null : email.trim(),
        address: address.trim() === '' ? null : address.trim(),
      })
      .eq('id', business.id);

    setSaving(false);
    if (error) {
      setSaveError('No se pudieron guardar los datos. Inténtalo de nuevo.');
      return;
    }

    await refreshBusiness();
    setSaveSuccess(true);
  }

  if (!business) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Datos del negocio
          </Text>

          <View style={{ gap: theme.spacing.md }}>
            <Input placeholder="Nombre del negocio" value={name} onChangeText={setName} />
            <Input placeholder="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Input
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input placeholder="Dirección" value={address} onChangeText={setAddress} />
          </View>

          <View
            style={{
              gap: theme.spacing.xs,
              marginTop: theme.spacing.lg,
              paddingTop: theme.spacing.lg,
              borderTopWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>Tu enlace de reservas</Text>
            <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>
              app.zalaty.com/{business.slug}
            </Text>
            <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>
              No se puede cambiar: es la dirección pública que ya puedes haber compartido (enlace o QR). Cambiarla
              rompería los que ya existen.
            </Text>
          </View>
        </Card>

        <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleSave} disabled={!canSave} />

        {saveSuccess && <Text style={{ ...theme.textStyles.body, color: theme.colors.success }}>Guardado.</Text>}
        {saveError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{saveError}</Text>}
      </ScrollView>
    </View>
  );
}
