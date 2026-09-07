import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Mode = 'client' | 'business';

const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const };

// Dos vías de acceso, coherentes con pantallas-flujos.md:
//  - Cliente: email + OTP, mismo mecanismo que app/(client)/confirmacion.tsx
//    (se cambió de SMS a email hace tiempo para no depender de un proveedor
//    de pago; esta pantalla se había quedado con el teléfono original —
//    incoherencia ya detectada, corregida aquí).
//  - Negocio: email + contraseña. Alta autoservicio en
//    app/(auth)/registro-negocio.tsx (enlazada más abajo); esta pantalla es
//    solo para negocios que ya tienen cuenta.
export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('client');
  const [clientEmail, setClientEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function sendOtp() {
    setError(null);
    setSubmitting(true);
    // shouldCreateUser: true (valor por defecto) explícito — un cliente
    // nuevo se registra sobre la marcha al meter su email por primera vez,
    // igual que en confirmacion.tsx.
    const { error } = await supabase.auth.signInWithOtp({
      email: clientEmail,
      options: { shouldCreateUser: true },
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOtpSent(true);
  }

  async function verifyOtp() {
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({ email: clientEmail, token: otp, type: 'email' });
    if (error) {
      setSubmitting(false);
      setError(error.message);
      return;
    }
    // La sesión ya está creada (onAuthStateChange de AuthContext ya
    // disparó resolveRole). A diferencia de confirmacion.tsx, que se queda
    // en la misma pantalla y reacciona al cambio de sesión con su propio
    // estado interno, aquí SÍ hay que salir de /login explícitamente — si
    // no, la pantalla se queda anclada en el paso del código aunque el
    // login haya funcionado (justo el bug reportado). Se navega a "/" en
    // vez de a una ruta fija: el índice raíz ya sabe encaminar por rol
    // (cliente/negocio), así no se duplica esa lógica aquí.
    router.replace('/');
  }

  async function loginBusiness() {
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setSubmitting(false);
      setError(error.message);
      return;
    }
    router.replace('/');
  }

  const canSendOtp = clientEmail.trim() !== '' && !submitting;
  const canVerifyOtp = otp.trim() !== '' && !submitting;
  const canLoginBusiness = email.trim() !== '' && password !== '' && !submitting;

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
          <Text>Introduce tu email para identificarte. Te enviaremos un código de un solo uso.</Text>
          <TextInput
            placeholder="tú@email.com"
            value={clientEmail}
            onChangeText={setClientEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Pressable onPress={sendOtp} disabled={!canSendOtp} style={canSendOtp ? buttonStyle : buttonDisabledStyle}>
            <Text style={buttonTextStyle}>{submitting ? 'Enviando…' : 'Enviar código'}</Text>
          </Pressable>
        </>
      )}

      {mode === 'client' && otpSent && (
        <>
          <Text>Te hemos enviado un código a {clientEmail}. Introdúcelo aquí.</Text>
          <TextInput
            placeholder="Código de 6 dígitos"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 }}
          />
          <Pressable onPress={verifyOtp} disabled={!canVerifyOtp} style={canVerifyOtp ? buttonStyle : buttonDisabledStyle}>
            <Text style={buttonTextStyle}>{submitting ? 'Confirmando…' : 'Confirmar código'}</Text>
          </Pressable>
          <Pressable onPress={sendOtp} disabled={submitting}>
            <Text style={{ color: '#666', textAlign: 'center' }}>Reenviar código</Text>
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
          <Pressable
            onPress={loginBusiness}
            disabled={!canLoginBusiness}
            style={canLoginBusiness ? buttonStyle : buttonDisabledStyle}
          >
            <Text style={buttonTextStyle}>{submitting ? 'Entrando…' : 'Entrar'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(auth)/registro-negocio')}>
            <Text style={{ color: '#666', textAlign: 'center' }}>¿Tienes un negocio? Regístralo</Text>
          </Pressable>
        </>
      )}

      {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
    </View>
  );
}
