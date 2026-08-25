# Modelo de datos — MVP app de reservas (Zalaty)

Diseñado para Supabase (Postgres + Auth + RLS + Realtime). Multi-tenant desde el
día uno: cada negocio (`businesses`) es un tenant aislado.

## 1. Relación entre tablas (resumen)

```
businesses ──┬── business_members (dueño/staff, vinculado a auth.users)
             ├── services
             ├── clients
             ├── cancellation_policies (1:1)
             ├── working_hours / schedule_exceptions
             └── appointments ──┬── payments (0:1)
                                 └── notifications_log
```

`clients` pertenece a UN negocio (no es una tabla global de personas). Es una
decisión de diseño deliberada por RGPD: evita crear sin querer un perfil
"cross-negocio" de una persona sin su consentimiento explícito para eso. Si el
mismo cliente va a la peluquería A y a la clínica B, son dos fichas
independientes, cada una con su propio consentimiento.

## 2. Esquema SQL

```sql
-- ============================================================
-- NEGOCIOS (tenants)
-- ============================================================
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,              -- para URL pública de reserva
  timezone text not null default 'Europe/Madrid',
  phone text,
  email text,
  address text,
  stripe_account_id text,                 -- null hasta que conecte Stripe
  payment_policy text not null default 'none'
    check (payment_policy in ('none','deposit','full')),
  deposit_percentage numeric(5,2),        -- solo si payment_policy = 'deposit'
  requires_owner_confirmation boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Dueño(s) y staff, vinculados a Supabase Auth
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
-- CLIENTES (dato mínimo, ver notas RGPD abajo)
-- ============================================================
create table clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id),  -- null si lo creó el dueño manualmente
  name text not null,
  phone text not null,
  email text,
  notes text,                             -- notas internas del negocio (alergias, preferencias...)
  consent_data_processing boolean not null default false,
  consent_marketing boolean not null default false,
  consent_recorded_at timestamptz,
  is_anonymized boolean not null default false,  -- true tras "derecho al olvido"
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

-- ============================================================
-- DISPONIBILIDAD
-- ============================================================
create table working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  member_id uuid references business_members(id) on delete cascade, -- null = horario general del negocio
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=domingo
  start_time time not null,
  end_time time not null
);

create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  member_id uuid references business_members(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,  -- vacaciones, festivo...
  start_time time,                          -- si es solo un bloqueo parcial
  end_time time
);

-- ============================================================
-- POLÍTICAS DE CANCELACIÓN / MODIFICACIÓN
-- ============================================================
create table cancellation_policies (
  business_id uuid primary key references businesses(id) on delete cascade,
  min_hours_notice int not null default 24,  -- horas mínimas para cancelar/modificar sin penalización
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
  member_id uuid references business_members(id),  -- profesional asignado
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','cancelled','completed','no_show')),
  price_at_booking numeric(10,2) not null,  -- copia del precio (por si el servicio cambia de precio después)
  payment_status text not null default 'none'
    check (payment_status in ('none','pending','paid','refunded')),
  created_by text not null check (created_by in ('client','owner')),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  -- evita solapes: un profesional no puede tener dos citas confirmadas que se pisen
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
-- LOG DE NOTIFICACIONES (recordatorios, confirmaciones)
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
```

## 3. Row-Level Security (aislamiento entre negocios)

Esto es lo que garantiza que un negocio nunca pueda ver los clientes/citas de
otro, a nivel de base de datos (no solo a nivel de aplicación):

```sql
alter table clients enable row level security;
alter table appointments enable row level security;

-- Staff/dueño solo ve clientes de su(s) propio(s) negocio(s)
create policy "staff ve clientes de su negocio"
on clients for select
using (
  business_id in (
    select business_id from business_members where user_id = auth.uid()
  )
);

-- Un cliente autenticado solo ve su propia ficha
create policy "cliente ve su propia ficha"
on clients for select
using (auth_user_id = auth.uid());

-- Mismo patrón para appointments, payments, notifications_log...
```

## 4. Decisiones de diseño relevantes

- **`price_at_booking` en vez de leer siempre `services.price`**: si el negocio
  sube precios, las citas ya reservadas no cambian de precio retroactivamente.
- **`exclude using gist`**: restricción a nivel de base de datos que impide que
  dos citas del mismo profesional se solapen — evita condiciones de carrera
  cuando dos personas reservan a la vez (aquí ayuda mucho el Realtime de
  Supabase para refrescar la UI al instante).
- **`clients` no es global**: cada negocio tiene su propia ficha del cliente,
  aunque sea la misma persona. Simplifica el consentimiento y evita un problema
  de privacidad (que un negocio vea el historial del cliente en otro negocio).

## 5. RGPD / LOPDGDD — puntos que afectan directamente a este esquema

- **Minimización de datos**: el esquema solo pide `name` + `phone`, con `email`
  y `notes` opcionales. No añadas campos "por si acaso" — cada campo nuevo es
  un dato que hay que justificar, proteger y poder borrar.
- **Consentimiento separado para dos finalidades distintas**:
  `consent_data_processing` (necesario para prestar el servicio: gestionar la
  cita) y `consent_marketing` (opcional, para comunicaciones comerciales). No
  pueden ir mezclados en una sola casilla — es un requisito explícito de la
  AEPD, no solo una buena práctica.
- **Derecho al olvido sin romper la contabilidad**: no se puede hacer `DELETE`
  duro de un cliente si tiene citas con pagos asociados, porque la normativa
  fiscal española obliga a conservar registros de facturación varios años. Por
  eso `is_anonymized`: en vez de borrar, se sobrescriben `name`, `phone`,
  `email`, `notes` con valores anonimizados pero se conservan `appointments` y
  `payments` para contabilidad.
- **Registro de Actividades de Tratamiento (RAT)**: como responsables del
  tratamiento tendréis que documentar (fuera del código, en un documento) qué
  datos se tratan, con qué finalidad, cuánto tiempo se conservan y qué medidas
  de seguridad hay. Es obligatorio tener este registro, no solo el código.
- **Encargados de tratamiento (subprocesadores)**: Supabase y Stripe actúan
  como "encargados de tratamiento" — ambos ofrecen DPA (Data Processing
  Agreement) firmable desde el panel, y conviene usar la región **Frankfurt
  (EU)** en Supabase para que los datos no salgan de la UE.
- **Base legal para el recordatorio de WhatsApp**: si usáis la API de WhatsApp
  Business más adelante, el mensaje de recordatorio de cita entra dentro de la
  "ejecución del contrato" (no necesita opt-in de marketing), pero cualquier
  mensaje promocional sí necesita `consent_marketing = true`.

## 6. Herramientas gratuitas usadas en este diseño

| Necesidad | Herramienta | Coste |
|---|---|---|
| DB + Auth + Realtime + RLS | Supabase (plan Free, región Frankfurt) | Gratis hasta límites generosos para MVP |
| Pagos | Stripe (sin cuota mensual) | Solo comisión por transacción, nada si `payment_policy = 'none'` |
| Notificaciones recordatorio | Expo Push Notifications | Gratis |
| CI/CD | GitHub Actions | Gratis (plan público/privado con minutos incluidos) |
| Contacto directo dueño→cliente | Enlace `wa.me/<número>` | Gratis, sin API de pago |

Con esto la fase 1 no tiene ningún coste fijo mensual salvo lo que uséis de
verdad (comisión de Stripe si hay pagos, y eventualmente subir de plan en
Supabase si crece el uso).
