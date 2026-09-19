# Zalcita — Estado del proyecto (v7)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v6: **tanda (a) del
rediseño de negocio cerrada** (Clientes listado + ficha, y Resumen financiero,
rediseñados y verificados en vivo) y **fix transversal de títulos de pantalla**
(cabecera nativa fuera, título dentro de la columna de contenido, con
`components/ui/Screen.tsx` centralizando el safe-area). Siguiente: tanda (b), el
Calendario — que NO es "aplicar tokens" sino que arrastra una decisión de diseño
de accesibilidad pendiente (estado por color vs. daltonismo). Ver §5 y §10.

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
no-show, cancelada** (5). Relevante para el rediseño del calendario (§5/§10).

Migraciones aplicadas: `0001_init` … `0012_schedule_exceptions_reason`.
(0002 fix_overlap, 0003 busy_slots, 0004 business_signup, 0005 business_members_select,
0006 fix_platform_admin_rls, 0007 working_hours/exceptions_write, 0008 rls_hardening,
0009 owner_can_overlap, 0010 client_cancels_own, 0011 cancellation_policies_write,
0012 schedule_exceptions_reason.)
**La tanda (a) del rediseño no añadió migraciones** (cambio puramente visual).

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
mover citas; Calendario › **vistas día/semana/mes** (semana con agenda horaria y
huecos, mes panorámico con carga por día + primeras citas); Clientes › listado+
ficha (historial, stats, notas, WhatsApp); Resumen financiero (ingresos/previsto/
ticket/comparativa + gráficos sin librería).

### Administración de plataforma (COMPLETO)
Pantalla `/admin` solo para admins; aprobar/desactivar negocios desde la app.

---

## 5. REDISEÑO VISUAL — EN CURSO (aquí es donde estamos)

Rediseño en dos fases, DESPUÉS de tener toda la funcionalidad. Dirección visual:
**limpio y profesional pero cercano**, color de marca **teal** (#0f766e), neutros
cálidos. **Modo claro ahora**, sistema PREPARADO para modo oscuro después (tokens
semánticos tipados). Modo oscuro = tanda futura.

### Fase 1 — Sistema de diseño (COMPLETO y aprobado)
- `theme/` (colors, typography, spacing, radii, shadows, breakpoints, layout,
  index) con tokens semánticos. `components/ui/` (Button, Card, Badge, Input).
- Paleta teal + neutros cálidos + estados accesibles. **Accesibilidad
  garantizada**: `Badge` tiene `label` OBLIGATORIA (imposible mostrar estado solo
  por color → cumple WCAG 1.4.1 por estructura). Contrastes AA verificados (28
  pares en `theme/colors.ts`).
- Tonos de estado afinados para daltonismo rojo-verde (David tiene daltonismo
  leve); la salvaguarda real es la etiqueta de texto siempre presente.
- Fondo `#f8f8f7` es el más oscuro posible sin romper AA (NO oscurecer más).
- Guía de estilo viva en `/theme-preview`.

### Fase 2 — Aplicar a pantallas (EN CURSO)
- **Grupo CLIENTE (COMPLETO y aprobado)**: index (servicios), disponibilidad,
  confirmacion, mis-citas, login, perfil. Patrón: **cabecera de negocio** +
  **Card contenedora centrada** (ancho `contentMaxWidth=680`) + elementos con
  borde+sombra. "Cancelar cita" como botón **secundario**; el rojo (danger) solo
  en la confirmación "Sí, cancelar".
- **Grupo NEGOCIO — Ajustes (COMPLETO y aprobado)**: index, servicios, horarios,
  politicas, datos. Patrón de HERRAMIENTA: ancho `panelMaxWidth=880`, **una Card
  por sección lógica**, listas como filas-chip con borde, botones inline ligeros.
- **Grupo NEGOCIO — tanda (a): Clientes + Resumen (COMPLETO y aprobado, v7)**:
  - `clientes.tsx` (listado): patrón lista (sin Card contenedora), buscador
    `Input`, filas-chip. Estados vacíos "sin clientes" / "sin resultados" como
    texto plano.
  - `cliente/[id].tsx` (ficha): tres Card (Resumen con botón WhatsApp + 3 cajas
    de stats + próxima cita; Notas internas; Historial). WhatsApp mantiene su
    **verde de marca** (#25D366), excepción deliberada (marca de tercero
    reconocible); "próxima cita" → token `info`; estados del historial → `Badge`;
    enlaces → `primary`.
  - `resumen.tsx`: 4 cajas de stat → chip 2×2; comparativa +/-% → `success`/
    `danger` (siempre con signo y %, nunca solo color); gráficos en Card; barras
    → `primary` (teal). **Ambos** gráficos ("por semana" y "por servicio") tienen
    ya su estado vacío en meses sin actividad.

### Fase 2 — Decisión de diseño ya tomada (títulos de pantalla)
- La cabecera nativa de Expo Router se apaga (`headerShown: false`) a nivel
  `_layout` en negocio/ajustes/cliente; el título se pinta DENTRO de la columna
  de contenido (tipografía del theme, `accessibilityRole="header"`, sin negro
  hardcodeado → listo para modo oscuro).
- **Alineado al borde izquierdo de la columna, NO centrado** (estándar iOS large
  title / Material). El problema que se detectó no era "falta centrar", era
  "título desconectado del contenido"; anclarlo a la columna lo resuelve.
- `components/ui/Screen.tsx` centraliza el safe-area (`useSafeAreaInsets`) que
  antes daba gratis la cabecera nativa. Verificado en móvil estrecho.
- `calendario` y `cita` quedan **excluidos** a propósito: conservan su cabecera
  nativa hasta que se rediseñen en la tanda (b).

### Fase 2 — PENDIENTE de rediseñar (negocio)
- **(b) Calendario** (día/semana/mes) — la más compleja; ancho COMPLETO (no 880).
  Ver §10: no es "aplicar tokens", hay decisión de accesibilidad que resolver
  ANTES de tocar código.
- **(c) Admin** (`/admin`).
- **Modo oscuro** (tanda propia; el sistema ya está preparado).

---

## 6. Bugs importantes resueltos (memoria)

Doble reserva sin member_id (0002→0009); bucle de renders en confirmación;
sesión fantasma (getUser); ocupación solo visible al propio usuario (0003);
estado pegado entre reservas / cruce de ficha entre negocios; RLS ausente
recurrente (business_members 0005, working_hours/exceptions 0007, payments/
notifications 0008); permission denied platform_admins en anónimo (0006,
is_platform_admin SECURITY DEFINER); DELETE en cascada de negocio (0008);
dueño-puede-solapar / cliente-no (0009, trigger que decide por actor real);
crash+fecha pegada en cita.tsx (Tabs href:null no se desmonta); cliente cancela
solo lo suyo (0010, RLS + trigger columna-por-columna); login cliente residual
por teléfono → email; login no navegaba tras éxito + doble clic OTP;
refreshBusiness desmontaba el panel al guardar (guard `loading && !business`).

- **Regresión del rediseño (a) — "Volver a clientes" caía en Calendario**: el
  enlace de la ficha hacía `router.back()`, y por el stack sobre tabs "atrás"
  aterrizaba en la pestaña por defecto (Calendario). Corregido con navegación
  EXPLÍCITA (`router.replace('/(business)/clientes')`). Verificados el resto de
  enlaces "volver" de la tanda, sin más casos. Lección: en enlaces de "volver"
  usar ruta explícita, nunca back genérico, cuando hay tabs de por medio.

### Notas operativas
Aprobar `active` desde SQL Editor NO funciona (trigger comprueba auth.uid, null
en editor) → la vía es `/admin`. Verificaciones que requieren OTP: Claude Code
usa mailinator o las hace David; usuario-de-test con OTP fijo DESCARTADO.
**Git push lo hace David** desde su terminal: la sesión de Claude Code no tiene
credenciales de GitHub (salida restringida), así que Claude Code hace el commit
en local y David lo sube. Commit lleva `Co-Authored-By` de la sesión; el autor
principal es David.

---

## 7. Configuración (Supabase)

Confirmación de email activada; login email+OTP (clientes y dueños; dueños
además contraseña); plantillas "Magic Link" y "Confirm signup" editadas para
enviar código `{{ .Token }}`; SMTP Brevo (300/día, 30/hora — se nota en pruebas);
`detectSessionInUrl: true` (inofensivo, el flujo usa código).

---

## 8. Principios del proyecto

RGPD/LOPDGDD desde el diseño; herramientas gratuitas en el MVP; sin librerías
innecesarias (fechas con Intl, gráficos y calendarios con vistas nativas);
seguridad de datos con revisión doble (el SQL se revisa antes de aplicarlo y lo
aplica David, no Claude Code); trocear el trabajo (cambios acotados y
verificables uno a uno); **accesibilidad**: nunca depender solo del color (David
tiene daltonismo leve), etiqueta de texto siempre.

---

## 9. COLA DE PENDIENTES (lo que queda, ordenado)

### Rediseño (terminar Fase 2)
1. **(b) Rediseñar Calendario** (día/semana/mes) — negocio, ancho completo, la
   más compleja. **Decisión de diseño pendiente ANTES de tocar código** (§10):
   hoy el estado de la cita se comunica SOLO por color (verde/naranja/gris en
   día y semana; fondos de día de colores en mes que "no se entienden") → choca
   con la regla de accesibilidad y con el daltonismo de David. Al hacerla:
   unificar el mapeo estado→tono en un solo módulo (hoy hay TRES copias locales:
   `mis-citas.tsx`, `cliente/[id].tsx`, y `calendario.tsx` —esta aún con
   `STATUS_COLORS` literal—; el TODO en las tres apunta aquí).
2. **(c) Rediseñar Admin**.
3. **Modo oscuro** (tanda propia; el sistema ya está preparado con tokens
   tipados).

### Pulido visual anotado (menor, tras el rediseño)
- **Ficha de cliente en móvil estrecho (~375px)**: las 3 cajas de estadística
  quedan apretadas y "Citas completadas" parte en dos líneas → candidato a
  apilar (1 columna, o 2+1) en móvil. (Detectado en tanda a; no bloquea.)
- El "desierto" debajo del resumen en confirmacion.tsx (centrar la tarjeta o
  añadir la política de cancelación como contexto útil).
- En Horarios, "Editar/Quitar" van muy pegados y "Quitar" en rojo llama mucho
  para una acción frecuente — separar/suavizar.
- (Opcional) Botón WhatsApp a ancho completo en la ficha es MUY dominante; si
  chirría, pasar a ancho de contenido (sin tocar el color).

### Funcional pendiente
- **Pantalla de Perfil del cliente** (hoy vacía): gestión de datos, toggle de
  consent_marketing, borrado/anonimización (activa el último RLS aplazado:
  UPDATE/anonimización del cliente sobre su ficha).
- **Bug del slug / punto de entrada**: al ir a "Reservar" desde Mis citas cae en
  `/` sin slug. Falta pantalla inicial "reservar" vs "tengo un negocio" y
  encaminar al cliente sin slug.
- **Subida de logo del negocio** (Supabase Storage + campo + RLS de archivos):
  sustituir el avatar-placeholder por logo real.
- **Cliente MODIFICA (mueve) su cita** desde Mis citas (hoy solo cancela).
- RLS aplazado: gestión de equipo (business_members), y el UPDATE de cliente
  sobre su ficha (con la pantalla de perfil).

### Producción (no bloquea desarrollo web, sí lanzamiento)
- **Deep linking nativo (registro/confirmación en app MÓVIL)**: resuelto en web,
  falta `Linking` en móvil. **Prioritario antes de lanzar** (la mayoría usará
  móvil).
- **Stripe** (cobro online; hoy "paga en el negocio" cubre el caso básico).
- **Notificaciones push (Expo) + recordatorios** (Edge Functions con cron).
- **Cuenta huérfana de Auth** (signUp sin confirmar).
- **Verificar dominio propio en Brevo** (`@zalcita.app`).
- **Rol admin vs dueño** (hoy un mismo usuario es ambas cosas; separar).
- **Mantenimiento**: actualizar Expo (57.0.14 → ~57.0.21) en un momento de calma,
  como tarea aislada (`npx expo install --check`), verificando que compila.

### Fase 2 de producto (más adelante)
WhatsApp Business API (recordatorios); IA (predicción no-shows, sugerencia de
próxima cita, resumen mensual en lenguaje natural, FAQ); Stripe Connect
(marketplace); horarios por profesional; excepciones de "horario especial de
apertura".

---

## 10. DÓNDE ESTAMOS AHORA MISMO (para retomar)

Rediseño Fase 2 en curso. **Cliente rediseñado y aprobado. Ajustes rediseñado y
aprobado. Tanda (a) — Clientes + Resumen — rediseñada, verificada en vivo por
David y COMMITEADA** (`b7c7ce0`, subida a GitHub). Fix transversal de títulos
aplicado (todas las pantallas menos calendario/cita) con `Screen.tsx`.

**Siguiente paso inmediato: tanda (b), el CALENDARIO.** Ojo: NO es una pasada de
tokens como (a). Antes de escribir ningún prompt para Claude Code hay que decidir
con David el problema de fondo:

- **Estado de la cita comunicado solo por color.** En día y semana los bloques
  son verde / naranja-marrón / gris según estado; en la vista mes los días
  tienen fondos de color (crema, rosa, menta) cuyo significado "no se entiende".
  Esto rompe la regla del proyecto (nunca solo color) y, para colmo, verde-vs-
  naranja/marrón es justo el eje del daltonismo rojo-verde de David.
- **Qué decidir antes de tocar nada**:
  1. Confirmar el mapeo actual estado→color (los 5 estados) y, sobre todo, qué
     codifican los fondos de día de la vista mes (pedir a Claude Code que lo
     reporte leyendo el código).
  2. Cómo señalar el estado SIN depender del color en una rejilla densa donde no
     cabe un Badge por bloque: texto/abreviatura de estado en el bloque, o icono/
     glifo, o borde/patrón — probablemente color (redundante) + una señal no-color.
  3. Qué hacer con los fondos de color del mes: si no se entienden, quitarlos o
     reconvertirlos a algo con significado y leyenda.
  4. Unificar el mapeo estado→tono en un módulo compartido (las tres copias).
- **Criterios ya fijados**: ancho COMPLETO (no 880); el título del calendario
  pasa al patrón de columna (hoy excluido); cero cambios de lógica.

El siguiente movimiento es una CONVERSACIÓN de diseño con David sobre esos cuatro
puntos, no un prompt directo.
