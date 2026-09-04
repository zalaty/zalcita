import { supabase } from '@/lib/supabase';
import type { AppointmentStatus } from '@/types/database';

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
