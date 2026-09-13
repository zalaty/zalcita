import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { theme } from '@/theme';
import { Button, Card, Input } from '@/components/ui';
import { formatLongDateInZone, formatTimeInZone } from '@/lib/timezone';
import type { AppointmentStatus } from '@/types/database';

interface BusinessInfo {
  id: string;
  name: string;
  timezone: string;
  requires_owner_confirmation: boolean;
}

interface ServiceInfo {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
}

type Step =
  | 'loading' // cargando negocio+servicio, o esperando a que AuthContext resuelva la sesión
  | 'email' // pide email, signInWithOtp
  | 'otp' // pide código recibido por correo, verifyOtp
  | 'resolving-client' // sesión activa: buscando ficha en `clients` para este negocio
  | 'client-form' // no había ficha: alta con nombre, teléfono y consentimientos
  | 'ready' // ficha resuelta: falta confirmar
  | 'booking' // insertando la cita
  | 'success' // cita creada
  | 'slot-taken'; // el insert chocó con otra cita ya confirmada para esa hora

// Un 42501 (RLS: insufficient_privilege) casi siempre es sesión caducada,
// pero no siempre — puede ser otro problema de políticas. Lo confirmamos
// con getUser() (valida contra el servidor) antes de decirle al usuario
// que su sesión caducó; si el usuario sigue siendo válido, es otra cosa.
async function isSessionError(err: { code?: string | null; message?: string } | null | undefined): Promise<boolean> {
  if (!err) return false;
  if ((err.message ?? '').toLowerCase().includes('jwt')) return true;
  if (err.code === '42501') {
    const { data, error: userError } = await supabase.auth.getUser();
    return !!userError || !data.user;
  }
  return false;
}

export default function Confirmacion() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { slug, service_id: serviceId, start_time: startTimeParam } = useLocalSearchParams<{
    slug?: string;
    service_id?: string;
    start_time?: string;
  }>();

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  const [clientId, setClientId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consentDataProcessing, setConsentDataProcessing] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);

  const [bookedStatus, setBookedStatus] = useState<AppointmentStatus | null>(null);

  // `${business.id}:${user.id ?? 'anon'}` para la que ya resolvimos la
  // identificación/ficha. `undefined` = todavía no se ha resuelto nunca.
  // Vive en una ref (no en `step`) para que el efecto de abajo no dependa
  // de `step`: un refresco automático de token cambia la referencia de
  // `session` pero no el user.id, así que se detecta aquí y se ignora sin
  // relanzar la consulta ni resetear el paso (perdería lo que el cliente
  // esté escribiendo en el formulario de ficha, o lo sacaría de 'ready').
  // Incluir business.id es igual de importante: las fichas de `clients`
  // son estrictamente por negocio (RGPD), así que si cambia el negocio hay
  // que volver a resolver desde cero — arrastrar el clientId del negocio
  // anterior crearía una cita ahí con la ficha equivocada.
  const resolvedForRef = useRef<string | undefined>(undefined);

  // Negocio + servicio elegidos, a partir de los parámetros de navegación.
  useEffect(() => {
    if (!slug || !serviceId || !startTimeParam) return;
    let cancelled = false;

    (async () => {
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('id, name, timezone, requires_owner_confirmation')
        .eq('slug', slug)
        .eq('active', true)
        .single();

      if (cancelled) return;
      if (businessError || !businessData) {
        setError('No se pudo cargar el negocio.');
        return;
      }

      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('id', serviceId)
        .eq('business_id', businessData.id)
        .eq('active', true)
        .single();

      if (cancelled) return;
      if (serviceError || !serviceData) {
        setError('No se pudo cargar el servicio.');
        return;
      }

      setBusiness(businessData);
      setService(serviceData);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, startTimeParam]);

  // Si esta pantalla se reutiliza para otra franja (los Tabs de
  // expo-router no la desmontan entre navegaciones, solo actualizan los
  // params), hay que olvidar el desenlace del intento anterior:
  // 'slot-taken'/'success' no deben arrastrarse a la nueva franja. La
  // identificación y la ficha (clientId) siguen siendo válidas para el
  // mismo negocio+usuario, así que basta con volver a 'ready'.
  useEffect(() => {
    setStep((current) =>
      current === 'slot-taken' || current === 'success' || current === 'booking' ? 'ready' : current
    );
    setError(null);
    setBookedStatus(null);
  }, [slug, serviceId, startTimeParam]);

  // Identificación completa: valida la sesión y resuelve la ficha de
  // cliente de este negocio. Un solo efecto, sin `step` en las dependencias
  // ni como guarda — el propio array de dependencias decide cuándo hace
  // falta repetir el proceso, así no hay dos efectos disputándose `step`.
  //
  // La sesión de AuthContext es una copia local (localStorage): puede
  // seguir presente aunque el servidor ya no la reconozca (caducada,
  // revocada, o el usuario fue borrado). getUser() sí valida contra el
  // servidor; si falla, tratamos al usuario como no autenticado y
  // limpiamos esa sesión inválida.
  //
  // Supabase refresca el access token en segundo plano cada cierto tiempo,
  // lo que cambia la referencia de `session` sin que cambie el usuario. Si
  // eso ocurriera mientras el cliente rellena su ficha o ya está en
  // 'ready'/'booking', no debe repetirse la resolución (perdería lo que
  // esté escribiendo, o lo sacaría de donde está). `resolvedForRef` filtra
  // justo ese caso: solo seguimos si la combinación negocio+usuario cambió
  // de verdad respecto a la última vez que resolvimos.
  useEffect(() => {
    if (!business || !service || authLoading) return;

    const currentKey = `${business.id}:${session?.user.id ?? 'anon'}`;
    if (resolvedForRef.current === currentKey) return;
    resolvedForRef.current = currentKey;
    setClientId(null); // por si arrastrábamos la ficha de otro negocio

    let cancelled = false;

    (async () => {
      if (!session) {
        setStep('email');
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !userData.user) {
        await supabase.auth.signOut({ scope: 'local' });
        if (cancelled) return;
        setStep('email');
        return;
      }

      setStep('resolving-client');

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('business_id', business.id)
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (clientError) {
        setError('No se pudo comprobar tu ficha de cliente.');
        return;
      }

      if (clientData) {
        setClientId(clientData.id);
        setStep('ready');
      } else {
        setStep('client-form');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [business, service, authLoading, session]);

  async function handleSendOtp() {
    setError(null);
    // shouldCreateUser: true (valor por defecto) explícito — un cliente
    // nuevo se registra sobre la marcha al meter su email por primera vez.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setStep('otp');
  }

  async function handleVerifyOtp() {
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    // La sesión llega vía AuthContext (onAuthStateChange); el useEffect de
    // arriba recoge el cambio y pasa a 'resolving-client'.
  }

  async function handleCreateClient() {
    if (!business || !session) return;
    setError(null);
    setStep('booking'); // reutilizamos el estado de "procesando" para bloquear el formulario

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        auth_user_id: session.user.id,
        name: name.trim(),
        phone: phone.trim(),
        email: session.user.email ?? null,
        consent_data_processing: true,
        consent_marketing: consentMarketing,
        consent_recorded_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !data) {
      if (await isSessionError(insertError)) {
        await supabase.auth.signOut({ scope: 'local' });
        setError('Tu sesión ha caducado, identifícate de nuevo.');
        setStep('email');
        return;
      }
      setError('No se pudo guardar tu ficha. Inténtalo de nuevo.');
      setStep('client-form');
      return;
    }

    setClientId(data.id);
    setStep('ready');
  }

  async function handleConfirmBooking() {
    if (!business || !service || !clientId || !startTimeParam) return;
    setError(null);
    setStep('booking');

    const startTime = new Date(startTimeParam);
    const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

    const { data, error: insertError } = await supabase
      .from('appointments')
      .insert({
        business_id: business.id,
        client_id: clientId,
        service_id: service.id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        price_at_booking: service.price,
        created_by: 'client',
        status: business.requires_owner_confirmation ? 'pending' : 'confirmed',
        payment_status: 'none',
      })
      .select('status')
      .single();

    if (insertError) {
      // 23P01 = exclusion_violation: otra cita ya ocupa esa franja (choque
      // de concurrencia con la restricción `exclude` del esquema). Tiene
      // prioridad sobre el chequeo de sesión: un choque de horario no
      // significa que la sesión haya caducado.
      if (insertError.code === '23P01') {
        setStep('slot-taken');
      } else if (await isSessionError(insertError)) {
        await supabase.auth.signOut({ scope: 'local' });
        setError('Tu sesión ha caducado, identifícate de nuevo.');
        setStep('email');
      } else {
        setError('No se pudo crear la cita. Inténtalo de nuevo.');
        setStep('ready');
      }
      return;
    }

    setBookedStatus(data?.status ?? null);
    // TODO: añadir la cita al calendario del dispositivo y programar el
    // recordatorio push (ver sistema-notificaciones.md) una vez exista esa
    // integración.
    setStep('success');
  }

  if (!slug || !serviceId || !startTimeParam) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background,
        }}
      >
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary, textAlign: 'center' }}>
          Elige antes una hora disponible para reservar.
        </Text>
      </View>
    );
  }

  if (!business || !service) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
        {error && (
          <Text style={{ ...theme.textStyles.body, color: theme.colors.danger, marginTop: theme.spacing.md }}>
            {error}
          </Text>
        )}
      </View>
    );
  }

  const startTime = new Date(startTimeParam);
  const canSubmitClientForm = consentDataProcessing && name.trim() !== '' && phone.trim() !== '';

  return (
    <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.xl, backgroundColor: theme.colors.background }}>
      <Card>
        <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{business.name}</Text>
        <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary, marginTop: theme.spacing.xs }}>
          {service.name}
        </Text>
        <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
          {formatLongDateInZone(startTime, business.timezone)} · {formatTimeInZone(startTime, business.timezone)}
        </Text>
        <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.xs }}>
          {service.duration_minutes} min · {service.price} €
        </Text>
      </Card>

      {step === 'loading' || step === 'resolving-client' ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : step === 'email' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
            Introduce tu email para identificarte. Te enviaremos un código de un solo uso.
          </Text>
          <Input
            placeholder="tú@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button label="Enviar código" onPress={handleSendOtp} disabled={email.trim() === ''} />
          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </View>
      ) : step === 'otp' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
            Te hemos enviado un código a {email}. Introdúcelo aquí.
          </Text>
          <Input placeholder="Código de 6 dígitos" value={otp} onChangeText={setOtp} keyboardType="number-pad" />
          <Button label="Confirmar código" onPress={handleVerifyOtp} disabled={otp.trim() === ''} />
          <Pressable onPress={handleSendOtp}>
            <Text style={{ ...theme.textStyles.small, color: theme.colors.primary, textAlign: 'center' }}>
              Reenviar código
            </Text>
          </Pressable>
          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </View>
      ) : step === 'client-form' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>
            Antes de confirmar, cuéntanos quién eres
          </Text>
          <Input placeholder="Nombre" value={name} onChangeText={setName} />
          <Input placeholder="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Switch
              value={consentDataProcessing}
              onValueChange={setConsentDataProcessing}
              trackColor={{ true: theme.colors.primary }}
            />
            <Text style={{ flex: 1, ...theme.textStyles.small, color: theme.colors.textPrimary }}>
              Acepto que {business.name} trate mis datos para gestionar mi reserva. Obligatorio para reservar.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Switch
              value={consentMarketing}
              onValueChange={setConsentMarketing}
              trackColor={{ true: theme.colors.primary }}
            />
            <Text style={{ flex: 1, ...theme.textStyles.small, color: theme.colors.textPrimary }}>
              Quiero recibir ofertas y novedades de {business.name} (opcional).
            </Text>
          </View>

          <Pressable
            onPress={() => {
              // TODO: enlazar a la política de privacidad real cuando exista.
            }}
          >
            <Text style={{ ...theme.textStyles.caption, color: theme.colors.primary, textDecorationLine: 'underline' }}>
              Política de privacidad
            </Text>
          </Pressable>

          <Button label="Continuar" onPress={handleCreateClient} disabled={!canSubmitClientForm} />
          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </View>
      ) : step === 'ready' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Button label="Confirmar reserva" onPress={handleConfirmBooking} />
          {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
        </View>
      ) : step === 'booking' ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : step === 'slot-taken' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary }}>
            Esa hora acaba de ocuparse, por favor elige otra.
          </Text>
          <Button
            label="Volver al calendario"
            onPress={() =>
              router.replace({ pathname: '/(client)/disponibilidad', params: { slug: slug!, service_id: serviceId! } })
            }
          />
        </View>
      ) : step === 'success' ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ ...theme.textStyles.heading1, color: theme.colors.textPrimary }}>
            {bookedStatus === 'pending' ? 'Tu cita está pendiente de confirmación' : '¡Cita confirmada!'}
          </Text>
          {bookedStatus === 'pending' && (
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
              {business.name} tiene que confirmarla; te avisaremos.
            </Text>
          )}
          <Button
            label="Volver al inicio"
            onPress={() => router.replace({ pathname: '/(client)', params: { slug: slug! } })}
          />
        </View>
      ) : null}
    </View>
  );
}
