import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/theme';
import { Button, Card, Input } from '@/components/ui';

type Mode = 'client' | 'business';

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
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.xl,
        backgroundColor: theme.colors.background,
      }}
    >
      {/* Mismo patrón que disponibilidad.tsx: Card contenedora centrada,
          acotada en ancho — así los inputs/botones no se estiran a todo el
          ancho de la pantalla en escritorio. */}
      <View style={{ width: '100%', maxWidth: theme.layout.contentMaxWidth, alignSelf: 'center' }}>
        <Card style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {(['client', 'business'] as const).map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={{
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radii.md,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      ...theme.textStyles.small,
                      fontWeight: selected ? theme.fontWeights.semibold : theme.fontWeights.regular,
                      color: selected ? theme.colors.textOnPrimary : theme.colors.textSecondary,
                    }}
                  >
                    {m === 'client' ? 'Soy cliente' : 'Soy un negocio'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'client' && !otpSent && (
            <>
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                Introduce tu email para identificarte. Te enviaremos un código de un solo uso.
              </Text>
              <Input
                placeholder="tú@email.com"
                value={clientEmail}
                onChangeText={setClientEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Button label={submitting ? 'Enviando…' : 'Enviar código'} onPress={sendOtp} disabled={!canSendOtp} />
            </>
          )}

          {mode === 'client' && otpSent && (
            <>
              <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
                Te hemos enviado un código a {clientEmail}. Introdúcelo aquí.
              </Text>
              <Input placeholder="Código de 6 dígitos" value={otp} onChangeText={setOtp} keyboardType="number-pad" />
              <Button
                label={submitting ? 'Confirmando…' : 'Confirmar código'}
                onPress={verifyOtp}
                disabled={!canVerifyOtp}
              />
              <Pressable onPress={sendOtp} disabled={submitting}>
                <Text style={{ ...theme.textStyles.small, color: theme.colors.primary, textAlign: 'center' }}>
                  Reenviar código
                </Text>
              </Pressable>
            </>
          )}

          {mode === 'business' && (
            <>
              <Input
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Input placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />
              <Button label={submitting ? 'Entrando…' : 'Entrar'} onPress={loginBusiness} disabled={!canLoginBusiness} />
              <Pressable onPress={() => router.push('/(auth)/registro-negocio')}>
                <Text style={{ ...theme.textStyles.small, color: theme.colors.primary, textAlign: 'center' }}>
                  ¿Tienes un negocio? Regístralo
                </Text>
              </Pressable>
            </>
          )}

          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </Card>
      </View>
    </View>
  );
}
