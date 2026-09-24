# Zalcita — Estado del proyecto (v9)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v8: **todas las
pantallas del panel están rediseñadas** — cerrados el cabo de `cita.tsx` (email
opcional + aviso RGPD en el alta de cliente), el rediseño de **Admin** (`/admin`)
con su tira de navegación propia, y el reemplazo de los **iconos/favicon**
heredados de otra app (BucleBot) por la marca placeholder de Zalcita. Del
rediseño global quedan solo dos piezas: la **tab bar** (decisión de alcance
pendiente, §9) y el **modo oscuro**. Ver §5 y §10.

---

## 1. Visión del producto

Plataforma multi-negocio (multi-tenant) donde:
- **Clientes** reservan citas sin fricción (ven disponibilidad sin registro, se
  identifican solo al confirmar) y gestionan (cancelan) sus citas.
- **Negocios (dueños)** gestionan agenda, clientes, servicios, horarios, políticas
  y ven un resumen de ingresos.
- **Administrador de plataforma** aprueba los negocios antes de que operen.

Modelo de alta: **autoservicio con aprobación** (`active=false` hasta que el
admin lo aprueba). El núcleo funciona de punta a punta.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Expo (React Native) + Expo Router |
| Lenguaje | TypeScript (estricto) |
| Backend | Supabase (Postgres + Auth + RLS) — región Frankfurt (EU) |
| Pagos | Stripe (previsto, no implementado) |
| Email | Brevo (SMTP, europeo) vía Supabase Auth |
| Notificaciones | Expo Push (previsto) + WhatsApp `wa.me` (manual) |
| Build nativo | EAS Build |
| Hosting web | Hostinger (previsto) |

Identificadores: app `com.zalcita.app`, cuenta Expo (owner) `zalaty`, slug
`zalcita`, scheme `zalcita`, name "Zalcita". **Iconos/favicon**: marca
placeholder "Z" blanca sobre teal `#0f766e` (ver §5). Splash NO activado.

---

## 3. Modelo de datos (implementado)

Tablas: `businesses`, `business_members`, `services`, `clients`,
`working_hours`, `schedule_exceptions`, `cancellation_policies`,
`appointments`, `payments`, `notifications_log`, `push_tokens`,
`platform_admins`.

Decisiones clave: multi-tenant por RLS; `clients` por negocio (RGPD);
`price_at_booking` copiado; anonimización en vez de borrado;
`platform_admins` (la fila ES el permiso, vía `is_platform_admin()`);
`businesses.active` protegido por trigger; protección de solape por trigger
`check_appointment_overlap` (distingue quién escribe: cliente nunca solapa,
dueño sí con aviso).

Estados de una cita (`appointments.status`): **pendiente, confirmada, completada,
no-show, cancelada** (5). Una cita creada por el dueño desde el panel nace
**pendiente** (él la confirma después); no hay transición "volver a pendiente".

Horario del negocio (`working_hours`): tramos por día, **NO necesariamente
contiguos** (p. ej. lunes 10:00–10:30, 10:30–11:00, 11:30–12:00, 12:00–12:30, con
un hueco intencionado 11:00–11:30 para descanso). El motor de huecos
(`computeAvailableSlots`, `lib/availability.ts`) trocea cada tramo por separado;
los gaps no rompen el cálculo. **Cabo latente**: un servicio solo cabe si entra
entero en UN tramo — los tramos NO se funden entre sí, así que un servicio más
largo que un tramo (p. ej. 45–60 min con tramos de 30) no cabe aunque haya tramos
contiguos. Aparecerá el día que haya servicios largos; decidir entonces si la
disponibilidad debe fundir tramos contiguos.

Migraciones aplicadas: `0001_init` … `0012_schedule_exceptions_reason`.
(0002 fix_overlap, 0003 busy_slots, 0004 business_signup, 0005 business_members_select,
0006 fix_platform_admin_rls, 0007 working_hours/exceptions_write, 0008 rls_hardening,
0009 owner_can_overlap, 0010 client_cancels_own, 0011 cancellation_policies_write,
0012 schedule_exceptions_reason.)
**Todo el rediseño (tandas a, b, Admin, cabos) NO añadió migraciones** — el email
opcional del alta usa la columna `clients.email` que ya existía en 0001.

---

## 4. Estado funcional — NÚCLEO COMPLETO

### Lado cliente (COMPLETO)
Ver servicios por slug sin login; disponibilidad con huecos por zona horaria;
horas ocupadas accesibles (borde+texto); identificación por email OTP (gratis);
ficha con consentimiento RGPD; creación de cita con protección de doble reserva;
"Mis citas" (ver citas de todos sus negocios + cancelar según política del
negocio); manejo de sesión inválida.

### Lado negocio (COMPLETO en su núcleo)
Registro autoservicio; infraestructura admin; panel pendiente/aprobado;
Ajustes › Servicios (CRUD activar/desactivar); Ajustes › Horarios y excepciones
(con motivo, migración 0012); Ajustes › Políticas (cancelación/pago/confirmación
manual, upsert); Ajustes › Datos del negocio; Calendario › ver+gestionar+crear+
mover citas; Calendario › **vistas día/semana/mes**; alta de cliente nuevo
integrada en "Nueva cita" (`cita.tsx`) — **nombre + teléfono + email OPCIONAL**
(email vacío → null; si viene, se normaliza a minúsculas), con **línea RGPD
visible** que recuerda al dueño su obligación de informar (consentimiento como
declaración del negocio, sin casilla). NO hay alta de cliente desde el listado de
Clientes (decisión: casi nunca das de alta sin ponerle cita). Clientes › listado+
ficha (historial, stats, notas, WhatsApp); Resumen financiero (ingresos/previsto/
ticket/comparativa + gráficos sin librería).

### Administración de plataforma (COMPLETO)
Pantalla `/admin` solo para admins; aprobar/desactivar negocios desde la app.

---

## 5. REDISEÑO VISUAL — todas las pantallas hechas; quedan tab bar y modo oscuro

Rediseño en dos fases, DESPUÉS de tener toda la funcionalidad. Dirección visual:
**limpio y profesional pero cercano**, color de marca **teal** (#0f766e), neutros
cálidos. **Modo claro ahora**, sistema PREPARADO para modo oscuro después (tokens
semánticos tipados).

### Fase 1 — Sistema de diseño (COMPLETO y aprobado)
- `theme/` con tokens semánticos. `components/ui/` (Button, Card, Badge, Input).
  `components/ui/Screen.tsx` centraliza el safe-area (`useSafeAreaInsets`).
- **Accesibilidad garantizada**: `Badge` con `label` OBLIGATORIA (imposible estado
  solo por color → WCAG 1.4.1 por estructura). Contrastes AA verificados.
- Tonos afinados para daltonismo rojo-verde (David, leve); la salvaguarda real es
  la etiqueta de texto siempre presente. Escalas por LUMINOSIDAD, no por matiz.
- Fondo `#f8f8f7` es el más oscuro posible sin romper AA (NO oscurecer más).
- Guía de estilo viva en `/theme-preview`.

### Fase 2 — Aplicar a pantallas (TODAS HECHAS)
- **CLIENTE (COMPLETO)**: cabecera de negocio + Card centrada (`contentMaxWidth=680`).
- **NEGOCIO — Ajustes (COMPLETO)**: patrón herramienta, `panelMaxWidth=880`, una
  Card por sección, filas-chip, botones inline ligeros.
- **NEGOCIO — tanda (a): Clientes + Resumen (COMPLETO)**: listado patrón lista;
  ficha en tres Card (WhatsApp verde de marca #25D366; próxima cita → `info`;
  estados → `Badge`); resumen con chips 2×2, comparativa → `success`/`danger` con
  signo y %, gráficos en Card con barras teal, estados vacíos en ambos gráficos.
- **Títulos de pantalla (COMPLETO)**: cabecera nativa apagada; título DENTRO de la
  columna, **alineado al borde izquierdo, NO centrado** (estándar iOS/Material);
  `Screen.tsx` para el safe-area.
- **NEGOCIO — tanda (b): CALENDARIO (COMPLETO)** — cuatro piezas:
  1. **Estado por estructura, no solo color** (Día/Semana): confirmada sólida;
     pendiente contorno; cancelada tachada; completada ✓; no-show ✕ (glifos
     14px/700). Par crítico pendiente↔confirmada por SÓLIDO vs CONTORNO. Vista Día
     con `Badge` en los 5 estados.
  2. **Mapeo estado→tono UNIFICADO**: `lib/appointmentStatusPresentation.ts`
     (label + tono + color + glifo). Eliminadas las 4 copias locales y el
     `STATUS_COLORS` literal.
  3. **Cromo a tokens**: cero hex sueltos en `calendario.tsx`.
  4. **Layout**: cabecera en columna de 880 alineada a la izquierda; Día a 880
     centrado; Semana/Mes a ancho completo con gutter. `cita.tsx` a 880.
  - **Vista Mes — carga en escala MONOCROMA teal**: `loadFree` (#99f6e4) →
    `loadPartial` (#14b8a6) → `loadFull` (#115e59), luminosidad = carga. "Cerrado"
    fuera de escala (borde discontinuo + "Cerrado"). **Días PASADOS fuera de
    escala** (`loadPast` #d6d3d1 gris) con `aria-label` veraz. "Hoy" = disco
    blanco + anillo oscuro. Leyenda con degradado + Cerrado + Pasado.
- **NEGOCIO — Admin (COMPLETO)**: `/admin` sigue FUERA de `(business)` (guarda
  `session + is_platform_admin` intacta; el acceso NO exige tener negocio propio).
  Patrón herramienta: título en columna, 880, filas-chip, Badge de estado
  (Pendiente=warning / Aprobado=success), "Aprobar"→primary, "Desactivar"→outline+
  danger, confirmación intacta. **Tab bar recuperada como TIRA PROPIA** (no el
  `<Tabs>` real, para no tocar el acceso): cuatro items que navegan con
  `router.replace('/(business)/...')` — el `replace` además arregló el doble-toque
  de Calendario (era la pestaña por defecto y con `push` no cuajaba a la primera).
  **Pendiente**: esta tira es una segunda barra que hay que alinear con la tab bar
  real cuando se rediseñe (ver §9).
- **Iconos/favicon (COMPLETO)**: reemplazados los heredados de la plantilla
  (contenido visual de BucleBot, aunque los nombres eran genéricos) por marca
  placeholder "Z" blanca sobre teal `#0f766e`, generada como forma VECTORIAL (no
  texto, sin depender de fuentes). Los 6 PNG de `assets/` regenerados; `icon.png`
  en RGB sin alfa (requisito iOS); `android.adaptiveIcon.backgroundColor` → teal.
  `splash-icon.png` generado y coherente pero **splash NO activado** (sin plugin
  `expo-splash-screen`) — mejora aparte. Favicon web verificado; icono NATIVO solo
  se verá en un build de EAS. Sustituir por logo real = cambiar estos mismos
  archivos.

### Fase 2 — PENDIENTE (lo único que queda del rediseño)
- **Tab bar** — decisión de alcance pendiente (§9): acabado vs reestructuración.
- **Modo oscuro** — tanda propia; el sistema ya está preparado con tokens tipados.

---

## 6. Bugs importantes resueltos (memoria)

Doble reserva sin member_id (0002→0009); bucle de renders en confirmación;
sesión fantasma (getUser); ocupación solo visible al propio usuario (0003);
estado pegado entre reservas / cruce de ficha entre negocios; RLS ausente
recurrente (business_members 0005, working_hours/exceptions 0007, payments/
notifications 0008); permission denied platform_admins en anónimo (0006,
is_platform_admin SECURITY DEFINER); DELETE en cascada de negocio (0008);
dueño-puede-solapar / cliente-no (0009); crash+fecha pegada en cita.tsx
(Tabs href:null no se desmonta); cliente cancela solo lo suyo (0010); login
cliente residual por teléfono → email; login no navegaba tras éxito + doble
clic OTP; refreshBusiness desmontaba el panel al guardar.

- **Regresión rediseño (a) — "Volver a clientes" caía en Calendario**: `router.back()`
  sobre stack de tabs caía en la pestaña por defecto. Corregido con navegación
  EXPLÍCITA. Lección: en "volver", ruta explícita, nunca back genérico con tabs.
- **Doble-toque de Calendario desde la tira de /admin**: la tira navegaba con
  `router.push`; como Calendario es la pestaña por defecto de `(business)`, el
  primer toque no cuajaba (misma familia que el bug del "volver"). Resuelto pasando
  los items de la tira a `router.replace`. NO se tocó la estructura de `<Tabs>`.

### NO era bug (importante, para no volver a perseguirlo)
- **El día 14 "en full" con huecos libres NO era un bug.** Se verificó por el
  `aria-label` de la celda ("14, Libre") y el fondo (`#99f6e4` loadFree). El
  cálculo estaba correcto; los tramos no contiguos no rompen nada. El error fue de
  lectura visual (confundir teal claro con oscuro en una captura). **Lección:
  cuando el diagnóstico depende de distinguir un tono de otro, verificar por
  `aria-label` ANTES de declarar bug.**

### Notas operativas
Aprobar `active` desde SQL Editor NO funciona (trigger comprueba auth.uid, null
en editor) → la vía es `/admin`. Verificaciones que requieren OTP: Claude Code usa
mailinator o las hace David; usuario-de-test con OTP fijo DESCARTADO.
**Git push lo hace David** desde su terminal (la sesión de Claude Code no tiene
credenciales de GitHub); Claude Code commitea en local y David sube. Commit lleva
`Co-Authored-By` de la sesión; autor principal David.
Cuando Claude Code "ejecute en una copia temporal" para verificar, que diga QUÉ
montó y confirme que no tocó el entorno real.
**Herramientas de un solo uso (sharp, etc.): instalarlas en carpeta APARTE fuera
del proyecto, nunca en el proyecto.** Instalar sharp en el proyecto reescribió
parte de `node_modules` sin tocar `package.json`/`package-lock.json` (git no
mostró diff, pero el árbol quedó descuadrado del lockfile) — contaminación
silenciosa. Se revirtió con `npm ci`.

---

## 7. Configuración (Supabase)

Confirmación de email activada; login email+OTP (clientes y dueños; dueños además
contraseña); plantillas "Magic Link" y "Confirm signup" editadas para enviar
código `{{ .Token }}`; SMTP Brevo (300/día, 30/hora — se nota en pruebas);
`detectSessionInUrl: true` (inofensivo, el flujo usa código).

---

## 8. Principios del proyecto

RGPD/LOPDGDD desde el diseño; herramientas gratuitas en el MVP; sin librerías
innecesarias (fechas con Intl, gráficos y calendarios con vistas nativas);
seguridad de datos con revisión doble (el SQL se revisa antes de aplicarlo y lo
aplica David, no Claude Code); trocear el trabajo (cambios acotados y verificables
uno a uno); **accesibilidad**: nunca depender solo del color (David tiene
daltonismo leve), etiqueta de texto siempre — y comunicar ESCALAS por luminosidad,
no por matiz.

---

## 9. COLA DE PENDIENTES (lo que queda, ordenado)

### Rediseño (terminar Fase 2 — solo quedan estas dos)
1. **Tab bar / navegación inferior** — hoy se ve pobre (iconos genéricos tipo
   flecha, pequeños, sin identidad). DECISIÓN DE ALCANCE PENDIENTE, separar:
   - **Acabado** (iconos por sección + teal en la activa + tamaños) → es rediseño,
     se puede hacer.
   - **Reestructuración** (David planteó barra-arriba en web / hamburguesa en
     móvil) → cambio de PATRÓN de navegación, toca la estructura de Tabs de Expo
     Router, de donde han salido varios bugs; su propia conversación, con cautela.
   - Al tocarla, **alinear también la tira gemela de `/admin`** (hoy es una barra
     aparte que imita a la tab bar).
2. **Modo oscuro** — tanda propia; sistema ya preparado con tokens tipados.

### Pulido visual anotado (menor)
- **Ficha de cliente en móvil estrecho (~375px)**: 3 cajas de stat apretadas,
  "Citas completadas" parte en dos líneas → apilar (1 col o 2+1) en móvil.
- El "desierto" bajo el resumen en confirmacion.tsx.
- En Horarios, "Editar/Quitar" muy pegados y "Quitar" en rojo llama mucho.
- (Opcional) Botón WhatsApp full-width en la ficha es muy dominante.

### Funcional pendiente
- **Pantalla de Perfil del cliente** (hoy vacía): gestión de datos, toggle
  consent_marketing, borrado/anonimización (activa el último RLS aplazado).
- **Bug del slug / punto de entrada**: al ir a "Reservar" desde Mis citas cae en
  `/` sin slug. Falta pantalla inicial "reservar" vs "tengo un negocio".
- **Subida de logo del negocio** (Supabase Storage + campo + RLS de archivos):
  hoy la identidad del negocio en la app cliente es un círculo con la inicial;
  hay una nota en `disponibilidad.tsx` ("Sustituir por <Image logo_url>").
- **Cliente MODIFICA (mueve) su cita** desde Mis citas (hoy solo cancela).
- **Activar splash** (`splash-icon.png` ya está listo; falta plugin
  expo-splash-screen / bloque splash en app.json).
- RLS aplazado: gestión de equipo (business_members), UPDATE de cliente sobre su
  ficha (con la pantalla de perfil).

### Backlog de producto (más adelante, valorado)
- **Recordatorios por WhatsApp**: tiene COSTE. El `wa.me` actual es manual y
  gratis. Los AUTOMÁTICOS exigen WhatsApp Business API (proveedor + número +
  plantillas pre-aprobadas por Meta) y se paga POR MENSAJE (~céntimos; Meta pasó a
  cobro por mensaje en 2025). Recomendación: recordatorio por defecto = **email
  (Brevo, gratis)**; WhatsApp automático = mejora de pago fase 2, opt-in del negocio.
- **Exportar/imprimir a PDF**: agenda del día + resumen mensual. En Expo, web usa
  impresión del navegador; móvil/nativo necesita generar PDF (expo-print). Coste
  bajo, valor real (hoja del día, resumen para gestoría). Buen candidato.
- **Ampliar Resumen** con más métricas (a concretar): tendencia multi-mes,
  desglose por cliente / por día de semana, tasa de no-shows/cancelaciones,
  servicio más rentable vs más frecuente…

### Producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web,
  falta `Linking` en móvil. **Prioritario antes de lanzar** (la mayoría usará móvil).
- **Stripe** (cobro online; hoy "paga en el negocio" cubre el caso básico).
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth** (signUp sin confirmar).
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño** (hoy un mismo usuario es ambas cosas; separar). El
  montaje de `/admin` fuera de `(business)` ya deja esto preparado.
- **Icono NATIVO**: revisar en el primer build de EAS que el icono de la app (no
  solo el favicon web) es el de Zalcita.
- **Mantenimiento**: actualizar Expo (57.0.14 → ~57.0.21) como tarea aislada
  (`npx expo install --check`), verificando que compila.

### Fase 2 de producto (más adelante)
Stripe Connect (marketplace); horarios por profesional; excepciones de "horario
especial de apertura"; fundir tramos contiguos para servicios largos (ver §3).
IA (predicción no-shows, sugerencia de próxima cita, resumen mensual en lenguaje
natural, FAQ).

---

## 10. DÓNDE ESTAMOS AHORA MISMO (para retomar)

Rediseño Fase 2 casi terminado. **TODAS las pantallas rediseñadas, verificadas en
vivo por David y COMMITEADAS/subidas**: Cliente, Ajustes, tanda (a) Clientes+
Resumen, tanda (b) Calendario entero, cabo de `cita.tsx` (email opcional + RGPD),
Admin, e iconos/favicon (marca placeholder Z sobre teal).

**Quedan solo dos piezas del rediseño:**
1. **Tab bar** — CONVERSACIÓN de alcance pendiente antes de tocar: acabado
   (iconos + teal en activa, es rediseño) vs reestructuración (barra-arriba web /
   hamburguesa móvil, toca Tabs de Expo Router, riesgo). Arrastra alinear la tira
   gemela de `/admin`. Es la pieza con más miga que queda.
2. **Modo oscuro** — tanda propia, el sistema ya está preparado con tokens.

Método intacto: Claude asesora y prepara prompts; Claude Code implementa en local
sin commit; David revisa, verifica en vivo con capturas (tiene login de negocio,
Claude Code no) y sube a GitHub. Rediseño = solo visual, nunca lógica.
