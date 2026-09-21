# Zalcita — Estado del proyecto (v8)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v7: **tanda (b) del
rediseño — el CALENDARIO — cerrada entera** (estado por estructura, cromo a
tokens, layout 880/completo, escala de carga monocroma teal y días pasados fuera
de escala), commiteada y subida. Queda del rediseño solo (c) Admin y el modo
oscuro. Añadidos dos cabos sueltos (retoque de `cita.tsx`, conversación de la
tab bar) y tres apuntes de backlog de producto (§9). Nota importante en §6: el
"bug" del día 14 en full resultó NO ser bug — no volver a perseguirlo.

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

Identificadores: app `com.zalcita.app`, cuenta Expo (owner) `zalaty`.

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
los gaps no rompen el cálculo. Un servicio solo cabe en un tramo si entra entero
en él (hoy los tramos NO se funden entre sí — ver §9, cabo latente).

Migraciones aplicadas: `0001_init` … `0012_schedule_exceptions_reason`.
(0002 fix_overlap, 0003 busy_slots, 0004 business_signup, 0005 business_members_select,
0006 fix_platform_admin_rls, 0007 working_hours/exceptions_write, 0008 rls_hardening,
0009 owner_can_overlap, 0010 client_cancels_own, 0011 cancellation_policies_write,
0012 schedule_exceptions_reason.)
**Las tandas (a) y (b) del rediseño NO añadieron migraciones** (cambio puramente
visual/presentación).

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
integrada en "Nueva cita" (`cita.tsx`, no hay pantalla de alta suelta — decisión,
ver §5/§9); Clientes › listado+ficha (historial, stats, notas, WhatsApp); Resumen
financiero (ingresos/previsto/ticket/comparativa + gráficos sin librería).

### Administración de plataforma (COMPLETO)
Pantalla `/admin` solo para admins; aprobar/desactivar negocios desde la app.

---

## 5. REDISEÑO VISUAL — casi terminado

Rediseño en dos fases, DESPUÉS de tener toda la funcionalidad. Dirección visual:
**limpio y profesional pero cercano**, color de marca **teal** (#0f766e), neutros
cálidos. **Modo claro ahora**, sistema PREPARADO para modo oscuro después (tokens
semánticos tipados). Modo oscuro = tanda futura.

### Fase 1 — Sistema de diseño (COMPLETO y aprobado)
- `theme/` con tokens semánticos. `components/ui/` (Button, Card, Badge, Input).
  `components/ui/Screen.tsx` centraliza el safe-area (`useSafeAreaInsets`).
- **Accesibilidad garantizada**: `Badge` con `label` OBLIGATORIA (imposible estado
  solo por color → WCAG 1.4.1 por estructura). Contrastes AA verificados.
- Tonos afinados para daltonismo rojo-verde (David, leve); la salvaguarda real es
  la etiqueta de texto siempre presente.
- Fondo `#f8f8f7` es el más oscuro posible sin romper AA (NO oscurecer más).
- Guía de estilo viva en `/theme-preview`.

### Fase 2 — Aplicar a pantallas
- **CLIENTE (COMPLETO y aprobado)**: cabecera de negocio + Card centrada
  (`contentMaxWidth=680`). "Cancelar cita" secundario; rojo solo en confirmación.
- **NEGOCIO — Ajustes (COMPLETO)**: patrón herramienta, `panelMaxWidth=880`, una
  Card por sección, filas-chip, botones inline ligeros.
- **NEGOCIO — tanda (a): Clientes + Resumen (COMPLETO, v7)**: listado patrón lista;
  ficha en tres Card (WhatsApp mantiene su verde de marca #25D366; próxima cita →
  `info`; estados → `Badge`); resumen con chips 2×2, comparativa → `success`/
  `danger` con signo y %, gráficos en Card con barras teal, estados vacíos en
  ambos gráficos.
- **Títulos de pantalla (COMPLETO)**: cabecera nativa apagada; título DENTRO de la
  columna, **alineado al borde izquierdo, NO centrado** (estándar iOS/Material);
  `Screen.tsx` para el safe-area.
- **NEGOCIO — tanda (b): CALENDARIO (COMPLETO y aprobado, v8)** — cuatro piezas:
  1. **Estado por estructura, no solo color** (Día/Semana): confirmada = bloque
     sólido; pendiente = contorno/hueco; cancelada = tachada; completada = ✓;
     no-show = ✕ (glifos a 14px/700). El par crítico pendiente↔confirmada se
     distingue por SÓLIDO vs CONTORNO (forma), no por matiz. Enfoque de relleno
     mixto (confirmada sólida saturada, no tinte claro) — deliberado. Texto AA
     verificado sobre cada relleno. Vista Día con `Badge` en los 5 estados.
  2. **Mapeo estado→tono UNIFICADO**: módulo compartido
     `lib/appointmentStatusPresentation.ts` (label + tono + color + glifo).
     Eliminadas las CUATRO copias locales (mis-citas, cliente/[id], calendario y
     theme-preview) y el `STATUS_COLORS` literal de `lib/appointments.ts`. Ya no
     hay TODO de "unificar copias" — está hecho.
  3. **Cromo a tokens**: botones, selector Día/Semana/Mes (seleccionado en teal),
     enlaces "Ir a hoy", bordes, resalte de "hoy", errores → tokens del theme.
     Cero hex sueltos en `calendario.tsx`.
  4. **Layout**: título + cabecera en columna de 880 alineada a la izquierda; Día
     a 880 centrado (es lista); Semana/Mes a ancho completo con gutter lateral.
     `cita.tsx` también a 880.
  - **Vista Mes — carga del día en escala MONOCROMA teal** (sustituye al semáforo
    verde/amarillo/rojo, que era el eje de daltonismo de David): `loadFree`
    (#99f6e4) → `loadPartial` (#14b8a6) → `loadFull` (#115e59), la LUMINOSIDAD es
    la carga (saltos de L* amplios). "Cerrado" fuera de escala (`loadClosed`,
    borde discontinuo + "Cerrado"). **Días PASADOS fuera de escala** (`loadPast`
    #d6d3d1, gris neutro): el color de carga solo aplica de HOY en adelante (es
    "cupo para reservar"). `aria-label` veraz (un día pasado NO dice "Libre").
    Leyenda con degradado + muestras de Cerrado y Pasado. "Hoy" = disco blanco +
    anillo oscuro, visible sobre cualquier fondo. Refuerzo no-color: nº de citas
    en la celda siempre.

### Fase 2 — PENDIENTE
- **(c) Admin** (`/admin`) — rediseñar.
- **Modo oscuro** (tanda propia; el sistema ya está preparado con tokens tipados).

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

- **Regresión rediseño (a) — "Volver a clientes" caía en Calendario**: el enlace
  hacía `router.back()` y por el stack sobre tabs caía en la pestaña por defecto.
  Corregido con navegación EXPLÍCITA (`router.replace('/(business)/clientes')`).
  Lección: en "volver", ruta explícita, nunca back genérico, con tabs de por medio.

### NO era bug (importante, para no volver a perseguirlo)
- **El día 14 "en full" con huecos libres NO era un bug.** Tras dos rondas de
  diagnóstico (Claude Code ejecutó la función real y daba "partial"/"libre"), se
  verificó por el `aria-label` de la celda: decía **"14, Libre"** y el fondo era
  `#99f6e4` (loadFree). El cálculo de carga (`computeDayLoad`) y el de huecos
  (`computeAvailableSlots`) estaban CORRECTOS; los tramos no contiguos no rompen
  nada. El error fue de lectura visual (confundir un teal claro con el oscuro en
  una captura reducida). **Lección: cuando el diagnóstico depende de distinguir un
  tono de otro, verificar por `aria-label` ANTES de declarar bug, no después.** La
  escala monocroma + etiqueta de texto hizo su trabajo: la señal no-color desambiguó.

### Notas operativas
Aprobar `active` desde SQL Editor NO funciona (trigger comprueba auth.uid, null
en editor) → la vía es `/admin`. Verificaciones que requieren OTP: Claude Code usa
mailinator o las hace David; usuario-de-test con OTP fijo DESCARTADO.
**Git push lo hace David** desde su terminal (la sesión de Claude Code no tiene
credenciales de GitHub); Claude Code commitea en local y David sube. Commit lleva
`Co-Authored-By` de la sesión; autor principal David.
Cuando Claude Code "ejecute en una copia temporal" para verificar, que diga QUÉ
montó y confirme que no tocó el entorno real.

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
no por matiz (aprendido en la carga del Mes).

---

## 9. COLA DE PENDIENTES (lo que queda, ordenado)

### Rediseño (terminar Fase 2)
1. **(c) Rediseñar Admin** (`/admin`).
2. **Modo oscuro** (tanda propia; sistema ya preparado con tokens tipados).

### Cabos sueltos (pequeños, antes o entre lo anterior)
- **Mejorar el formulario de alta de cliente en `cita.tsx`** (hoy solo nombre +
  teléfono, con consentimiento fijado en código): añadir **email OPCIONAL** (no
  obligatorio — el teléfono es el identificador, unique (business_id, phone); email
  obligatorio daría datos falsos en altas de mostrador) + una **línea VISIBLE que
  recuerde al dueño su obligación RGPD de informar al cliente** (hoy va enterrada
  en una nota interna; al ser alta manual con consent fijado, el recordatorio real
  al negocio es lo correcto). DECISIÓN TOMADA: el alta de cliente vive SOLO en
  "Nueva cita"; NO se añade botón de alta en el listado de Clientes (renunciado —
  casi nunca das de alta sin ponerle cita).
- **Tab bar / navegación inferior**: hoy se ve pobre (iconos genéricos tipo flecha,
  pequeños, sin identidad). Separar **acabado** (iconos por sección + teal en la
  activa + tamaños — es rediseño, se puede hacer) de **reestructuración** (David
  planteó barra-arriba en web / hamburguesa en móvil — es cambio de PATRÓN de
  navegación, toca la estructura de Tabs de Expo Router, de donde han salido varios
  bugs; su propia conversación, con cautela). Pendiente decidir alcance.

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
- **Subida de logo del negocio** (Supabase Storage + campo + RLS de archivos).
- **Cliente MODIFICA (mueve) su cita** desde Mis citas (hoy solo cancela).
- RLS aplazado: gestión de equipo (business_members), UPDATE de cliente sobre su
  ficha (con la pantalla de perfil).

### Backlog de producto (más adelante, valorado)
- **Recordatorios por WhatsApp**: OJO, tiene COSTE. El `wa.me` actual es manual y
  gratis (abre tu WhatsApp para escribir a mano). Los recordatorios AUTOMÁTICOS
  exigen WhatsApp Business API (proveedor + número + plantillas pre-aprobadas por
  Meta) y se paga POR MENSAJE (~céntimos, varía por país; Meta pasó a cobro por
  mensaje en 2025). Recomendación: recordatorio por defecto = **email (Brevo,
  gratis)**; WhatsApp automático = mejora de pago fase 2, probablemente opt-in del
  negocio.
- **Exportar/imprimir a PDF**: agenda del día + resumen mensual. En Expo no es el
  Ctrl+P del navegador: web puede usar impresión del navegador, móvil/nativo
  necesita generar PDF (expo-print). Coste bajo, valor real (hoja del día,
  resumen para gestoría). Buen candidato.
- **Ampliar Resumen** con más métricas (a concretar qué preguntas responde):
  tendencia multi-mes, desglose por cliente / por día de semana, tasa de
  no-shows/cancelaciones, servicio más rentable vs más frecuente…

### Producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web,
  falta `Linking` en móvil. **Prioritario antes de lanzar** (la mayoría usará móvil).
- **Stripe** (cobro online; hoy "paga en el negocio" cubre el caso básico).
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth** (signUp sin confirmar).
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño** (hoy un mismo usuario es ambas cosas; separar).
- **Mantenimiento**: actualizar Expo (57.0.14 → ~57.0.21) como tarea aislada
  (`npx expo install --check`), verificando que compila.

### Fase 2 de producto (más adelante)
Stripe Connect (marketplace); horarios por profesional; excepciones de "horario
especial de apertura". IA (predicción no-shows, sugerencia de próxima cita,
resumen mensual en lenguaje natural, FAQ).

---

## 10. DÓNDE ESTAMOS AHORA MISMO (para retomar)

Rediseño Fase 2 muy avanzado. **Cliente, Ajustes, tanda (a) —Clientes+Resumen— y
tanda (b) —CALENDARIO entero— rediseñados, verificados en vivo por David y
COMMITEADOS/subidos.** El calendario cerró sus cuatro piezas: estado por
estructura, cromo a tokens, layout (880/completo), y carga de la vista Mes en
escala monocroma teal con días pasados fuera de escala.

**Siguiente, en orden sugerido:**
1. **Cabo: `cita.tsx`** — email opcional + línea RGPD visible al dueño en el
   formulario de alta de cliente (alta solo desde "Nueva cita", decidido).
2. **Cabo: tab bar** — conversación para decidir acabado vs reestructuración de la
   navegación inferior (cuidado: reestructurar toca Tabs de Expo Router).
3. **(c) Admin** — rediseñar la última pantalla.
4. **Modo oscuro** — tanda propia, el sistema ya está preparado.

Método intacto: Claude asesora y prepara prompts; Claude Code implementa en local
sin commit; David revisa, verifica en vivo con capturas (tiene login de negocio,
Claude Code no) y sube a GitHub. Rediseño = solo visual, nunca lógica.
