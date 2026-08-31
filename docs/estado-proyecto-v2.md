# Zalcita — Estado del proyecto (v2)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: agosto 2026. Cambios respecto a v1: registro
autoservicio de negocios completado, infraestructura de admin, y panel que
distingue negocio pendiente/aprobado.

---

## 1. Visión del producto

Plataforma multi-negocio (multi-tenant) donde:
- **Clientes** reservan citas sin fricción (ven disponibilidad sin registro, se
  identifican solo al confirmar).
- **Negocios (dueños)** gestionan su agenda, clientes, servicios, horarios, y
  ven un resumen de ingresos.
- **Administrador de plataforma** (propietario de Zalcita) aprueba los negocios
  que se registran antes de que puedan operar.

Modelo de alta de negocios: **autoservicio con aprobación**. Cualquiera registra
su negocio, pero entra en estado "pendiente" (`active=false`) y no opera hasta
que el administrador lo aprueba.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Expo (React Native) + Expo Router |
| Lenguaje | TypeScript (estricto) |
| Backend | Supabase (Postgres + Auth + RLS) — región Frankfurt (EU) |
| Pagos | Stripe (previsto, aún no implementado) |
| Email transaccional | Brevo (SMTP, europeo) vía Supabase Auth |
| Notificaciones | Expo Push (previsto) + WhatsApp `wa.me` (contacto manual) |
| Build nativo | EAS Build |
| CI/CD | GitHub Actions (previsto) |
| Hosting web | Hostinger (previsto) |

Identificadores: app `com.zalcita.app`, cuenta Expo (owner) `zalaty`.

---

## 3. Modelo de datos (implementado)

Tablas: `businesses`, `business_members`, `services`, `clients`,
`working_hours`, `schedule_exceptions`, `cancellation_policies`,
`appointments`, `payments`, `notifications_log`, `push_tokens`,
`platform_admins`.

Decisiones clave:
- **Multi-tenant** aislado por RLS desde el día uno.
- **`clients` por negocio, no global** (decisión RGPD).
- **`price_at_booking`** copiado en cada cita.
- **Anonimización** en vez de borrado (derecho al olvido + contabilidad).
- **`platform_admins`**: la existencia de la fila ES el permiso (sin campo
  booleano). RLS blindado: nadie se auto-nombra admin.
- **`businesses.active`** es la llave de la aprobación: un trigger
  (`protect_business_active_column`) impide que nadie que no sea admin lo
  cambie — ni siquiera el propio dueño.

Migraciones aplicadas:
- `0001_init` — esquema + RLS.
- `0002_fix_overlap` — corrige protección de doble reserva.
- `0003_business_busy_slots` — función que expone ocupación sin datos ajenos.
- `0004_business_signup` — alta de negocios + infraestructura de admin + trigger
  de protección de `active` + función atómica `create_business_with_owner`.
- `0005_business_members_select` — política SELECT que faltaba en
  `business_members` (bug preexistente, ver §6) + política de lectura de admin.

---

## 4. Estado funcional — QUÉ ESTÁ HECHO

### Lado cliente (COMPLETO y probado)
- Ver servicios de un negocio por slug, sin login.
- Calendario de disponibilidad con cálculo de huecos por zona horaria (`Intl`,
  sin librerías).
- Horas ocupadas agrisadas/"Ocupado" y no seleccionables, para TODOS los
  usuarios, respetando privacidad (solo rango horario) y aislamiento entre
  negocios (vía función `get_business_busy_slots`).
- Identificación por email con código OTP (gratis, sin SMS).
- Ficha de cliente con consentimiento RGPD (separado, sin premarcar).
- Creación de cita con protección real contra doble reserva.
- Manejo de sesión inválida/caducada (validación con `getUser`).

### Lado negocio (EN CURSO — avanzando)
- **Registro autoservicio del negocio + dueño** (COMPLETO y probado): alta en
  dos tiempos (formulario → confirmación por código de email → creación
  automática del negocio con `active=false`). Idempotente y atómica.
- **Infraestructura de administración** (COMPLETO): `platform_admins`,
  protección de `active`, políticas de admin.
- **Panel distingue pendiente/aprobado** (COMPLETO y probado): banner de
  "pendiente de aprobación" cuando `active=false`; el dueño puede acceder a
  Ajustes para configurar, pero Calendario/Clientes/Resumen indican que estarán
  disponibles al aprobar. Con `active=true`, panel normal. Estado del negocio en
  un `BusinessContext` dedicado.
- **Pantallas del panel**: aún son placeholders (sin funcionalidad real).

---

## 5. QUÉ QUEDA PENDIENTE

### Inmediato (siguiente en la cola)
- **Pantalla de administración**: donde el admin ve los negocios pendientes y
  los aprueba desde la app (cambiar `active` a true). Necesaria porque aprobar
  desde el SQL Editor no funciona bien (el trigger comprueba `auth.uid()`, que
  es null en el editor — ver §6).
- **Contenido real del panel de negocio**: gestión de servicios, horarios y
  políticas (Ajustes); calendario de citas con reserva manual; ficha de cliente;
  resumen financiero.
- **Punto de entrada claro** en la app: hoy `/` lleva directo al modo cliente;
  falta una pantalla inicial que ofrezca "reservar" vs "tengo un negocio".

### Importante para producción (no bloquea desarrollo web, sí lanzamiento)
- **Registro/confirmación en app MÓVIL (deep linking nativo)**: resuelto para
  web (flujo por código). En móvil hará falta manejo de `Linking`.
  **Prioritario antes de lanzar** (la mayoría de usuarios usarán móvil).
- **Pasarela de pago (Stripe)**: modelo listo (`payment_policy` por negocio),
  cobro sin integrar.
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth**: si alguien hace signUp pero no confirma, queda un
  usuario sin negocio. No es corrupción; conviene gestionarlo.
- **Verificar dominio propio en Brevo** (`@zalcita.app`) para producción.
- **Rol admin vs dueño**: hoy, para probar, un mismo usuario
  (`zalcita.app@gmail.com`) es dueño de un negocio Y admin de plataforma. A
  futuro conviene separar los roles y decidir cómo navega un usuario que es
  ambas cosas.

### Más adelante / mejoras
- WhatsApp Business API para recordatorios (fase 2).
- IA: predicción de no-shows, sugerencia de próxima cita, resumen mensual,
  asistente de FAQ (fase 2, sobre datos ya registrados).
- Stripe Connect (marketplace) si el dinero va directo a cada negocio.
- SMS/OTP por teléfono (Twilio de pago) si se decide verificar teléfono.

---

## 6. Bugs importantes resueltos (memoria del proyecto)

- **Doble reserva sin `member_id`**: la restricción `exclude` usaba `member_id`,
  pero `NULL != NULL` en SQL, así que citas sin profesional no chocaban.
  Corregido con `COALESCE(member_id, business_id)`.
- **Bucle infinito de renders** en confirmación: dos `useEffect` competían por
  `step`. Resuelto fusionándolos y con una `ref`.
- **Sesión fantasma**: la app se fiaba de la sesión cacheada sin validar.
  Resuelto con `getUser()` contra el servidor.
- **Ocupación solo visible para el propio usuario**: el RLS ocultaba las citas
  ajenas también a la disponibilidad. Resuelto con función `SECURITY DEFINER`
  que expone solo rangos horarios del negocio.
- **Estado pegado entre reservas** + **cruce de ficha entre negocios**:
  reinicio de estado al cambiar de franja + resolución de ficha atada a
  (negocio + usuario).
- **RLS ausente en `business_members`**: la tabla tenía RLS activado pero cero
  políticas desde `0001`, así que cualquier SELECT devolvía vacío para todos,
  silenciosamente. Afectaba a `resolveRole` y destapado por `BusinessContext`.
  Resuelto en `0005` con política SELECT propia + de admin.

### Notas operativas
- **Aprobar un negocio NO funciona desde el SQL Editor** directamente: el
  trigger comprueba `auth.uid()`, que es `null` en el editor, así que rechaza el
  cambio de `active` aunque seas admin. Para probar a mano hay que desactivar el
  trigger temporalmente (`alter table businesses disable trigger
  trg_protect_business_active; ... enable ...`). La vía correcta es la futura
  pantalla de admin, donde el admin está autenticado con su `auth.uid()` real.

---

## 7. Configuración (Supabase)

- Confirmación de email: **activada** (verifica el correo al registrarse).
- Login: clientes y dueños por **email + código OTP**; los dueños además pusieron
  contraseña en el registro. Sin SMS (coste).
- Plantillas de email ("Magic Link" y "Confirm signup") editadas para enviar
  **código** (`{{ .Token }}`), no enlace.
- SMTP: Brevo (300 correos/día gratis, europeo). Sender de prueba por ahora.
- `detectSessionInUrl: true` en el cliente (inofensivo; el flujo actual usa
  código, no enlace).

---

## 8. Principios que guían el proyecto

- **RGPD/LOPDGDD desde el diseño**: minimización, consentimiento separado, datos
  en la UE, anonimización, aislamiento estricto entre negocios.
- **Herramientas gratuitas** siempre que se pueda en el MVP.
- **Sin librerías innecesarias** (fechas con `Intl`, no `date-fns`).
- **Seguridad de datos con revisión doble**: los cambios que tocan RLS, roles o
  acceso a datos se diseñan y revisan con cuidado especial antes de aplicarse.
