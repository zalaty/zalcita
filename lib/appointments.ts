import { supabase } from '@/lib/supabase';
import type { AppointmentStatus } from '@/types/database';

// Vocabulario de estado compartido entre calendario.tsx (lado negocio) y
// mis-citas.tsx (lado cliente) — un solo sitio, así las dos pantallas
// nunca pueden desincronizarse en cómo llaman/colorean cada estado.
export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
  no_show: 'No se presentó',
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: '#b45309',
  confirmed: '#15803d',
  cancelled: '#6b7280',
  completed: '#1d4ed8',
  no_show: '#b91c1c',
};

export interface AppointmentDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  price_at_booking: number;
  clientName: string;
  clientPhone: string;
  serviceName: string;
}

// Trae las citas de un RANGO de instantes UTC, sin saber nada de "día" —
// tanto calendario.tsx (vista de día) como cita.tsx (guía de horas +
// detección de solapes al crear/mover) llaman a esta misma función con su
// propio rango, sin duplicar la lógica. Sin joins embebidos de PostgREST
// (`Relationships: []` en types/database.ts): 3 queries secuenciales/
// paralelas + merge en JS, igual que en disponibilidad.tsx/confirmacion.tsx.
export async function fetchAppointmentsInRange(
  businessId: string,
  startUtc: Date,
  endUtc: Date
): Promise<{ data: AppointmentDetails[] | null; error: string | null }> {
  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('id, start_time, end_time, status, price_at_booking, client_id, service_id')
    .eq('business_id', businessId)
    .lt('start_time', endUtc.toISOString())
    .gt('end_time', startUtc.toISOString())
    .order('start_time', { ascending: true });

  if (apptError) return { data: null, error: apptError.message };
  if (!appointments || appointments.length === 0) return { data: [], error: null };

  const clientIds = [...new Set(appointments.map((a) => a.client_id))];
  const serviceIds = [...new Set(appointments.map((a) => a.service_id))];

  const [clientsRes, servicesRes] = await Promise.all([
    supabase.from('clients').select('id, name, phone').eq('business_id', businessId).in('id', clientIds),
    supabase.from('services').select('id, name').eq('business_id', businessId).in('id', serviceIds),
  ]);

  if (clientsRes.error) return { data: null, error: clientsRes.error.message };
  if (servicesRes.error) return { data: null, error: servicesRes.error.message };

  const clientById = new Map((clientsRes.data ?? []).map((c) => [c.id, c]));
  const serviceById = new Map((servicesRes.data ?? []).map((s) => [s.id, s]));

  const merged: AppointmentDetails[] = appointments.map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    price_at_booking: a.price_at_booking,
    clientName: clientById.get(a.client_id)?.name ?? 'Cliente',
    clientPhone: clientById.get(a.client_id)?.phone ?? '',
    serviceName: serviceById.get(a.service_id)?.name ?? 'Servicio',
  }));

  return { data: merged, error: null };
}

export interface ClientHistoryAppointment {
  id: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  price_at_booking: number;
  serviceName: string;
}

// Historial de citas de UNA ficha de cliente concreta, en este negocio —
// para la ficha de cliente (app/(business)/cliente/[id].tsx). Mismo patrón
// sin joins que el resto: 2 queries + merge.
export async function fetchClientAppointmentHistory(
  businessId: string,
  clientId: string
): Promise<{ data: ClientHistoryAppointment[] | null; error: string | null }> {
  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('id, service_id, start_time, end_time, status, price_at_booking')
    .eq('business_id', businessId)
    .eq('client_id', clientId)
    .order('start_time', { ascending: false });

  if (apptError) return { data: null, error: apptError.message };
  if (!appointments || appointments.length === 0) return { data: [], error: null };

  const serviceIds = [...new Set(appointments.map((a) => a.service_id))];
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, name')
    .eq('business_id', businessId)
    .in('id', serviceIds);

  if (servicesError) return { data: null, error: servicesError.message };

  const serviceById = new Map((services ?? []).map((s) => [s.id, s]));

  const merged: ClientHistoryAppointment[] = appointments.map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    price_at_booking: a.price_at_booking,
    serviceName: serviceById.get(a.service_id)?.name ?? 'Servicio',
  }));

  return { data: merged, error: null };
}

export interface ClientAppointmentDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  price_at_booking: number;
  businessId: string;
  businessName: string;
  businessTimezone: string;
  serviceName: string;
  allowClientCancellation: boolean;
  minHoursNotice: number;
}

// Trae TODAS las citas del cliente autenticado, a través de TODAS sus
// fichas — clients es por negocio (unique(business_id, phone)), así que un
// mismo auth_user_id puede tener una fila de cliente por cada negocio con
// el que haya reservado. Igual que fetchAppointmentsInRange: sin joins
// embebidos, queries separadas + merge en JS.
export async function fetchClientAppointments(
  authUserId: string
): Promise<{ data: ClientAppointmentDetails[] | null; error: string | null }> {
  const { data: clientRows, error: clientsError } = await supabase
    .from('clients')
    .select('id, business_id')
    .eq('auth_user_id', authUserId);

  if (clientsError) return { data: null, error: clientsError.message };
  if (!clientRows || clientRows.length === 0) return { data: [], error: null };

  const clientIds = clientRows.map((c) => c.id);

  const { data: appointments, error: apptError } = await supabase
    .from('appointments')
    .select('id, business_id, service_id, start_time, end_time, status, price_at_booking')
    .in('client_id', clientIds)
    .order('start_time', { ascending: true });

  if (apptError) return { data: null, error: apptError.message };
  if (!appointments || appointments.length === 0) return { data: [], error: null };

  const businessIds = [...new Set(appointments.map((a) => a.business_id))];
  const serviceIds = [...new Set(appointments.map((a) => a.service_id))];

  const [businessesRes, servicesRes, policiesRes] = await Promise.all([
    supabase.from('businesses').select('id, name, timezone').in('id', businessIds),
    supabase.from('services').select('id, name').in('id', serviceIds),
    supabase.from('cancellation_policies').select('business_id, allow_client_cancellation, min_hours_notice').in('business_id', businessIds),
  ]);

  if (businessesRes.error) return { data: null, error: businessesRes.error.message };
  if (servicesRes.error) return { data: null, error: servicesRes.error.message };
  if (policiesRes.error) return { data: null, error: policiesRes.error.message };

  const businessById = new Map((businessesRes.data ?? []).map((b) => [b.id, b]));
  const serviceById = new Map((servicesRes.data ?? []).map((s) => [s.id, s]));
  const policyByBusinessId = new Map((policiesRes.data ?? []).map((p) => [p.business_id, p]));

  const merged: ClientAppointmentDetails[] = appointments.map((a) => {
    const business = businessById.get(a.business_id);
    const policy = policyByBusinessId.get(a.business_id);
    return {
      id: a.id,
      start_time: a.start_time,
      end_time: a.end_time,
      status: a.status,
      price_at_booking: a.price_at_booking,
      businessId: a.business_id,
      // Si el negocio se desactivó después de que el cliente reservara,
      // "businesses" deja de ser visible para él (RLS solo publica
      // negocios activos) y cae en este placeholder — cosmético, no
      // afecta a poder ver/cancelar la cita en sí.
      businessName: business?.name ?? 'Negocio',
      businessTimezone: business?.timezone ?? 'Europe/Madrid',
      serviceName: serviceById.get(a.service_id)?.name ?? 'Servicio',
      allowClientCancellation: policy?.allow_client_cancellation ?? true,
      minHoursNotice: policy?.min_hours_notice ?? 24,
    };
  });

  return { data: merged, error: null };
}
