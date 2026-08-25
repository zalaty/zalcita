import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';

type Mode = 'client' | 'business';

// Dos vías de acceso, coherentes con pantallas-flujos.md:
//  - Cliente: teléfono + OTP (sin contraseña que recordar, fricción mínima)
//  - Negocio: email + contraseña (cuenta creada en el onboarding, no
//    autoservicio de alta libre en el MVP)
export default function Login() {
  const [mode, setMode] = useState<Mode>('client');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function sendOtp() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) setError(error.message);
    else setOtpSent(true);
  }

  async function verifyOtp() {
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    if (error) setError(error.message);
    // La navegación tras login la resuelve app/index.tsx al detectar la sesión.
  }

  async function loginBusiness() {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setMode('client')}>
          <Text style={{ fontWeight: mode === 'client' ? '700' : '400' }}>Soy cliente</Text>
        </Pressable>
        <Pressable onPress={() => setMode('business')}>
          <Text style={{ fontWeight: mode === 'business' ? '700' : '400' }}>Soy un negocio</Text>
        </Pressable>
      </View>

      {mode === 'client' && !otpSent && (
        <>
          <TextInput
            placeholder="Teléfono (+34...)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Pressable onPress={sendOtp} style={{ backgroundColor: '#111', padding: 14, borderRadius: 8 }}>
            <Text style={{ color: '#fff', textAlign: 'center' }}>Enviar código</Text>
          </Pressable>
        </>
      )}

      {mode === 'client' && otpSent && (
        <>
          <TextInput
            placeholder="Código recibido por SMS"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Pressable onPress={verifyOtp} style={{ backgroundColor: '#111', padding: 14, borderRadius: 8 }}>
            <Text style={{ color: '#fff', textAlign: 'center' }}>Confirmar</Text>
          </Pressable>
        </>
      )}

      {mode === 'business' && (
        <>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <TextInput
            placeholder="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Pressable onPress={loginBusiness} style={{ backgroundColor: '#111', padding: 14, borderRadius: 8 }}>
            <Text style={{ color: '#fff', textAlign: 'center' }}>Entrar</Text>
          </Pressable>
        </>
      )}

      {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
    </View>
  );
}
