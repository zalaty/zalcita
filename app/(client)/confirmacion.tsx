import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
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

const inputStyle = {
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 8,
  padding: 12,
  fontSize: 15,
};

const buttonStyle = { backgroundColor: '#111', padding: 14, borderRadius: 8 };
const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc' };
const buttonTextStyle = { color: '#fff', textAlign: 'center' as const, fontWeight: '600' as const };

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

  // En cuanto tenemos negocio+servicio y sabemos si hay sesión, decidimos
  // el primer paso real: pedir email, o resolver la ficha si ya hay sesión.
  // La sesión de AuthContext es una copia local (localStorage): puede seguir
  // presente aunque el servidor ya no la reconozca (caducada, revocada, o el
  // usuario fue borrado). getUser() sí valida contra el servidor; si falla,
  // tratamos al usuario como no autenticado y limpiamos esa sesión inválida.
  useEffect(() => {
    if (!business || !service || authLoading) return;
    if (step !== 'loading') return;

    if (!session) {
      setStep('email');
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !data.user) {
        await supabase.auth.signOut({ scope: 'local' });
        if (cancelled) return;
        setStep('email');
        return;
      }
      setStep('resolving-client');
    })();

    return () => {
      cancelled = true;
    };
  }, [business, service, authLoading, session, step]);

  // Cuando aparece una sesión (tras verificar el código), busca la ficha de
  // cliente de este negocio y decide si hace falta darla de alta.
  useEffect(() => {
    if (!session || !business) return;
    if (step !== 'resolving-client' && step !== 'otp') return;
    let cancelled = false;
    setStep('resolving-client');

    (async () => {
      const { data, error: clientError } = await supabase
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

      if (data) {
        setClientId(data.id);
        setStep('ready');
      } else {
        setStep('client-form');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, business]);

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>Elige antes una hora disponible para reservar.</Text>
      </View>
    );
  }

  if (!business || !service) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
        {error && <Text style={{ color: 'crimson', marginTop: 12 }}>{error}</Text>}
      </View>
    );
  }

  const startTime = new Date(startTimeParam);
  const canSubmitClientForm = consentDataProcessing && name.trim() !== '' && phone.trim() !== '';

  return (
    <View style={{ flex: 1, padding: 16, gap: 20 }}>
      <View style={{ gap: 4, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>{business.name}</Text>
        <Text style={{ fontSize: 15 }}>{service.name}</Text>
        <Text style={{ fontSize: 14, color: '#444' }}>
          {formatLongDateInZone(startTime, business.timezone)} · {formatTimeInZone(startTime, business.timezone)}
        </Text>
        <Text style={{ fontSize: 13, color: '#666' }}>
          {service.duration_minutes} min · {service.price} €
        </Text>
      </View>

      {step === 'loading' || step === 'resolving-client' ? (
        <ActivityIndicator />
      ) : step === 'email' ? (
        <View style={{ gap: 12 }}>
          <Text>Introduce tu email para identificarte. Te enviaremos un código de un solo uso.</Text>
          <TextInput
            placeholder="tú@email.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={inputStyle}
          />
          <Pressable
            onPress={handleSendOtp}
            disabled={email.trim() === ''}
            style={email.trim() === '' ? buttonDisabledStyle : buttonStyle}
          >
            <Text style={buttonTextStyle}>Enviar código</Text>
          </Pressable>
          {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
        </View>
      ) : step === 'otp' ? (
        <View style={{ gap: 12 }}>
          <Text>Te hemos enviado un código a {email}. Introdúcelo aquí.</Text>
          <TextInput
            placeholder="Código de 6 dígitos"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            style={inputStyle}
          />
          <Pressable
            onPress={handleVerifyOtp}
            disabled={otp.trim() === ''}
            style={otp.trim() === '' ? buttonDisabledStyle : buttonStyle}
          >
            <Text style={buttonTextStyle}>Confirmar código</Text>
          </Pressable>
          <Pressable onPress={handleSendOtp}>
            <Text style={{ color: '#666', textAlign: 'center' }}>Reenviar código</Text>
          </Pressable>
          {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
        </View>
      ) : step === 'client-form' ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '600' }}>Antes de confirmar, cuéntanos quién eres</Text>
          <TextInput placeholder="Nombre" value={name} onChangeText={setName} style={inputStyle} />
          <TextInput
            placeholder="Teléfono"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={inputStyle}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Switch value={consentDataProcessing} onValueChange={setConsentDataProcessing} />
            <Text style={{ flex: 1, fontSize: 13 }}>
              Acepto que {business.name} trate mis datos para gestionar mi reserva. Obligatorio para reservar.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Switch value={consentMarketing} onValueChange={setConsentMarketing} />
            <Text style={{ flex: 1, fontSize: 13 }}>
              Quiero recibir ofertas y novedades de {business.name} (opcional).
            </Text>
          </View>

          <Pressable
            onPress={() => {
              // TODO: enlazar a la política de privacidad real cuando exista.
            }}
          >
            <Text style={{ fontSize: 12, color: '#666', textDecorationLine: 'underline' }}>
              Política de privacidad
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCreateClient}
            disabled={!canSubmitClientForm}
            style={canSubmitClientForm ? buttonStyle : buttonDisabledStyle}
          >
            <Text style={buttonTextStyle}>Continuar</Text>
          </Pressable>
          {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
        </View>
      ) : step === 'ready' ? (
        <View style={{ gap: 12 }}>
          <Pressable onPress={handleConfirmBooking} style={buttonStyle}>
            <Text style={buttonTextStyle}>Confirmar reserva</Text>
          </Pressable>
          {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
        </View>
      ) : step === 'booking' ? (
        <ActivityIndicator />
      ) : step === 'slot-taken' ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15 }}>Esa hora acaba de ocuparse, por favor elige otra.</Text>
          <Pressable
            onPress={() =>
              router.replace({ pathname: '/(client)/disponibilidad', params: { slug: slug!, service_id: serviceId! } })
            }
            style={buttonStyle}
          >
            <Text style={buttonTextStyle}>Volver al calendario</Text>
          </Pressable>
        </View>
      ) : step === 'success' ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 17, fontWeight: '700' }}>
            {bookedStatus === 'pending' ? 'Tu cita está pendiente de confirmación' : '¡Cita confirmada!'}
          </Text>
          {bookedStatus === 'pending' && (
            <Text style={{ color: '#444' }}>{business.name} tiene que confirmarla; te avisaremos.</Text>
          )}
          <Pressable
            onPress={() => router.replace({ pathname: '/(client)', params: { slug: slug! } })}
            style={buttonStyle}
          >
            <Text style={buttonTextStyle}>Volver al inicio</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
