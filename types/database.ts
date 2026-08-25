// Tipos de la base de datos escritos a mano siguiendo el esquema de
// modelo-datos.md. Cuando el proyecto de Supabase esté creado, sustituir
// este archivo por el generado automáticamente con:
//
//   npx supabase gen types typescript --project-id <tu-project-id> > types/database.ts
//
// Mientras tanto, estos tipos permiten trabajar con el cliente de Supabase
// con autocompletado y chequeo de tipos.

export type PaymentPolicy = 'none' | 'deposit' | 'full';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type PaymentStatus = 'none' | 'pending' | 'paid' | 'refunded';
export type MemberRole = 'owner' | 'staff';
export type NotificationChannel = 'push' | 'whatsapp';
export type NotificationType = 'reminder' | 'confirmation' | 'cancellation' | 'modification';

export interface Business {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  stripe_account_id: string | null;
  payment_policy: PaymentPolicy;
  deposit_percentage: number | null;
  requires_owner_confirmation: boolean;
  active: boolean;
  created_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  role: MemberRole;
  name: string;
  created_at: string;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  duration_minutes: number;
  price: number;
  active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  business_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  consent_data_processing: boolean;
  consent_marketing: boolean;
  consent_recorded_at: string | null;
  is_anonymized: boolean;
  created_at: string;
}

export interface Appointment {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  member_id: string | null;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  price_at_booking: number;
  payment_status: PaymentStatus;
  created_by: 'client' | 'owner';
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

export interface WorkingHours {
  id: string;
  business_id: string;
  member_id: string | null; // null = horario general del negocio
  day_of_week: number; // 0=domingo..6=sábado
  start_time: string; // tipo `time` de Postgres, ej. '09:00'
  end_time: string;
}

export interface ScheduleException {
  id: string;
  business_id: string;
  member_id: string | null; // null = aplica al horario general
  date: string; // 'YYYY-MM-DD'
  is_closed: boolean;
  start_time: string | null; // null junto a end_time null = cierra todo el día
  end_time: string | null;
}

export interface CancellationPolicy {
  business_id: string;
  min_hours_notice: number;
  allow_client_modification: boolean;
  allow_client_cancellation: boolean;
  penalty_type: 'none' | 'deposit_loss' | 'fixed_fee';
  penalty_amount: number | null;
}

// postgrest-js exige que `Row` cumpla `Record<string, unknown>`. Una
// `interface` con propiedades nombradas (como `Business`) no lo cumple aun
// siendo estructuralmente idéntica, por una particularidad de TypeScript:
// solo los `type` literales reciben una "índice signature" implícita, las
// `interface` no. Este mapped-type identidad convierte la interfaz en un
// alias de tipo literal sin cambiar sus propiedades. Sin este truco,
// cualquier `.select()` del SDK tipaba como `never` en vez de con las
// columnas reales.
type Row<T> = { [K in keyof T]: T[K] };

// Forma mínima que espera el SDK de Supabase (Database['public']['Tables'][...]).
// `Relationships: []` en cada tabla y `Views`/`Functions` vacíos porque el
// SDK también exige esa forma exacta. Aquí no modelamos claves foráneas (no
// hacen falta joins tipados todavía); cuando se generen los tipos reales
// con `supabase gen types` esto se sustituye.
// Se amplía según haga falta (payments, notifications_log...).
export interface Database {
  public: {
    Tables: {
      businesses: {
        Row: Row<Business>;
        Insert: Partial<Business>;
        Update: Partial<Business>;
        Relationships: [];
      };
      business_members: {
        Row: Row<BusinessMember>;
        Insert: Partial<BusinessMember>;
        Update: Partial<BusinessMember>;
        Relationships: [];
      };
      services: {
        Row: Row<Service>;
        Insert: Partial<Service>;
        Update: Partial<Service>;
        Relationships: [];
      };
      working_hours: {
        Row: Row<WorkingHours>;
        Insert: Partial<WorkingHours>;
        Update: Partial<WorkingHours>;
        Relationships: [];
      };
      schedule_exceptions: {
        Row: Row<ScheduleException>;
        Insert: Partial<ScheduleException>;
        Update: Partial<ScheduleException>;
        Relationships: [];
      };
      clients: {
        Row: Row<Client>;
        Insert: Partial<Client>;
        Update: Partial<Client>;
        Relationships: [];
      };
      appointments: {
        Row: Row<Appointment>;
        Insert: Partial<Appointment>;
        Update: Partial<Appointment>;
        Relationships: [];
      };
      cancellation_policies: {
        Row: Row<CancellationPolicy>;
        Insert: Partial<CancellationPolicy>;
        Update: Partial<CancellationPolicy>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
