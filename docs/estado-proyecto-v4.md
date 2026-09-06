# Zalcita — Estado del proyecto (v4)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v3: calendario del
negocio completo (ver + gestionar estado + crear/mover citas), trigger de
solape que permite al dueño solapar sin perder la protección del cliente
(migración 0009), y pantalla de administración para aprobar/desactivar negocios
desde la app.

---

## 1. Visión del producto

Plataforma multi-negocio (multi-tenant) donde:
- **Clientes** reservan citas sin fricción (ven disponibilidad sin registro, se
  identifican solo al confirmar).
- **Negocios (dueños)** gestionan su agenda, clientes, servicios, horarios, y
  ven un resumen de ingresos.
- **Administrador de plataforma** (propietario de Zalcita) aprueba los negocios
  que se registran antes de que puedan operar.

Modelo de alta de negocios: **autoservicio con aprobación** (`active=false`
hasta que el admin lo aprueba).

El núcleo del producto ya funciona de punta a punta: un negocio se registra
solo → el admin lo aprueba desde la app → configura servicios y horarios → un
cliente reserva → el negocio ve y gestiona la cita → el dueño puede crear/mover
citas manualmente. Con protección de dobles reservas, aislamiento entre
negocios y RLS revisado.

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
- **`platform_admins`**: la existencia de la fila ES el permiso; comprobación
  encapsulada en la función `is_platform_admin()` (ver §6).
- **`businesses.active`**: llave de la aprobación, protegida por trigger.
- **Protección de solape por trigger, no por constraint**: el `exclude` se
  sustituyó por un trigger (`check_appointment_overlap`) que distingue quién
  escribe: un cliente nunca puede solapar; el dueño/staff sí (con aviso en la
  UI). Ver §6, migración 0009.

Migraciones aplicadas:
- `0001_init` — esquema + RLS.
- `0002_fix_overlap` — corrige protección de doble reserva.
- `0003_business_busy_slots` — función que expone ocupación sin datos ajenos.
- `0004_business_signup` — alta de negocios + infraestructura de admin.
- `0005_business_members_select` — política SELECT que faltaba en
  `business_members`.
- `0006_fix_platform_admin_rls` — `is_platform_admin()` SECURITY DEFINER.
- `0007_working_hours_schedule_exceptions_write` — políticas de escritura que
  faltaban en `working_hours` y `schedule_exceptions`.
- `0008_rls_security_hardening` — quita el DELETE en cascada de `businesses` y
  `appointments` al staff, cierra `payments`/`notifications_log` (que tenían
  RLS sin políticas), y filtra el acceso público de servicios/horarios/
  excepciones por `business.active` (ver §6).
- `0009_owner_can_overlap_appointments` — sustituye el `exclude` por el trigger
  `check_appointment_overlap` (ver §6).

---

## 4. Estado funcional — QUÉ ESTÁ HECHO

### Lado cliente (COMPLETO y probado)
- Ver servicios de un negocio por slug, sin login.
- Calendario de disponibilidad con cálculo de huecos por zona horaria (`Intl`).
- Horas ocupadas agrisadas/"Ocupado", para todos los usuarios, respetando
  privacidad y aislamiento entre negocios (vía `get_business_busy_slots`).
- Identificación por email con código OTP (gratis, sin SMS).
- Ficha de cliente con consentimiento RGPD separado.
- Creación de cita con protección real contra doble reserva.
- Manejo de sesión inválida/caducada.

### Lado negocio (MUY AVANZADO)
- **Registro autoservicio + dueño** (COMPLETO): alta en dos tiempos, idempotente
  y atómica.
- **Infraestructura de admin** (COMPLETO): `platform_admins`, protección de
  `active`, `is_platform_admin()`.
- **Panel distingue pendiente/aprobado** (COMPLETO): banner y `BusinessContext`.
- **Ajustes › Servicios** (COMPLETO): CRUD con activar/desactivar, sin borrado.
- **Ajustes › Horarios y excepciones** (COMPLETO): horario semanal con tramos
  partidos + excepciones (cerrar día / cerrar franja). Validación de solapes.
- **Calendario › ver y gestionar citas** (COMPLETO y probado): vista por día,
  con los datos del cliente (nombre, teléfono, servicio); transiciones de estado
  según el estado actual (confirmar, completar, no-show, cancelar).
- **Calendario › crear y mover citas** (COMPLETO y probado): crear cita manual
  con autocompletado de cliente (o alta de cliente nuevo sobre la marcha), elegir
  servicio y hora; mover citas existentes. El dueño puede elegir cualquier hora
  (fuera de horario, en excepción o solapando) con AVISO, pero no bloqueo. La
  disponibilidad se muestra como guía.

### Administración de plataforma (COMPLETO y probado)
- Pantalla `/admin`, accesible solo para admins (enlace condicional en Ajustes +
  guarda de ruta con `is_platform_admin()`, fail-closed ante error).
- Lista de negocios pendientes con botón "Aprobar" (funciona autenticado como
  admin, sin tocar el trigger, a diferencia del SQL Editor).
- Lista de negocios aprobados con botón "Desactivar" (con confirmación explícita
  de la consecuencia: el negocio se congela para clientes).

---

## 5. QUÉ QUEDA PENDIENTE

### Lado cliente
- **Cliente cancela/modifica su propia cita** desde "mis citas": requiere la
  política UPDATE de cliente en `appointments` (dejada fuera del 0008 a
  propósito), acotada a que solo pueda pasar su cita a `cancelled` (no marcarse
  `confirmed`/`completed`), sujeta a `cancellation_policies`
  (`allow_client_cancellation`, `min_hours_notice`).

### Resto del panel de negocio
- Ajustes › Datos del negocio (nombre, teléfono, email de contacto, dirección).
- Ajustes › Políticas (cancelación/modificación, pago, confirmación manual) —
  requiere política de escritura de `cancellation_policies` (dejada fuera del
  0008) y decidir cómo se provisiona la fila inicial por negocio.
- Ficha de cliente (histórico, total gastado, próxima cita, contacto WhatsApp).
- Resumen financiero.

### Cola de mejoras / incidencias (una a una)
- **Selector de hora** en Horarios: sustituir "HH:mm" por un selector de
  horas/minutos.
- **Selector de fecha** en Excepciones: sustituir "AAAA-MM-DD" por un calendario.
- **Motivo en las excepciones**: campo de texto ("Fiesta del pueblo") en
  `schedule_exceptions` (pequeño cambio de modelo) y mostrarlo al cliente en el
  día cerrado.
- **Entrega de emails (Brevo)**: durante pruebas intensivas se alcanza el límite
  de envío (30/hora). Vigilar; para producción, verificar dominio propio.

### RLS aplazado a cuando se construya cada pantalla
- UPDATE de cliente sobre su cita → con "mis citas" (ver arriba).
- UPDATE/anonimización de cliente sobre su ficha → con perfil de cliente.
- Gestión de equipo en `business_members` → con invitar/quitar staff.
- Escritura de `cancellation_policies` → con la pantalla de políticas.

### Importante para producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web.
  En móvil hará falta `Linking`. **Prioritario antes de lanzar** (la mayoría
  usará móvil).
- **Pasarela de pago (Stripe)**: modelo listo, cobro sin integrar. La escritura
  de `payments` está reservada al webhook de Stripe (service_role).
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron). La
  escritura de `notifications_log` está reservada a ese proceso de servidor.
- **Cuenta huérfana de Auth**: usuario que hace signUp pero no confirma.
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño**: hoy un mismo usuario es ambas cosas; separar a futuro.
- **Punto de entrada claro** en la app: hoy `/` va directo al modo cliente;
  falta una pantalla inicial "reservar" vs "tengo un negocio".

### Más adelante / mejoras de producto
- WhatsApp Business API para recordatorios (fase 2).
- IA: predicción de no-shows, sugerencia de próxima cita, resumen mensual,
  asistente de FAQ (fase 2, sobre datos ya registrados).
- Stripe Connect (marketplace) si el dinero va directo a cada negocio.
- Horarios por profesional (hoy es horario general del negocio).
- Excepciones de "horario especial de apertura" (hoy solo cierre total o de
  una franja).

---

## 6. Bugs importantes resueltos (memoria del proyecto)

- **Doble reserva sin `member_id`**: la restricción `exclude` usaba `member_id`,
  y como `NULL != NULL`, citas sin profesional no chocaban. Corregido con
  `COALESCE(member_id, business_id)` (0002).
- **Bucle infinito de renders** en confirmación: dos `useEffect` competían por
  `step`. Fusionados + `ref`.
- **Sesión fantasma**: la app se fiaba de la sesión cacheada. Resuelto validando
  con `getUser()` contra el servidor.
- **Ocupación solo visible para el propio usuario**: RLS ocultaba citas ajenas
  a la disponibilidad. Resuelto con función `SECURITY DEFINER` que expone solo
  rangos horarios (0003).
- **Estado pegado entre reservas** + **cruce de ficha entre negocios**.
- **RLS ausente (patrón recurrente)**: varias tablas tenían RLS activado pero
  cero políticas desde `0001` — `business_members` (0005), `working_hours` y
  `schedule_exceptions` (0007), `payments` y `notifications_log` (0008). Cualquier
  acceso fallaba en silencio. Auditoría completa hecha; ver 0008.
- **`permission denied for table platform_admins` en acceso anónimo**: una
  política que hacía `exists(... platform_admins)` reventaba TODA la consulta
  para el rol anónimo (que no puede leer esa tabla). Resuelto encapsulando en
  `is_platform_admin()` SECURITY DEFINER (0006). Lección: una política RLS que
  referencia una tabla protegida puede romper el acceso de otros roles.
- **DELETE en cascada de negocio**: la política FOR ALL del staff en `businesses`
  permitía a cualquier staff borrar el negocio entero (cascada a clientes, citas,
  pagos). Separada en SELECT/INSERT/UPDATE sin DELETE (0008). Igual en
  `appointments`.
- **El dueño no podía solapar / el cliente no debía poder**: el `exclude` era
  simétrico y no distinguía quién escribe. Sustituido por el trigger
  `check_appointment_overlap` (0009), SECURITY DEFINER, que deja pasar al staff
  (decidido por si `auth.uid()` es miembro del negocio AHORA, no por el
  `created_by` histórico — clave para el caso "el dueño mueve una cita de un
  cliente") y bloquea al cliente, con `pg_advisory_xact_lock` para la
  concurrencia. Mantiene el código de error `23P01` para no romper el manejo de
  `confirmacion.tsx`. Verificado: dueño puede solapar, cliente sigue bloqueado
  (cliente-vs-cliente y caso mixto dueño-primero).
- **Crash y fecha pegada en `cita.tsx`** (crear/mover): la pantalla, al ser
  `Tabs.Screen` con `href:null`, no se desmonta entre navegaciones. El guard de
  carga no esperaba a `selectedDate` (→ Invalid Date en `Intl`), y la
  inicialización con `!selectedDate` no re-sincronizaba al reabrir con otra fecha
  (→ cita creada 7 días antes). Resuelto con `!selectedDate` en el guard y el
  patrón de `ref` con clave de navegación (como `confirmacion.tsx`).

### Notas operativas
- **Aprobar un negocio desde el SQL Editor NO funciona** (el trigger comprueba
  `auth.uid()`, null en el editor). La vía correcta es la pantalla `/admin`, ya
  construida, donde el admin actúa autenticado.

---

## 7. Configuración (Supabase)

- Confirmación de email: activada.
- Login: email + código OTP para clientes y dueños; los dueños además con
  contraseña. Sin SMS.
- Plantillas de email ("Magic Link" y "Confirm signup") editadas para enviar
  código (`{{ .Token }}`).
- SMTP: Brevo (300/día gratis, europeo; límite de 30/hora que se nota en pruebas
  intensivas). Sender de prueba; falta verificar dominio propio para producción.
- `detectSessionInUrl: true` (inofensivo; el flujo usa código, no enlace).

---

## 8. Principios que guían el proyecto

- **RGPD/LOPDGDD desde el diseño**: minimización, consentimiento separado, datos
  en la UE, anonimización, aislamiento entre negocios.
- **Herramientas gratuitas** siempre que se pueda en el MVP.
- **Sin librerías innecesarias** (fechas con `Intl`).
- **Seguridad de datos con revisión doble**: los cambios que tocan RLS, roles o
  acceso a datos se diseñan y revisan con cuidado especial. El SQL se revisa
  antes de aplicarlo a la base de datos.
- **Trocear el trabajo**: cambios acotados y verificables uno a uno, en vez de
  mega-cambios difíciles de revisar. Ha sido clave para cazar bugs pronto.
