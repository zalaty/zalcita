import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/context/ThemeContext';
import { PUBLIC_APP_URL } from '@/lib/config';
import { Button, Card, Input, Screen } from '@/components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// La más sencilla de Ajustes: solo name/phone/email/address. slug y
// timezone se muestran pero no se editan aquí — slug es la dirección
// pública ya compartida (cambiarla rompería enlaces/QR existentes) y
// timezone queda fijo en Europe/Madrid para el MVP.
export default function DatosNegocio() {
  const theme = useTheme();
  const router = useRouter();
  const { business, refreshBusiness } = useBusiness();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [copied, setCopied] = useState(false);

  async function handleCopyBookingUrl(url: string) {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  // Query param (?slug=), NO path — es como de verdad entra un cliente
  // (ver app/(client)/index.tsx). Antes mostraba un dominio y formato
  // equivocados (app.zalaty.com/{slug} como path); copiar ese enlace daba
  // un link muerto.
  const bookingUrl = `${PUBLIC_APP_URL}/?slug=${business.slug}`;

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
        {/* Navegación EXPLÍCITA, nunca router.back(): mismo patrón que
            "‹ Volver a clientes" en cliente/[id].tsx — esta subpágina vive
            en el Stack anidado de ajustes/_layout.tsx, y la pestaña
            "Ajustes" de la tab bar no te devuelve aquí sola. */}
        <Pressable onPress={() => router.replace('/(business)/ajustes')}>
          <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>‹ Volver a Ajustes</Text>
        </Pressable>

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary }}>{bookingUrl}</Text>
              <Pressable onPress={() => handleCopyBookingUrl(bookingUrl)}>
                <Text style={{ ...theme.textStyles.small, color: theme.colors.primary }}>
                  {copied ? '¡Copiado!' : 'Copiar'}
                </Text>
              </Pressable>
            </View>
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
    </Screen>
  );
}
