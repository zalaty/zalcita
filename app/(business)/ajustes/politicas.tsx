import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Button, Card, Input, Screen } from '@/components/ui';
import type { PaymentPolicy } from '@/types/database';

type PenaltyType = 'none' | 'deposit_loss' | 'fixed_fee';

const NOTICE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Sin antelación' },
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 168, label: '1 semana' },
];

const PENALTY_OPTIONS: { value: PenaltyType; label: string }[] = [
  { value: 'none', label: 'Sin penalización' },
  { value: 'deposit_loss', label: 'Pierde la señal pagada' },
  { value: 'fixed_fee', label: 'Cargo fijo' },
];

const PAYMENT_OPTIONS: { value: PaymentPolicy; label: string }[] = [
  { value: 'none', label: 'El cliente paga en el negocio (efectivo o tarjeta)' },
  { value: 'deposit', label: 'Señal online al reservar' },
  { value: 'full', label: 'Pago completo online al reservar' },
];

function chipStyle(selected: boolean) {
  return {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    backgroundColor: selected ? theme.colors.primary : 'transparent',
  };
}

function chipTextStyle(selected: boolean) {
  return {
    fontSize: theme.fontSizes.sm,
    color: selected ? theme.colors.textOnPrimary : theme.colors.textPrimary,
    fontWeight: selected ? theme.fontWeights.semibold : theme.fontWeights.regular,
  };
}

function optionRowStyle(selected: boolean) {
  return {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  };
}

// Cierra el círculo de la cancelación: el cliente ya respeta estas
// políticas (mis-citas.tsx + el trigger de 0010), esta pantalla es donde
// el dueño las configura en vez de insertar filas por SQL.
export default function Politicas() {
  const { business, refreshBusiness } = useBusiness();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // cancellation_policies
  const [allowCancellation, setAllowCancellation] = useState(true);
  const [minHoursNotice, setMinHoursNotice] = useState(24);
  const [penaltyType, setPenaltyType] = useState<PenaltyType>('none');
  const [penaltyAmount, setPenaltyAmount] = useState('');

  // businesses
  const [paymentPolicy, setPaymentPolicy] = useState<PaymentPolicy>('none');
  const [depositPercentage, setDepositPercentage] = useState('');
  const [requiresOwnerConfirmation, setRequiresOwnerConfirmation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Los campos de businesses ya vienen en `business` (useBusiness()), sin
  // fetch aparte. Se sincronizan cada vez que `business` cambia de verdad
  // (incluido tras el refreshBusiness() posterior a guardar).
  useEffect(() => {
    if (!business) return;
    setPaymentPolicy(business.payment_policy);
    setDepositPercentage(business.deposit_percentage != null ? String(business.deposit_percentage) : '');
    setRequiresOwnerConfirmation(business.requires_owner_confirmation);
  }, [business]);

  // cancellation_policies sí necesita su propia query — puede no existir
  // fila todavía (nunca se ha guardado nada), en cuyo caso se arranca con
  // los defaults que ya usa el trigger de 0010 (coalesce(...,true)) y la
  // propia tabla (min_hours_notice default 24, penalty_type default 'none').
  const fetchPolicy = useCallback(() => {
    if (!business) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      const { data, error } = await supabase
        .from('cancellation_policies')
        .select('*')
        .eq('business_id', business.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setLoadError('No se pudo cargar la política de cancelación.');
        setLoading(false);
        return;
      }

      if (data) {
        setAllowCancellation(data.allow_client_cancellation);
        setMinHoursNotice(data.min_hours_notice);
        setPenaltyType(data.penalty_type as PenaltyType);
        setPenaltyAmount(data.penalty_amount != null ? String(data.penalty_amount) : '');
      } else {
        setAllowCancellation(true);
        setMinHoursNotice(24);
        setPenaltyType('none');
        setPenaltyAmount('');
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business]);

  useFocusEffect(fetchPolicy);

  async function handleSave() {
    if (!business) return;
    setSaveError(null);
    setSaveSuccess(false);

    if (paymentPolicy === 'deposit') {
      const pct = Number(depositPercentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setSaveError('El porcentaje de señal debe ser un número entre 0 y 100.');
        return;
      }
    }
    if (penaltyType === 'fixed_fee') {
      const amt = Number(penaltyAmount);
      if (!Number.isFinite(amt) || amt < 0) {
        setSaveError('El importe de la penalización no puede ser negativo.');
        return;
      }
    }

    setSaving(true);

    const [policyRes, businessRes] = await Promise.all([
      supabase.from('cancellation_policies').upsert({
        business_id: business.id,
        allow_client_cancellation: allowCancellation,
        min_hours_notice: minHoursNotice,
        penalty_type: penaltyType,
        penalty_amount: penaltyType === 'fixed_fee' ? Number(penaltyAmount) : null,
        // allow_client_modification: OMITIDA a propósito. PostgREST solo
        // incluye en el upsert las columnas presentes en el body: al no
        // mandarla, en INSERT toma su DEFAULT (true) y en UPDATE se deja
        // intacta, nunca se pisa con un valor que esta pantalla no gestiona.
      }),
      supabase
        .from('businesses')
        .update({
          payment_policy: paymentPolicy,
          deposit_percentage: paymentPolicy === 'deposit' ? Number(depositPercentage) : null,
          requires_owner_confirmation: requiresOwnerConfirmation,
        })
        .eq('id', business.id),
    ]);

    setSaving(false);

    // No es una escritura atómica (son dos tablas, sin función de
    // Postgres envolviéndolas) — si UNA falla, se dice exactamente cuál,
    // para que quede claro qué se guardó de verdad y qué hay que reintentar.
    if (policyRes.error || businessRes.error) {
      if (policyRes.error && businessRes.error) {
        setSaveError('No se pudo guardar ni la política de cancelación ni los datos de pago/confirmación. Inténtalo de nuevo.');
      } else if (policyRes.error) {
        setSaveError('Se guardaron los datos de pago/confirmación, pero no la política de cancelación. Revísala e inténtalo de nuevo.');
      } else {
        setSaveError('Se guardó la política de cancelación, pero no los datos de pago/confirmación. Revísalos e inténtalo de nuevo.');
      }
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
          Políticas
        </Text>

        {loading && (
          <View style={{ alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Cancelación
          </Text>
          <Pressable
            onPress={() => setAllowCancellation((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 }}>
              El cliente puede cancelar su cita desde la app
            </Text>
            <Switch
              value={allowCancellation}
              onValueChange={setAllowCancellation}
              trackColor={{ true: theme.colors.primary }}
              style={{ pointerEvents: 'none' }}
            />
          </Pressable>

          {allowCancellation && (
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary }}>
                Antelación mínima para cancelar sin aviso de fuera de plazo
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {NOTICE_OPTIONS.map((opt) => (
                  <Pressable key={opt.value} onPress={() => setMinHoursNotice(opt.value)} style={chipStyle(minHoursNotice === opt.value)}>
                    <Text style={chipTextStyle(minHoursNotice === opt.value)}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={{ ...theme.textStyles.small, color: theme.colors.textSecondary, marginTop: theme.spacing.sm }}>
                Penalización por cancelar fuera de plazo
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {PENALTY_OPTIONS.map((opt) => (
                  <Pressable key={opt.value} onPress={() => setPenaltyType(opt.value)} style={chipStyle(penaltyType === opt.value)}>
                    <Text style={chipTextStyle(penaltyType === opt.value)}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
              {penaltyType === 'fixed_fee' && (
                <Input
                  placeholder="Importe de la penalización (€)"
                  value={penaltyAmount}
                  onChangeText={setPenaltyAmount}
                  keyboardType="decimal-pad"
                />
              )}
              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>
                Informativa — todavía no hay integración de pagos, así que no se cobra automáticamente.
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Pago
          </Text>
          <View style={{ gap: theme.spacing.sm }}>
            {PAYMENT_OPTIONS.map((opt) => (
              <Pressable key={opt.value} onPress={() => setPaymentPolicy(opt.value)} style={optionRowStyle(paymentPolicy === opt.value)}>
                <Text
                  style={{
                    ...theme.textStyles.body,
                    color: theme.colors.textPrimary,
                    fontWeight: paymentPolicy === opt.value ? theme.fontWeights.semibold : theme.fontWeights.regular,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentPolicy === 'deposit' && (
            <View style={{ marginTop: theme.spacing.sm }}>
              <Input
                placeholder="Porcentaje de señal (%)"
                value={depositPercentage}
                onChangeText={setDepositPercentage}
                keyboardType="decimal-pad"
              />
            </View>
          )}
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>
            El pago online requiere conectar una pasarela de pago, todavía no disponible — elijas lo que elijas, de
            momento el cobro real se hace en el negocio.
          </Text>
        </Card>

        <Card>
          <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
            Confirmación manual
          </Text>
          <Pressable
            onPress={() => setRequiresOwnerConfirmation((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 }}>
              Confirmar manualmente cada cita antes de aceptarla
            </Text>
            <Switch
              value={requiresOwnerConfirmation}
              onValueChange={setRequiresOwnerConfirmation}
              trackColor={{ true: theme.colors.primary }}
              style={{ pointerEvents: 'none' }}
            />
          </Pressable>
          <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted, marginTop: theme.spacing.sm }}>
            Si está activo, las reservas de cliente entran como "pendientes" hasta que las confirmes.
          </Text>
        </Card>

        <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={handleSave} disabled={saving} />

        {saveSuccess && <Text style={{ ...theme.textStyles.body, color: theme.colors.success }}>Guardado.</Text>}
        {saveError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{saveError}</Text>}
        {loadError && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{loadError}</Text>}
      </ScrollView>
    </Screen>
  );
}
