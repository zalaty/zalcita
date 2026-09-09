import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';

const inputStyle = { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 };
const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };
const sectionTitleStyle = { fontSize: 16, fontWeight: '700' as const };
const noteStyle = { fontSize: 12, color: '#666' };

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
      <View style={{ gap: 12 }}>
        <Text style={sectionTitleStyle}>Datos del negocio</Text>

        <TextInput placeholder="Nombre del negocio" value={name} onChangeText={setName} style={inputStyle} />
        <TextInput
          placeholder="Teléfono"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={inputStyle}
        />
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={inputStyle}
        />
        <TextInput placeholder="Dirección" value={address} onChangeText={setAddress} style={inputStyle} />
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: '#444' }}>Tu enlace de reservas</Text>
        <Text style={{ fontSize: 14, fontWeight: '600' }}>app.zalaty.com/{business.slug}</Text>
        <Text style={noteStyle}>
          No se puede cambiar: es la dirección pública que ya puedes haber compartido (enlace o QR). Cambiarla
          rompería los que ya existen.
        </Text>
      </View>

      <Pressable onPress={handleSave} disabled={!canSave} style={canSave ? buttonStyle : buttonDisabledStyle}>
        <Text style={buttonTextStyle}>{saving ? 'Guardando…' : 'Guardar'}</Text>
      </Pressable>

      {saveSuccess && <Text style={{ color: '#15803d' }}>Guardado.</Text>}
      {saveError && <Text style={{ color: 'crimson' }}>{saveError}</Text>}
    </ScrollView>
  );
}
