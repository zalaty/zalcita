# Zalcita — Estado del proyecto (v5)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v4: el cliente puede
cancelar su propia cita según la política del negocio (migración 0010), login de
cliente unificado por email, y las dos últimas pantallas del panel del dueño
(ficha de cliente y resumen financiero) completadas. El núcleo funcional del MVP
está cerrado.

---

## 1. Visión del producto

Plataforma multi-negocio (multi-tenant) donde:
- **Clientes** reservan citas sin fricción (ven disponibilidad sin registro, se
  identifican solo al confirmar) y gestionan (cancelan) sus citas.
- **Negocios (dueños)** gestionan su agenda, clientes, servicios, horarios, y
  ven un resumen de ingresos.
- **Administrador de plataforma** (propietario de Zalcita) aprueba los negocios
  que se registran antes de que puedan operar.

Modelo de alta de negocios: **autoservicio con aprobación** (`active=false`
hasta que el admin lo aprueba).

El núcleo del producto funciona de punta a punta: un negocio se registra solo →
el admin lo aprueba desde la app → configura servicios y horarios → un cliente
reserva → el negocio ve y gestiona la cita → el dueño crea/mueve citas
manualmente → el cliente puede cancelar la suya → el dueño consulta la ficha de
cada cliente y su resumen de ingresos. Con protección de dobles reservas,
aislamiento entre negocios y RLS revisado.

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
  `appointments`, cierra `payments`/`notifications_log`, filtra el acceso
  público por `business.active` (ver §6).
- `0009_owner_can_overlap_appointments` — sustituye el `exclude` por el trigger
  `check_appointment_overlap` (ver §6).
- `0010_client_cancels_own_appointment` — política UPDATE + trigger
  `enforce_client_cancel_only` para que el cliente pueda cancelar SU cita y solo
  eso (ver §6).

---

## 4. Estado funcional — QUÉ ESTÁ HECHO

### Lado cliente (COMPLETO y probado)
- Ver servicios de un negocio por slug, sin login.
- Calendario de disponibilidad con cálculo de huecos por zona horaria (`Intl`).
- Horas ocupadas agrisadas/"Ocupado", para todos los usuarios, respetando
  privacidad y aislamiento entre negocios (vía `get_business_busy_slots`).
- Identificación por email con código OTP (gratis, sin SMS). Login unificado por
  email en todas las vías de entrada (login.tsx y confirmacion.tsx).
- Ficha de cliente con consentimiento RGPD separado.
- Creación de cita con protección real contra doble reserva.
- **Mis citas**: ver citas de todos sus negocios (agregadas) y CANCELAR la propia
  cita según la política del negocio (allow_client_cancellation, min_hours_notice
  — fuera de plazo permite cancelar con aviso). Solo puede cancelar, nada más
  (ver §6, migración 0010).
- Manejo de sesión inválida/caducada.

### Lado negocio (COMPLETO en su núcleo)
- **Registro autoservicio + dueño** (COMPLETO): alta en dos tiempos, idempotente
  y atómica.
- **Infraestructura de admin** (COMPLETO): `platform_admins`, protección de
  `active`, `is_platform_admin()`.
- **Panel distingue pendiente/aprobado** (COMPLETO): banner y `BusinessContext`.
- **Ajustes › Servicios** (COMPLETO): CRUD con activar/desactivar, sin borrado.
- **Ajustes › Horarios y excepciones** (COMPLETO): horario semanal con tramos
  partidos + excepciones. Validación de solapes.
- **Calendario › ver y gestionar citas** (COMPLETO): vista por día, datos del
  cliente, transiciones de estado (confirmar, completar, no-show, cancelar).
- **Calendario › crear y mover citas** (COMPLETO): crear cita manual con
  autocompletado/alta de cliente, elegir servicio y hora; mover citas. El dueño
  puede solapar/salirse de horario con AVISO, no bloqueo.
- **Clientes › listado + ficha** (COMPLETO): listado con búsqueda, ficha con
  historial de citas, estadísticas (citas completadas, gastado, previsto, próxima
  cita), notas internas editables, y contacto por WhatsApp (`wa.me`, con
  normalización de teléfono).
- **Resumen financiero** (COMPLETO): por mes (navegable), ingresos reales
  (completadas) + previsto (confirmadas futuras), nº citas, ticket medio,
  comparativa con mes anterior, y gráficos de barras (sin librería) por semana y
  por servicio. Presentado como "ingresos por citas", no como caja contable
  (aún no hay integración de pagos).

### Administración de plataforma (COMPLETO y probado)
- Pantalla `/admin`, solo para admins (enlace condicional en Ajustes + guarda de
  ruta con `is_platform_admin()`, fail-closed).
- Aprobar negocios pendientes y desactivar aprobados (con confirmación).

---

## 5. QUÉ QUEDA PENDIENTE

### Resto del panel de negocio (lo que falta de Ajustes)
- Ajustes › Datos del negocio (nombre, teléfono, email de contacto, dirección).
- Ajustes › Políticas (cancelación/modificación, pago, confirmación manual) —
  requiere política de escritura de `cancellation_policies` (dejada fuera del
  0008) y decidir cómo se provisiona la fila inicial por negocio. HOY las
  políticas de cancelación existen en BD pero no hay pantalla para editarlas
  (se prueban insertando filas a mano por SQL).

### Lado cliente
- **Cliente MODIFICA (mueve) su propia cita** desde "mis citas" (hoy solo puede
  cancelar). Sería casi un mini-flujo de reserva; se aplazó a propósito.

### Cola de mejoras / incidencias (una a una)
- **Selector de hora** en Horarios: sustituir "HH:mm" por un selector.
- **Selector de fecha** en Excepciones: sustituir "AAAA-MM-DD" por un calendario.
- **Motivo en las excepciones**: campo de texto ("Fiesta del pueblo") en
  `schedule_exceptions` (pequeño cambio de modelo) y mostrarlo al cliente.
- **Punto de entrada claro** en la app: hoy tras el login de cliente `/` va a la
  pantalla de cliente que necesita `?slug=`; falta una pantalla inicial "reservar"
  vs "tengo un negocio" y encaminar mejor al cliente sin slug.
- **Entrega de emails (Brevo)**: límite de 30/hora que molesta en pruebas
  intensivas. Para producción, verificar dominio propio.

### RLS aplazado a cuando se construya cada pantalla
- UPDATE/anonimización de cliente sobre su ficha → con perfil de cliente.
- Gestión de equipo en `business_members` → con invitar/quitar staff.
- Escritura de `cancellation_policies` → con la pantalla de políticas.
- (Opcional) que el cliente vea el nombre de un negocio ya desactivado en su
  historial de "mis citas" (hoy muestra "Negocio" como fallback cosmético).

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

### Más adelante / mejoras de producto
- WhatsApp Business API para recordatorios (fase 2).
- IA: predicción de no-shows, sugerencia de próxima cita, resumen mensual en
  lenguaje natural, asistente de FAQ (fase 2, sobre datos ya registrados).
- Stripe Connect (marketplace) si el dinero va directo a cada negocio.
- Horarios por profesional (hoy es horario general del negocio).
- Excepciones de "horario especial de apertura" (hoy solo cierre total o franja).

---

## 6. Bugs importantes resueltos (memoria del proyecto)

- **Doble reserva sin `member_id`**: `exclude` usaba `member_id` y `NULL != NULL`
  dejaba pasar citas sin profesional. Corregido con `COALESCE(member_id,
  business_id)` (0002), luego sustituido por trigger (0009).
- **Bucle infinito de renders** en confirmación: dos `useEffect` competían por
  `step`. Fusionados + `ref`.
- **Sesión fantasma**: la app se fiaba de la sesión cacheada. Resuelto con
  `getUser()` contra el servidor.
- **Ocupación solo visible para el propio usuario**: RLS ocultaba citas ajenas.
  Resuelto con función `SECURITY DEFINER` `get_business_busy_slots` (0003).
- **Estado pegado entre reservas** + **cruce de ficha entre negocios**.
- **RLS ausente (patrón recurrente)**: varias tablas con RLS activado pero cero
  políticas desde `0001` — `business_members` (0005), `working_hours` y
  `schedule_exceptions` (0007), `payments` y `notifications_log` (0008). Auditoría
  completa hecha (ver 0008).
- **`permission denied for table platform_admins` en acceso anónimo**: una
  política con `exists(... platform_admins)` reventaba toda la consulta para el
  rol anónimo. Resuelto encapsulando en `is_platform_admin()` SECURITY DEFINER
  (0006). Lección: una política RLS que referencia una tabla protegida puede
  romper el acceso de otros roles.
- **DELETE en cascada de negocio**: la política FOR ALL del staff permitía borrar
  el negocio entero. Separada en SELECT/INSERT/UPDATE sin DELETE (0008). Igual en
  `appointments`.
- **El dueño no podía solapar / el cliente no debía poder**: `exclude` era
  simétrico. Sustituido por el trigger `check_appointment_overlap` (0009), que
  deja pasar al staff (por si `auth.uid()` es miembro AHORA, no por `created_by`
  histórico) y bloquea al cliente, con `pg_advisory_xact_lock`. Verificado:
  cliente-vs-cliente y caso mixto dueño-primero siguen bloqueados.
- **Crash y fecha pegada en `cita.tsx`**: pantalla `Tabs.Screen` con `href:null`
  que no se desmonta entre navegaciones. Guard que no esperaba a `selectedDate`
  (→ Invalid Date) e inicialización con `!selectedDate` que no re-sincronizaba
  (→ cita 7 días antes). Resuelto con `ref` de clave de navegación.
- **Cliente cancela solo lo suyo, y solo cancelar**: una política UPDATE ingenua
  dejaría al cliente marcarse `completed` o cambiar el precio (RLS solo evalúa la
  fila final, no qué columnas cambian). Resuelto con RLS (ownership + status
  final = cancelled) MÁS un trigger `enforce_client_cancel_only` que compara
  columna por columna (solo status/cancelled_at/cancellation_reason pueden
  cambiar) y respeta `allow_client_cancellation` (0010). El staff no se ve
  afectado. Verificado: intentos de colar precio o marcarse completed → 42501.
- **Login de cliente por teléfono/SMS residual**: `login.tsx` seguía pidiendo
  teléfono cuando todo el flujo pasó a email. Unificado a email OTP. De paso,
  ni login de cliente ni de negocio navegaban tras el éxito (se quedaban en la
  pantalla) y permitían doble clic que consumía el OTP: resuelto con
  `router.replace('/')` tras éxito y estado `submitting` que deshabilita botones.

### Notas operativas
- **Aprobar/cambiar `active` desde el SQL Editor NO funciona** (el trigger
  comprueba `auth.uid()`, null en el editor). La vía correcta es la pantalla
  `/admin`, donde el admin actúa autenticado. Para forzarlo a mano hay que
  desactivar el trigger temporalmente.

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
- **Sin librerías innecesarias** (fechas con `Intl`, gráficos con vistas nativas).
- **Seguridad de datos con revisión doble**: los cambios que tocan RLS, roles o
  acceso a datos se diseñan y revisan con cuidado especial. El SQL se revisa
  antes de aplicarlo a la base de datos, y lo aplica el usuario, no Claude Code.
- **Trocear el trabajo**: cambios acotados y verificables uno a uno, en vez de
  mega-cambios difíciles de revisar. Ha sido clave para cazar bugs pronto.
