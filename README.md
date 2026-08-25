# Zalaty — proyecto base

Expo Router + TypeScript + Supabase, siguiendo el diseño de
`modelo-datos.md`, `pantallas-flujos.md` y `sistema-notificaciones.md`.

## 1. Poner en marcha Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com), región **Frankfurt (eu-central-1)**.
2. En el SQL Editor del panel, pega y ejecuta el contenido de
   `supabase/migrations/0001_init.sql` (o usa la CLI de Supabase con
   `npx supabase db push` si prefieres versionar migraciones desde el principio).
3. En **Authentication > Providers**, activa:
   - **Phone** (para el login por OTP de los clientes) — necesitarás
     configurar un proveedor de SMS (Twilio tiene capa gratuita limitada).
   - **Email** (para el login de negocios).
4. Copia `.env.example` a `.env` y rellena con la URL y la `anon key` de
   **Project Settings > API**.

## 2. Arrancar el proyecto

```bash
npm install
npm run web       # o: npm run android / npm run ios (con Expo Go)
```

## 3. Estructura

```
app/
  _layout.tsx           Layout raíz, envuelve todo en AuthProvider
  index.tsx              Redirige según sesión y rol (cliente/negocio)
  (auth)/login.tsx        OTP por teléfono (cliente) o email+contraseña (negocio)
  (client)/                App cliente: disponibilidad, mis citas, perfil
  (business)/               Panel del negocio: calendario, clientes, resumen, ajustes
context/AuthContext.tsx    Sesión + resolución de rol
lib/supabase.ts            Cliente de Supabase tipado
types/database.ts          Tipos manuales (sustituir por los generados cuando el
                            proyecto de Supabase exista: supabase gen types)
supabase/migrations/       Esquema SQL versionado
```

## 4. Estado actual

Todas las pantallas están creadas como **placeholders navegables** con
comentarios `TODO` que apuntan a la sección exacta del diseño
(`pantallas-flujos.md`) que hay que implementar ahí. La navegación, el
esquema de base de datos, RLS, y el login (OTP / email) ya son funcionales
en cuanto conectes tu propio proyecto de Supabase.

## 5. Siguientes pasos sugeridos (en orden)

1. Configurar Supabase (paso 1) y probar el login de ambas vías.
2. Construir el flujo de reserva del cliente completo: selección de
   servicio → calendario de disponibilidad → hora → confirmación → pago
   condicional (Stripe, según `payment_policy` del negocio).
3. Calendario del negocio con Realtime y el formulario de reserva manual
   con autocompletado de cliente.
4. Edge Functions para notificaciones push (trigger inmediato + cron diario
   de recordatorios) — ver `sistema-notificaciones.md`.
5. EAS Build para las primeras builds de prueba en Android (iOS pendiente
   de licencia de desarrollador, según lo acordado).
