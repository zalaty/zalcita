# Zalcita — Estado del proyecto (v3)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v2: gestión de
servicios y de horarios/excepciones del negocio completadas; corregido un bug
de RLS que rompía el acceso anónimo; cola de mejoras y repasos pendientes
detallada en §5.

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

Migraciones aplicadas:
- `0001_init` — esquema + RLS.
- `0002_fix_overlap` — corrige protección de doble reserva.
- `0003_business_busy_slots` — función que expone ocupación sin datos ajenos.
- `0004_business_signup` — alta de negocios + infraestructura de admin.
- `0005_business_members_select` — política SELECT que faltaba en
  `business_members`.
- `0006_fix_platform_admin_rls` — `is_platform_admin()` SECURITY DEFINER, para
  que evaluar políticas de admin no rompa el acceso de roles sin permiso sobre
  `platform_admins` (ver §6).
- `0007_working_hours_schedule_exceptions_write` — políticas de escritura que
  faltaban en `working_hours` y `schedule_exceptions`.

---

## 4. Estado funcional — QUÉ ESTÁ HECHO

### Lado cliente (COMPLETO y probado)
- Ver servicios de un negocio por slug, sin login.
- Calendario de disponibilidad con cálculo de huecos por zona horaria (`Intl`).
- Horas ocupadas agrisadas/"Ocupado", para todos los usuarios, respetando
  privacidad y aislamiento entre negocios.
- Identificación por email con código OTP (gratis, sin SMS).
- Ficha de cliente con consentimiento RGPD separado.
- Creación de cita con protección real contra doble reserva.
- Manejo de sesión inválida/caducada.

### Lado negocio (EN CURSO)
- **Registro autoservicio + dueño** (COMPLETO): alta en dos tiempos, idempotente
  y atómica.
- **Infraestructura de admin** (COMPLETO): `platform_admins`, protección de
  `active`, `is_platform_admin()`.
- **Panel distingue pendiente/aprobado** (COMPLETO): banner y `BusinessContext`.
- **Ajustes › Servicios** (COMPLETO y probado): CRUD con activar/desactivar
  (sin borrado, conserva histórico).
- **Ajustes › Horarios y excepciones** (COMPLETO y probado): horario semanal con
  tramos partidos + excepciones (cerrar día completo / cerrar una franja).
  Validación de solapes. El motor de disponibilidad ya lee de aquí.

---

## 5. QUÉ QUEDA PENDIENTE

### PRIORIDAD 1 — Calendario del negocio (siguiente a construir)
El dueño NO tiene todavía ninguna pantalla donde ver las citas que le entran
(Calendario/Clientes/Resumen son placeholders). Es la pieza más crítica: sin
ella el negocio recibe reservas "a ciegas". Debe mostrar las citas del negocio
(día/semana), y más adelante permitir la reserva manual del dueño.

### PRIORIDAD 2 — Repaso sistemático del RLS del esquema
Ya han aparecido TRES tablas con políticas ausentes heredadas de `0001`
(`business_members`, `working_hours`, `schedule_exceptions`). Conviene revisar
tabla por tabla ANTES de seguir, para detectar agujeros latentes (probables
candidatos: `payments`, `notifications_log`, `cancellation_policies`,
`push_tokens`) en vez de descubrirlos a golpe de bug.

### Cola de mejoras / incidencias detectadas (una a una)
- **Selector de hora** en Horarios: sustituir la entrada de texto "HH:mm" por un
  selector de horas/minutos simple y preciso.
- **Selector de fecha** en Excepciones: sustituir el texto "AAAA-MM-DD" por un
  calendario (mes/año, elegir día).
- **Motivo en las excepciones**: añadir un campo de texto ("Fiesta del pueblo",
  etc.) a `schedule_exceptions` (requiere pequeño cambio de modelo) y mostrarlo
  al cliente cuando vea ese día cerrado, para que entienda el porqué.
- **Entrega de emails (Brevo)**: durante pruebas intensivas algún código no
  llega (límite/entrega). Vigilar; para producción, verificar dominio propio.

### Resto del panel de negocio
- Ajustes › Datos del negocio (nombre, teléfono, email de contacto, dirección).
- Ajustes › Políticas (cancelación/modificación, pago, confirmación manual).
- Ficha de cliente (histórico, total gastado, próxima cita, contacto WhatsApp).
- Resumen financiero.
- Reserva manual del dueño (desde el calendario, con autocompletado de cliente).

### Pantalla de administración
- Donde el admin ve y aprueba negocios pendientes (cambiar `active`), desde la
  app y no por SQL. Usará `is_platform_admin()`.

### Importante para producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web.
  En móvil hará falta `Linking`. **Prioritario antes de lanzar** (la mayoría
  usará móvil).
- **Pasarela de pago (Stripe)**: modelo listo, cobro sin integrar.
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth**: usuario que hace signUp pero no confirma.
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño**: hoy un mismo usuario es ambas cosas; separar a futuro.
- **Punto de entrada claro** en la app: hoy `/` va directo al modo cliente;
  falta una pantalla inicial "reservar" vs "tengo un negocio", y el enlace de
  login del negocio solo se alcanza por `/login`.

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
  `COALESCE(member_id, business_id)`.
- **Bucle infinito de renders** en confirmación: dos `useEffect` competían por
  `step`. Fusionados + `ref`.
- **Sesión fantasma**: la app se fiaba de la sesión cacheada. Resuelto validando
  con `getUser()` contra el servidor.
- **Ocupación solo visible para el propio usuario**: RLS ocultaba citas ajenas
  a la disponibilidad. Resuelto con función `SECURITY DEFINER` que expone solo
  rangos horarios.
- **Estado pegado entre reservas** + **cruce de ficha entre negocios**.
- **RLS ausente (patrón recurrente)**: varias tablas tenían RLS activado pero
  cero políticas (o solo lectura) desde `0001` — `business_members` (0005),
  `working_hours` y `schedule_exceptions` (0007). Cualquier SELECT/escritura
  fallaba en silencio. De ahí la PRIORIDAD 2 (repaso sistemático).
- **`permission denied for table platform_admins` en acceso anónimo**: la
  política de admin en `businesses` (0004) hacía `exists(... platform_admins)`.
  Como el rol anónimo no puede leer esa tabla, Postgres no podía ni evaluar la
  política y reventaba TODA la consulta (aunque la política pública sí concedía
  acceso). Resuelto encapsulando la comprobación en `is_platform_admin()`
  SECURITY DEFINER (0006), que lee la tabla con permisos del owner. Lección:
  una política RLS que referencia una tabla protegida puede romper el acceso de
  otros roles por un efecto colateral no obvio.

### Notas operativas
- **Aprobar un negocio NO funciona desde el SQL Editor**: el trigger comprueba
  `auth.uid()`, que es `null` en el editor. Para probar a mano hay que desactivar
  el trigger temporalmente. La vía correcta es la futura pantalla de admin.

---

## 7. Configuración (Supabase)

- Confirmación de email: activada.
- Login: email + código OTP para clientes y dueños; los dueños además con
  contraseña. Sin SMS.
- Plantillas de email ("Magic Link" y "Confirm signup") editadas para enviar
  código (`{{ .Token }}`).
- SMTP: Brevo (300/día gratis, europeo). Sender de prueba; falta verificar
  dominio propio para producción.

---

## 8. Principios que guían el proyecto

- **RGPD/LOPDGDD desde el diseño**: minimización, consentimiento separado, datos
  en la UE, anonimización, aislamiento entre negocios.
- **Herramientas gratuitas** siempre que se pueda en el MVP.
- **Sin librerías innecesarias** (fechas con `Intl`).
- **Seguridad de datos con revisión doble**: los cambios que tocan RLS, roles o
  acceso a datos se diseñan y revisan con cuidado especial. El SQL se revisa
  antes de aplicarlo a la base de datos.
