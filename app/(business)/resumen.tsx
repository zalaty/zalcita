import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useBusiness } from '@/context/BusinessContext';
import {
  addMonthsToMonthStr,
  currentMonthStrInZone,
  monthLabel,
  monthRangeUtc,
  todayDateStrInZone,
} from '@/lib/timezone';

const sectionTitleStyle = { fontSize: 16, fontWeight: '700' as const };
const statBoxStyle = { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f7f7f7', gap: 4 };
const cardStyle = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#eee', gap: 12 };

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const isCurrentMonth = monthStr === currentMonthStrInZone(business.timezone);

  if (loading && !summary) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const ticketMedio = summary && summary.numCompleted > 0 ? summary.ingresos / summary.numCompleted : null;
  const comparison = summary ? computeComparison(summary.ingresos, summary.previousIngresos) : null;
  const maxWeekly = summary ? Math.max(...summary.weeklyTotals, 1) : 1;
  const maxService = summary && summary.serviceBreakdown.length > 0 ? Math.max(...summary.serviceBreakdown.map((s) => s.total), 1) : 1;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, -1))} style={{ padding: 8 }}>
          <Text style={{ fontSize: 18 }}>‹</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', textTransform: 'capitalize' }}>
          {monthLabel(monthStr)}
        </Text>
        <Pressable
          onPress={() => setMonthStr((m) => addMonthsToMonthStr(m, 1))}
          disabled={isCurrentMonth}
          style={{ padding: 8, opacity: isCurrentMonth ? 0.3 : 1 }}
        >
          <Text style={{ fontSize: 18 }}>›</Text>
        </Pressable>
      </View>

      {summary && (
        <>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={statBoxStyle}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>{summary.ingresos.toFixed(2)} €</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Ingresos por citas</Text>
              </View>
              <View style={statBoxStyle}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>{summary.previsto.toFixed(2)} €</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Previsto (confirmadas)</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={statBoxStyle}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>{summary.numCompleted}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Citas completadas</Text>
              </View>
              <View style={statBoxStyle}>
                <Text style={{ fontSize: 22, fontWeight: '700' }}>{ticketMedio !== null ? `${ticketMedio.toFixed(2)} €` : '—'}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Ticket medio</Text>
              </View>
            </View>

            {comparison && (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: comparison.kind === 'percent' ? '600' : '400',
                  color:
                    comparison.kind === 'percent' ? (comparison.value >= 0 ? '#15803d' : '#b91c1c') : '#666',
                }}
              >
                {comparison.kind === 'no-data' && 'Sin datos suficientes para comparar con el periodo anterior.'}
                {comparison.kind === 'no-previous' && 'Sin ingresos en el periodo anterior.'}
                {comparison.kind === 'percent' &&
                  `${comparison.value >= 0 ? '+' : ''}${comparison.value.toFixed(0)}% vs mes anterior`}
              </Text>
            )}

            <Text style={{ fontSize: 12, color: '#999' }}>
              Basado en el precio de las citas completadas — no hay integración de pagos todavía, así que no
              refleja cobros reales.
            </Text>
          </View>

          <View style={cardStyle}>
            <Text style={sectionTitleStyle}>Ingresos por semana</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              {summary.weeklyTotals.map((total, i) => {
                const heightPx = total > 0 ? Math.max((total / maxWeekly) * 100, 4) : 0;
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, color: '#666' }}>{total > 0 ? `${total.toFixed(0)}€` : ''}</Text>
                    <View style={{ width: '100%', height: 100, justifyContent: 'flex-end' }}>
                      <View style={{ height: heightPx, backgroundColor: '#111', borderRadius: 4 }} />
                    </View>
                    <Text style={{ fontSize: 11, color: '#666' }}>Sem {i + 1}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={cardStyle}>
            <Text style={sectionTitleStyle}>Ingresos por servicio</Text>
            {summary.serviceBreakdown.length === 0 ? (
              <Text style={{ color: '#666' }}>Sin ingresos por servicio este periodo.</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {summary.serviceBreakdown.map((s) => {
                  const widthPct = (s.total / maxService) * 100;
                  return (
                    <View key={s.serviceId} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13 }}>{s.serviceName}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600' }}>{s.total.toFixed(2)} €</Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#eee', borderRadius: 4 }}>
                        <View style={{ height: 8, width: `${widthPct}%`, backgroundColor: '#111', borderRadius: 4 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </>
      )}

      {error && <Text style={{ color: 'crimson' }}>{error}</Text>}
    </ScrollView>
  );
}
