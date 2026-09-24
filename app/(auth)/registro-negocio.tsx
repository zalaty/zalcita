import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { theme } from '@/theme';
import { Button, Input, Screen } from '@/components/ui';

type Step = 'form' | 'code';

// Alta autoservicio de negocio. El negocio queda active=false (pendiente
// de aprobación) hasta que un administrador de plataforma lo apruebe — eso
// se gestiona en supabase/migrations/0004_business_signup.sql, no aquí.
//
// La confirmación de email está activada para negocios (a diferencia del
// OTP de clientes, que no la necesita). La plantilla "Confirm signup" de
// este proyecto envía un CÓDIGO, no un enlace, así que el paso 'code' se
// verifica con verifyOtp({ type: 'signup' }) — mismo patrón que el OTP de
// clientes en confirmacion.tsx — en vez de depender de un redirect por URL.
//
// Los datos del negocio y del dueño viajan en los metadatos del usuario
// (options.data), que sobreviven a la confirmación pase donde pase (otro
// dispositivo, minutos u horas después): no hay auth.uid() hasta que se
// verifica el código, así que aquí NO se crea el negocio todavía. Al
// verificar, AuthContext.resolveRole detecta esos metadatos y crea el
// negocio automáticamente — ver context/AuthContext.tsx.
export default function RegistroNegocio() {
  const router = useRouter();
  const { refreshRole } = useAuth();

  const [step, setStep] = useState<Step>('form');
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmitForm =
    businessName.trim() !== '' &&
    ownerName.trim() !== '' &&
    email.trim() !== '' &&
    password !== '' &&
    !submitting;
  const canSubmitCode = code.trim() !== '' && !submitting;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          business_name: businessName.trim(),
          owner_name: ownerName.trim(),
        },
      },
    });

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? 'No se pudo crear la cuenta.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setStep('code');
  }

  async function handleVerifyCode() {
    setError(null);
    setSubmitting(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'signup',
    });

    if (verifyError) {
      setError(verifyError.message);
      setSubmitting(false);
      return;
    }

    // verifyOtp establece sesión y dispara onAuthStateChange, pero
    // resolveRole (donde se crea el negocio, ver AuthContext) corre en
    // paralelo a esta función: forzamos refreshRole() y esperamos a que
    // termine antes de navegar, para no aterrizar en /(business)/resumen
    // con el rol todavía sin resolver.
    await refreshRole();
    router.replace('/(business)/resumen');
  }

  async function handleResendCode() {
    setError(null);
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    if (resendError) setError(resendError.message);
  }

  if (step === 'code') {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            width: '100%',
            maxWidth: theme.layout.panelMaxWidth,
            alignSelf: 'center',
          }}
        >
          <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
            Revisa tu correo
          </Text>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
            Te hemos enviado un código a {email}. Introdúcelo aquí para confirmar tu cuenta de
            negocio.
          </Text>

          <Input
            placeholder="Código recibido por correo"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
          />

          <Button
            label={submitting ? 'Confirmando…' : 'Confirmar código'}
            onPress={handleVerifyCode}
            disabled={!canSubmitCode}
          />

          <Pressable onPress={handleResendCode}>
            <Text style={{ ...theme.textStyles.small, color: theme.colors.primary, textAlign: 'center' }}>
              Reenviar código
            </Text>
          </Pressable>

          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: theme.layout.panelMaxWidth,
          alignSelf: 'center',
        }}
      >
        <Text accessibilityRole="header" style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
          Registra tu negocio
        </Text>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
          Tu negocio queda pendiente de aprobación. Podrás entrar a configurarlo mientras tanto,
          pero no recibirá reservas hasta que lo aprobemos.
        </Text>

        <Input placeholder="Nombre del negocio" value={businessName} onChangeText={setBusinessName} />
        <Input placeholder="Tu nombre" value={ownerName} onChangeText={setOwnerName} />
        <Input
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />

        <Button
          label={submitting ? 'Creando cuenta…' : 'Crear negocio'}
          onPress={handleSubmit}
          disabled={!canSubmitForm}
        />

        {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}
