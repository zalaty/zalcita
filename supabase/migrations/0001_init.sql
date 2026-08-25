-- Migración inicial — Zalaty
-- Ejecutar con: npx supabase db push  (o pegar en el SQL Editor del panel de Supabase)
-- Ver supabase/modelo-datos-referencia.md para el razonamiento de cada decisión.

create extension if not exists "uuid-ossp";
create extension if not exists btree_gist;

-- ============================================================
-- NEGOCIOS (tenants)
-- ============================================================
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  timezone text not null default 'Europe/Madrid',
  phone text,
  email text,
  address text,
  stripe_account_id text,
  payment_policy text not null default 'none'
    check (payment_policy in ('none','deposit','full')),
  deposit_percentage numeric(5,2),
  requires_owner_confirmation boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','staff')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

-- ============================================================
-- SERVICIOS
-- ============================================================
create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  price numeric(10,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTES
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id),
  name text not null,
  phone text not null,
  email text,
  notes text,
  consent_data_processing boolean not null default false,
  consent_marketing boolean not null default false,
  consent_recorded_at timestamptz,
  is_anonymized boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

-- ============================================================
-- DISPONIBILIDAD
-- ============================================================
create table working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  member_id uuid references business_members(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null
);

create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  member_id uuid references business_members(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  start_time time,
  end_time time
);

-- ============================================================
-- POLÍTICAS DE CANCELACIÓN / MODIFICACIÓN
-- ============================================================
create table cancellation_policies (
  business_id uuid primary key references businesses(id) on delete cascade,
  min_hours_notice int not null default 24,
  allow_client_modification boolean not null default true,
  allow_client_cancellation boolean not null default true,
  penalty_type text default 'none'
    check (penalty_type in ('none','deposit_loss','fixed_fee')),
  penalty_amount numeric(10,2)
);

-- ============================================================
-- CITAS
-- ============================================================
create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  service_id uuid not null references services(id) on delete restrict,
  member_id uuid references business_members(id),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','cancelled','completed','no_show')),
  price_at_booking numeric(10,2) not null,
  payment_status text not null default 'none'
    check (payment_status in ('none','pending','paid','refunded')),
  created_by text not null check (created_by in ('client','owner')),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  exclude using gist (
    member_id with =,
    tstzrange(start_time, end_time) with &&
  ) where (status in ('pending','confirmed'))
);

-- ============================================================
-- PAGOS
-- ============================================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  stripe_payment_intent_id text,
  amount numeric(10,2) not null,
  currency text not null default 'eur',
  status text not null check (status in ('pending','succeeded','failed','refunded')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- NOTIFICACIONES
-- ============================================================
create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  channel text not null check (channel in ('push','whatsapp')),
  type text not null check (type in ('reminder','confirmation','cancellation','modification')),
  status text not null default 'sent' check (status in ('sent','failed')),
  sent_at timestamptz not null default now()
);

create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table businesses enable row level security;
alter table business_members enable row level security;
alter table services enable row level security;
alter table clients enable row level security;
alter table working_hours enable row level security;
alter table schedule_exceptions enable row level security;
alter table cancellation_policies enable row level security;
alter table appointments enable row level security;
alter table payments enable row level security;
alter table notifications_log enable row level security;
alter table push_tokens enable row level security;

-- Cualquiera (incluso anónimo) puede ver negocios activos y sus servicios:
-- necesario para que un cliente sin cuenta vea disponibilidad.
create policy "negocios activos son públicos" on businesses
  for select using (active = true);

create policy "servicios activos son públicos" on services
  for select using (active = true);

create policy "horarios son públicos" on working_hours
  for select using (true);

create policy "excepciones de horario son públicas" on schedule_exceptions
  for select using (true);

create policy "políticas de cancelación son públicas" on cancellation_policies
  for select using (true);

-- Staff/dueño ve y gestiona solo los datos de su(s) propio(s) negocio(s)
create policy "staff gestiona su negocio" on businesses
  for all using (
    id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff gestiona sus servicios" on services
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff ve clientes de su negocio" on clients
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

-- Un cliente autenticado ve y gestiona su propia ficha
create policy "cliente ve su propia ficha" on clients
  for select using (auth_user_id = auth.uid());

create policy "cliente crea su propia ficha" on clients
  for insert with check (auth_user_id = auth.uid());

-- Citas: staff del negocio, o el propio cliente dueño de la cita
create policy "staff gestiona citas de su negocio" on appointments
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "cliente ve sus propias citas" on appointments
  for select using (
    client_id in (select id from clients where auth_user_id = auth.uid())
  );

create policy "cliente crea sus propias citas" on appointments
  for insert with check (
    client_id in (select id from clients where auth_user_id = auth.uid())
  );

-- Notificaciones y tokens push: cada usuario solo ve lo suyo
create policy "usuario gestiona sus propios push tokens" on push_tokens
  for all using (user_id = auth.uid());
