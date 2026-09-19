import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import { theme } from '@/theme';
import { Card, Screen } from '@/components/ui';
import {
  addMonthsToMonthStr,
  currentMonthStrInZone,
  monthLabel,
  monthRangeUtc,
  todayDateStrInZone,
} from '@/lib/timezone';

interface PeriodRow {
  service_id: string;
  start_time: string;
  status: 'completed' | 'confirmed';
  price_at_booking: number;
}

interface Summary {
  ingresos: number;
  previsto: number;
  numCompleted: number;
  weeklyTotals: number[]; // 5 cubos, por día-de-mes (1-7, 8-14, 15-21, 22-28, 29-31)
  serviceBreakdown: { serviceId: string; serviceName: string; total: number }[];
  previousIngresos: number;
}

type Comparison = { kind: 'no-data' } | { kind: 'no-previous' } | { kind: 'percent'; value: number };

function computeComparison(current: number, previous: number): Comparison {
  if (previous === 0 && current === 0) return { kind: 'no-data' };
  if (previous === 0) return { kind: 'no-previous' };
  return { kind: 'percent', value: ((current - previous) / previous) * 100 };
}

// Caja de estadística compartida por las 4 cifras de cabecera — borde+
// sombra sutil para que se distingan de la Card blanca que las contiene
// (misma lección que el resto del sistema: sombra sola no basta cuando
// caja y contenedor comparten el mismo blanco).
function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{
        flex: 1,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.sm,
        gap: theme.spacing.xs,
      }}
    >
      <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary }}>{value}</Text>
      <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>{label}</Text>
    </View>
  );
}

// "Ingresos por citas", no caja contable: price_at_booking es el valor de
// la cita, asumiendo que se cobró — todavía no hay integración de pagos
// (Stripe pendiente) que confirme un cobro real. Mismo criterio que la
// ficha de cliente: completadas = ingreso real, confirmadas futuras =
// previsto, aparte.
export default function Resumen() {
  const { business } = useBusiness();

  const [monthStr, setMonthStr] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (business && !monthStr) {
      setMonthStr(currentMonthStrInZone(business.timezone));
    }
  }, [business, monthStr]);

  const fetchSummary = useCallback(() => {
    if (!business || !monthStr) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { startUtc, endUtc } = monthRangeUtc(monthStr, business.timezone);
      const prevMonthStr = addMonthsToMonthStr(monthStr, -1);
      const { startUtc: prevStartUtc, endUtc: prevEndUtc } = monthRangeUtc(prevMonthStr, business.timezone);

      // Traigo completadas Y confirmadas del periodo actual en una sola
      // query: ambas hacen falta (ingresos vs previsto), y del periodo
      // anterior solo la suma de completadas, para la comparativa.
      const [currentRes, previousRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('service_id, start_time, status, price_at_booking')
          .eq('business_id', business.id)
          .gte('start_time', startUtc.toISOString())
          .lt('start_time', endUtc.toISOString())
          .in('status', ['completed', 'confirmed']),
        supabase
          .from('appointments')
          .select('price_at_booking')
          .eq('business_id', business.id)
          .gte('start_time', prevStartUtc.toISOString())
          .lt('start_time', prevEndUtc.toISOString())
          .eq('status', 'completed'),
      ]);

      if (cancelled) return;
      if (currentRes.error || previousRes.error) {
        setError('No se pudieron cargar los datos del periodo.');
        setLoading(false);
        return;
      }

      const rows = (currentRes.data ?? []) as PeriodRow[];
      const completedRows = rows.filter((r) => r.status === 'completed');
      const now = new Date();
      const confirmedFutureRows = rows.filter((r) => r.status === 'confirmed' && new Date(r.start_time) > now);

      const ingresos = completedRows.reduce((sum, r) => sum + Number(r.price_at_booking), 0);
      const previsto = confirmedFutureRows.reduce((sum, r) => sum + Number(r.price_at_booking), 0);

      const weeklyTotals = [0, 0, 0, 0, 0];
      for (const r of completedRows) {
        const dateStr = todayDateStrInZone(business.timezone, new Date(r.start_time));
        const day = Number(dateStr.slice(8, 10));
        const weekIdx = Math.min(Math.floor((day - 1) / 7), 4);
        weeklyTotals[weekIdx] += Number(r.price_at_booking);
      }

      const serviceIds = [...new Set(rows.map((r) => r.service_id))];
      const serviceNames = new Map<string, string>();
      if (serviceIds.length > 0) {
        const servicesRes = await supabase
          .from('services')
          .select('id, name')
          .eq('business_id', business.id)
          .in('id', serviceIds);

        if (cancelled) return;
        if (servicesRes.error) {
          setError('No se pudieron cargar los servicios.');
          setLoading(false);
          return;
        }
        for (const s of servicesRes.data ?? []) serviceNames.set(s.id, s.name);
      }

      const byService = new Map<string, number>();
      for (const r of completedRows) {
        byService.set(r.service_id, (byService.get(r.service_id) ?? 0) + Number(r.price_at_booking));
      }
      const serviceBreakdown = [...byService.entries()]
        .map(([serviceId, total]) => ({ serviceId, serviceName: serviceNames.get(serviceId) ?? 'Servicio', total }))
        .sort((a, b) => b.total - a.total);

      const previousIngresos = (previousRes.data ?? []).reduce((sum, r) => sum + Number(r.price_at_booking), 0);

      setSummary({
        ingresos,
        previsto,
        numCompleted: completedRows.length,
        weeklyTotals,
        serviceBreakdown,
        previousIngresos,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [business, monthStr]);

  useFocusEffect(fetchSummary);

  if (!business || !monthStr) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  const isCurrentMonth = monthStr === currentMonthStrInZone(business.timezone);

  if (loading && !summary) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </Screen>
    );
  }

  const ticketMedio = summary && summary.numCompleted > 0 ? summary.ingresos / summary.numCompleted : null;
  const comparison = summary ? computeComparison(summary.ingresos, summary.previousIngresos) : null;
  const maxWeekly = summary ? Math.max(...summary.weeklyTotals, 1) : 1;
  const maxService = summary && summary.serviceBreakdown.length > 0 ? Math.max(...summary.serviceBreakdown.map((s) => s.total), 1) : 1;

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
          Resumen
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, -1))} style={{ padding: theme.spacing.sm }}>
            <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>‹</Text>
          </Pressable>
          <Text
            style={{
              flex: 1,
              textAlign: 'center',
              ...theme.textStyles.bodyMedium,
              color: theme.colors.textPrimary,
              textTransform: 'capitalize',
            }}
          >
            {monthLabel(monthStr)}
          </Text>
          <Pressable
            onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, 1))}
            disabled={isCurrentMonth}
            style={{ padding: theme.spacing.sm, opacity: isCurrentMonth ? 0.3 : 1 }}
          >
            <Text style={{ fontSize: theme.fontSizes.lg, color: theme.colors.textPrimary }}>›</Text>
          </Pressable>
        </View>

        {summary && (
          <>
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <StatBox value={`${summary.ingresos.toFixed(2)} €`} label="Ingresos por citas" />
                <StatBox value={`${summary.previsto.toFixed(2)} €`} label="Previsto (confirmadas)" />
              </View>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <StatBox value={String(summary.numCompleted)} label="Citas completadas" />
                <StatBox value={ticketMedio !== null ? `${ticketMedio.toFixed(2)} €` : '—'} label="Ticket medio" />
              </View>

              {comparison && (
                <Text
                  style={{
                    ...theme.textStyles.small,
                    fontWeight: comparison.kind === 'percent' ? theme.fontWeights.semibold : theme.fontWeights.regular,
                    color:
                      comparison.kind === 'percent'
                        ? comparison.value >= 0
                          ? theme.colors.success
                          : theme.colors.danger
                        : theme.colors.textSecondary,
                  }}
                >
                  {comparison.kind === 'no-data' && 'Sin datos suficientes para comparar con el periodo anterior.'}
                  {comparison.kind === 'no-previous' && 'Sin ingresos en el periodo anterior.'}
                  {comparison.kind === 'percent' &&
                    `${comparison.value >= 0 ? '+' : ''}${comparison.value.toFixed(0)}% vs mes anterior`}
                </Text>
              )}

              <Text style={{ ...theme.textStyles.caption, color: theme.colors.textMuted }}>
                Basado en el precio de las citas completadas — no hay integración de pagos todavía, así que no
                refleja cobros reales.
              </Text>
            </View>

            <Card>
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
                Ingresos por semana
              </Text>
              {summary.weeklyTotals.every((total) => total === 0) ? (
                <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                  Sin ingresos este periodo.
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
                  {summary.weeklyTotals.map((total, i) => {
                    const heightPx = total > 0 ? Math.max((total / maxWeekly) * 100, 4) : 0;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs }}>
                        <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>
                          {total > 0 ? `${total.toFixed(0)}€` : ''}
                        </Text>
                        <View style={{ width: '100%', height: 100, justifyContent: 'flex-end' }}>
                          <View style={{ height: heightPx, backgroundColor: theme.colors.primary, borderRadius: theme.radii.sm }} />
                        </View>
                        <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary }}>Sem {i + 1}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            <Card>
              <Text style={{ ...theme.textStyles.heading2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
                Ingresos por servicio
              </Text>
              {summary.serviceBreakdown.length === 0 ? (
                <Text style={{ ...theme.textStyles.body, color: theme.colors.textSecondary }}>
                  Sin ingresos por servicio este periodo.
                </Text>
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  {summary.serviceBreakdown.map((s) => {
                    const widthPct = (s.total / maxService) * 100;
                    return (
                      <View key={s.serviceId} style={{ gap: theme.spacing.xs }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ ...theme.textStyles.small, color: theme.colors.textPrimary }}>{s.serviceName}</Text>
                          <Text style={{ ...theme.textStyles.small, fontWeight: theme.fontWeights.semibold, color: theme.colors.textPrimary }}>
                            {s.total.toFixed(2)} €
                          </Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: theme.colors.background, borderRadius: theme.radii.sm }}>
                          <View
                            style={{
                              height: 8,
                              width: `${widthPct}%`,
                              backgroundColor: theme.colors.primary,
                              borderRadius: theme.radii.sm,
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          </>
        )}

        {error && <Text style={{ ...theme.textStyles.body, color: theme.colors.danger }}>{error}</Text>}
      </ScrollView>
    </Screen>
  );
}
