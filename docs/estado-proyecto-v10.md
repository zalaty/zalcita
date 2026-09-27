# Zalcita — Estado del proyecto (v10)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v9: **el rediseño está
TERMINADO por completo.** Cerrados: la **tab bar** con iconos (acabado: Ionicons,
teal en la activa, en negocio + /admin + cliente), el rediseño de
**registro-negocio.tsx** (que se había quedado fuera de la Fase 2), y el **MODO
OSCURO entero** (mecanismo reactivo, paleta oscura completa, toggle en Ajustes, y
remates de hex sueltos). Ya no queda nada de rediseño/estilos/colores. Lo que
queda es una cola de cabos funcionales y de pulido (§9), encabezada por un BUG
funcional real (el selector de horas, §9).

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
| Iconos | @expo/vector-icons (Ionicons) — instalado para las tab bars |
| Build nativo | EAS Build |
| Hosting web | Hostinger (previsto) |

Identificadores: app `com.zalcita.app`, cuenta Expo (owner) `zalaty`, slug
`zalcita`, scheme `zalcita`, name "Zalcita". Iconos/favicon: marca placeholder
"Z" blanca sobre teal `#0f766e`. Splash NO activado.

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
contiguos** (hueco intencionado para descanso). El motor de huecos
(`computeAvailableSlots`, `lib/availability.ts`) trocea cada tramo por separado;
los gaps no rompen el cálculo. **Cabo latente**: un servicio solo cabe si entra
entero en UN tramo — los tramos NO se funden entre sí, así que un servicio más
largo que un tramo no cabe aunque haya tramos contiguos. (Distinto del BUG del
selector de horas de §9, que es de la UI de edición de horarios.)

Migraciones aplicadas: `0001_init` … `0012_schedule_exceptions_reason`.
**Todo el rediseño (tandas a/b, Admin, tab bar, registro-negocio, modo oscuro)
NO añadió migraciones** — cambio puramente visual/presentación.

---

## 4. Estado funcional — NÚCLEO COMPLETO

### Lado cliente (COMPLETO)
Ver servicios por slug sin login; disponibilidad con huecos por zona horaria;
horas ocupadas accesibles; identificación por email OTP; ficha con consentimiento
RGPD; creación de cita con protección de doble reserva; "Mis citas" (ver + cancelar
según política); manejo de sesión inválida.

### Lado negocio (COMPLETO en su núcleo)
Registro autoservicio; infraestructura admin; panel pendiente/aprobado;
Ajustes › Servicios / Horarios y excepciones / Políticas / Datos del negocio;
Calendario › ver+gestionar+crear+mover citas, vistas día/semana/mes; alta de
cliente en "Nueva cita" (nombre + teléfono + email OPCIONAL + línea RGPD visible;
NO hay alta desde el listado de Clientes, decidido); Clientes › listado+ficha;
Resumen financiero (ingresos/previsto/ticket/comparativa + gráficos).

### Administración de plataforma (COMPLETO)
Pantalla `/admin` solo para admins; aprobar/desactivar negocios desde la app.

---

## 5. REDISEÑO VISUAL — TERMINADO (claro + oscuro)

Rediseño en dos fases, DESPUÉS de tener toda la funcionalidad. Dirección visual:
**limpio y profesional pero cercano**, color de marca **teal** (#0f766e), neutros
cálidos. **Claro y oscuro**, con tokens semánticos tipados.

### Fase 1 — Sistema de diseño (COMPLETO)
- `theme/` con tokens semánticos (interfaz `ColorTokens`), con `lightColors` Y
  `darkColors`. `components/ui/` (Button, Card, Badge, Input, Screen).
- **Accesibilidad**: `Badge` con `label` OBLIGATORIA (estado nunca solo por color).
  Contrastes AA verificados en claro Y oscuro. Escalas por LUMINOSIDAD, no matiz.
- Guía de estilo viva en `/theme-preview`, con selector Sistema/Claro/Oscuro.

### Fase 2 — Pantallas (TODAS HECHAS, claro y oscuro)
- **CLIENTE**: cabecera de negocio + Card centrada (contentMaxWidth 680).
- **NEGOCIO — Ajustes**: patrón herramienta (panelMaxWidth 880), una Card por
  sección, filas-chip. Incluye el **toggle de tema** (Sistema/Claro/Oscuro).
- **NEGOCIO — Clientes + Resumen**: listado patrón lista; ficha en tres Card
  (WhatsApp verde de marca #25D366; estados → Badge); resumen con chips + gráficos
  de barras teal.
- **Títulos de pantalla**: título en la columna, alineado a la izquierda (no
  centrado); `Screen.tsx` para el safe-area.
- **NEGOCIO — Calendario**: estado por estructura (sólido/contorno/tachado/✓/✕),
  mapeo unificado en `lib/appointmentStatusPresentation.ts`, cromo a tokens,
  layout (Día 880 / Semana-Mes completo), carga del Mes en escala monocroma teal.
- **NEGOCIO — Admin**: patrón herramienta, badges de estado, tira de navegación
  propia (fuera de `(business)`, guarda intacta).
- **registro-negocio.tsx** (formulario + confirmación por código): rediseñado al
  patrón del sistema (se había quedado fuera de la Fase 2).
- **cita.tsx**: rediseñada del todo (Inputs y Button del sistema, aviso ámbar del
  theme) — quedaba a medias con hex sueltos; se cerró al tokenizar para oscuro.
- **Tab bar (acabado)**: iconos Ionicons por sección (calendar/people/bar-chart/
  settings; reservar/list/person en cliente), activa en teal, en negocio + /admin
  + cliente. `@expo/vector-icons` instalado. (La **reestructuración** —barra
  arriba web / hamburguesa móvil— se DESCARTÓ: la tab bar inferior es mejor UX.)
- **Iconos/favicon**: marca placeholder "Z" sobre teal.

### MODO OSCURO (COMPLETO)
- **Mecanismo reactivo**: `context/ThemeContext.tsx` con `useTheme()` (theme
  resuelto) y `useThemePreference()` (preferencia `system`|`light`|`dark`,
  persistida en AsyncStorage clave `@zalcita/theme_pref`, `system` resuelve con
  `useColorScheme`). Los 26 consumidores migrados del import estático a
  `useTheme()`. `theme/index.ts` sigue exportando el estático (compatibilidad).
- **Toggle** Sistema/Claro/Oscuro en el menú de Ajustes (SOLO negocio; el cliente
  sigue al sistema, sin selector — decidido). Cambia toda la app en caliente y
  persiste.
- **Paleta oscura** (`darkColors`): gris CÁLIDO muy oscuro (background #171412,
  surface #282320 más clara para jerarquía sin sombras). Teal aclarado
  (primary #14b8a6); `textOnPrimary` pasa a oscuro y sirve para primary y danger.
  Superficies de tinte (xSurface) REHECHAS como tintes oscuros con texto claro
  (no invertidas). AA verificado en toda la tabla. success/danger separados por
  luminosidad (daltonismo).
- **Escala de carga del Mes — INVERTIDA en oscuro**: en claro "más oscuro = más
  lleno"; en oscuro "más brillante = más lleno" (loadFree apagado → loadFull
  #2dd4bf brillante), porque un lleno-oscuro se fundiría con el fondo oscuro. La
  señal sigue siendo la luminosidad. Tokens nuevos `freeSlotBorder`/`freeSlotText`
  (hueco libre de Semana) con versión clara y oscura.
- **Remates de hex sueltos**: cita.tsx (tokenizada del todo), tab bar de negocio
  (le faltaba `tabBarStyle`, heredaba el fondo claro por defecto de react-
  navigation → surface/border), banner "pendiente" (→ familia warning del theme).

---

## 6. Bugs importantes resueltos (memoria)

Doble reserva sin member_id (0002→0009); bucle de renders en confirmación; sesión
fantasma (getUser); ocupación solo visible al propio usuario (0003); estado pegado
/ cruce de ficha entre negocios; RLS ausente recurrente (0005/0007/0008); permission
denied platform_admins en anónimo (0006, is_platform_admin SECURITY DEFINER); DELETE
en cascada de negocio (0008); dueño-puede-solapar / cliente-no (0009); crash+fecha
pegada en cita.tsx (Tabs href:null no se desmonta); cliente cancela solo lo suyo
(0010); login cliente residual por teléfono → email; login no navegaba tras éxito;
refreshBusiness desmontaba el panel.

- **Regresión rediseño — "Volver a clientes" caía en Calendario** (router.back sobre
  tabs) → navegación EXPLÍCITA. **Doble-toque de Calendario desde la tira de /admin**
  (router.push a la pestaña por defecto) → router.replace. Lección: en saltos entre
  partes de la app con tabs, ruta explícita + replace, nunca back/push genérico.

### NO era bug (para no volver a perseguirlo)
- **El día 14 "en full" con huecos libres NO era bug.** Verificado por `aria-label`
  ("14, Libre"). El cálculo estaba bien; fue lectura visual (confundir teal claro con
  oscuro en captura). Lección: si el diagnóstico depende de distinguir un tono,
  verificar por `aria-label` ANTES de declarar bug.

### Notas operativas
Aprobar `active` desde SQL Editor NO funciona (auth.uid null en el editor) → vía
`/admin`. OTP en pruebas: Claude Code usa mailinator o lo hace David; usuario-test
con OTP fijo DESCARTADO. **Git push lo hace David** (la sesión de Claude Code no
tiene credenciales GitHub); Claude Code commitea en local, David sube; commit con
`Co-Authored-By`, autor principal David. Si Claude Code "ejecuta en copia temporal",
que diga QUÉ montó y que no tocó el entorno real. **Herramientas de un solo uso
(sharp, etc.): en carpeta APARTE fuera del proyecto** (instalarlas dentro descuadra
node_modules del lockfile en silencio; se revierte con `npm ci`). En cambio, una
DEPENDENCIA de runtime (p. ej. @expo/vector-icons) SÍ va dentro, con `npx expo
install` (fija versión compatible con el SDK).

**Aprendizajes del modo oscuro** (por si se rehace o se toca la paleta): en oscuro,
la superficie (Card) es MÁS clara que el fondo (jerarquía sin sombras); el teal de
marca se ACLARA; las superficies de tinte se REHACEN (no se invierten); una ESCALA
(como la carga del Mes) se INVIERTE de sentido (más brillante = más lleno); el color
de la tab bar necesita `tabBarStyle` explícito o react-navigation hereda un fondo
claro ajeno al theme. **Pendiente de confirmar visualmente**: que la tab bar cambie
de color EN CALIENTE al usar el toggle (razonado como reactivo, no visto en vivo).

---

## 7. Configuración (Supabase)

Confirmación de email activada; login email+OTP (clientes y dueños; dueños además
contraseña); plantillas editadas para enviar código `{{ .Token }}`; SMTP Brevo
(300/día, 30/hora); `detectSessionInUrl: true` (inofensivo, el flujo usa código).

---

## 8. Principios del proyecto

RGPD/LOPDGDD desde el diseño; herramientas gratuitas en el MVP; sin librerías
innecesarias (fechas con Intl, gráficos y calendarios con vistas nativas — iconos
sí con @expo/vector-icons); seguridad de datos con revisión doble (SQL revisado y
aplicado por David, no Claude Code); trocear el trabajo (cambios acotados y
verificables uno a uno — clave en el modo oscuro: 7+ tandas de migración, cada una
verificada en claro antes de seguir); **accesibilidad**: nunca solo color (David
tiene daltonismo leve), etiqueta de texto siempre, escalas por luminosidad.

---

## 9. COLA DE PENDIENTES (lo que queda, ordenado)

El rediseño está terminado. Lo que sigue NO es rediseño.

### BUG funcional (PRIORITARIO — antes de uso real)
- **Selector de horas en Ajustes › Horarios topa en las 10:00**: al crear/editar un
  tramo, la fila de horas solo ofrece 00–10, así que NO se pueden definir tramos de
  TARDE (13:00, 17:00, 19:00…). Bloquea el uso real (la mayoría de negocios trabajan
  por la tarde). Es lógica del componente TimeSelector en horarios.tsx, anterior al
  modo oscuro. PRIMERO de la cola.

### Verificación pendiente (rápida)
- **Tab bar en oscuro cambia en caliente**: confirmar que al pulsar el toggle
  Claro↔Oscuro la barra inferior cambia de color al instante (no se queda con el
  color anterior hasta recargar). Si se queda, arreglo fácil (key/remount).
- **Cliente en oscuro**: David aún no lo ha visto en oscuro (no quiso forzar sin
  toggle). El (client)/_layout ya usa tokens, debería ir bien; confirmar al verlo.

### Pulido visual (menor)
- **Botón "confirmar cancelación" en el calendario del negocio**: hoy es outline;
  unificarlo a danger RELLENO como en el lado cliente (misma acción, dos estilos).
- **Ficha de cliente en móvil estrecho (~375px)**: 3 cajas de stat apretadas,
  "Citas completadas" parte en dos líneas → apilar (1 col o 2+1).
- El "desierto" bajo el resumen en confirmacion.tsx.
- (Opcional) Botón WhatsApp full-width en la ficha es muy dominante.

### Funcional pendiente
- **Pantalla de Perfil del cliente** (hoy vacía, solo placeholder): gestión de
  datos, toggle consent_marketing, borrado/anonimización (activa el último RLS
  aplazado: UPDATE/anonimización del cliente sobre su ficha). Es funcional NUEVO
  con lógica RGPD, no rediseño.
- **Bug del slug / punto de entrada**: al ir a "Reservar" desde Mis citas cae en
  `/` sin slug. Falta pantalla inicial "reservar" vs "tengo un negocio".
- **Subida de logo del negocio** (Supabase Storage + campo + RLS de archivos):
  sustituir el círculo con la inicial por logo real.
- **Cliente MODIFICA (mueve) su cita** desde Mis citas (hoy solo cancela).
- **Activar splash** (splash-icon.png listo; falta plugin expo-splash-screen).
- RLS aplazado: gestión de equipo (business_members), UPDATE de cliente sobre su
  ficha (con la pantalla de perfil).

### Backlog de producto (más adelante, valorado)
- **Recordatorios por WhatsApp**: tiene COSTE (WhatsApp Business API, ~céntimos/
  mensaje, plantillas Meta). Recomendación: recordatorio por defecto = email (Brevo,
  gratis); WhatsApp automático = mejora de pago fase 2, opt-in.
- **Exportar/imprimir a PDF**: agenda del día + resumen mensual (expo-print en
  nativo). Coste bajo, valor real. Buen candidato.
- **Ampliar Resumen** con más métricas (a concretar): tendencia multi-mes, desglose
  por cliente / día de semana, tasa de no-shows/cancelaciones…

### Producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web,
  falta `Linking` en móvil. Prioritario antes de lanzar (la mayoría usará móvil).
- **Stripe** (cobro online; hoy "paga en el negocio" cubre lo básico).
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth** (signUp sin confirmar).
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño** (hoy un mismo usuario es ambas cosas; separar — el montaje
  de /admin fuera de (business) ya deja esto preparado).
- **Icono NATIVO**: revisar en el primer build de EAS que el icono de la app (no
  solo el favicon web) es el de Zalcita. **Modo oscuro en nativo**: al hacer build,
  revisar que el toggle y la paleta oscura se comportan igual en iOS/Android.
- **Mantenimiento**: actualizar Expo (57.0.14 → ~57.0.21) como tarea aislada.

### Fase 2 de producto (más adelante)
Stripe Connect (marketplace); horarios por profesional; excepciones de "horario
especial de apertura"; fundir tramos contiguos para servicios largos (§3). IA
(predicción no-shows, sugerencia de próxima cita, resumen mensual en lenguaje
natural, FAQ).

---

## 10. DÓNDE ESTAMOS AHORA MISMO (para retomar)

**El rediseño está TERMINADO** — todas las pantallas (cliente, negocio, ajustes,
calendario, admin, registro), las tres tab bars con iconos, el logo, y el MODO
OSCURO completo con su toggle en Ajustes. Todo verificado en vivo por David y
commiteado/subido. Ni la lógica ni las migraciones se tocaron en todo el rediseño.

**Siguiente, en orden sugerido (ya NO es rediseño):**
1. **BUG del selector de horas** (topa en 10:00, no permite tramos de tarde) —
   prioritario, bloquea uso real.
2. **Verificaciones rápidas**: tab bar en oscuro en caliente; cliente en oscuro.
3. **Pulido visual** (botón cancelar del calendario, cajas de stat en móvil).
4. **Funcional pendiente**: Perfil del cliente (con RGPD), bug del slug, etc.
5. Camino a producción: deep linking móvil, Stripe, push, dominio Brevo…

Método intacto: Claude asesora y prepara prompts (los pasa en bloque de código,
y hace las preguntas ANTES del bloque); Claude Code implementa en local sin commit;
David revisa, verifica en vivo con capturas (tiene login de negocio, Claude Code
no) y sube a GitHub.
