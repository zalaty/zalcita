# Zalcita — Estado del proyecto (v6)

_App de reserva de citas para negocios de servicios (peluquerías, estética,
fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: septiembre 2026. Cambios respecto a v5: el núcleo
funcional del MVP está cerrado (cliente + negocio + admin completos), calendario
del negocio con vistas día/semana/mes, y **rediseño visual en curso** (sistema de
diseño montado, pantallas del cliente rediseñadas, piloto del negocio —Ajustes—
aprobado). El grueso de este documento nuevo está en §5 (rediseño) y §9 (cola de
pendientes de pulido).

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

Migraciones aplicadas: `0001_init` … `0012_schedule_exceptions_reason`.
(0002 fix_overlap, 0003 busy_slots, 0004 business_signup, 0005 business_members_select,
0006 fix_platform_admin_rls, 0007 working_hours/exceptions_write, 0008 rls_hardening,
0009 owner_can_overlap, 0010 client_cancels_own, 0011 cancellation_policies_write,
0012 schedule_exceptions_reason.)

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

Se decidió hacer el rediseño en dos fases, DESPUÉS de tener toda la
funcionalidad. Dirección visual: **limpio y profesional pero cercano**, color de
marca **teal** (#0f766e), neutros cálidos. **Modo claro ahora**, sistema
PREPARADO para modo oscuro después (tokens semánticos tipados). Modo oscuro =
tanda futura.

### Fase 1 — Sistema de diseño (COMPLETO y aprobado)
- `theme/` (colors, typography, spacing, radii, shadows, breakpoints, layout,
  index) con tokens semánticos. `components/ui/` (Button, Card, Badge, Input).
- Paleta teal + neutros cálidos + estados accesibles. **Accesibilidad
  garantizada**: `Badge` tiene `label` OBLIGATORIA (imposible mostrar estado solo
  por color → cumple WCAG 1.4.1 por estructura, no por convención). Contrastes AA
  verificados (28 pares documentados en `theme/colors.ts`).
- Tonos de estado afinados para daltonismo rojo-verde (David tiene daltonismo
  leve) mediante simulación dicromática — mejora modesta; la salvaguarda real es
  la etiqueta de texto siempre presente.
- Fondo `#f8f8f7` es el más oscuro posible sin romper AA (NO oscurecer más).
- Pantalla de muestra permanente en `/theme-preview` (guía de estilo viva).

### Fase 2 — Aplicar a pantallas (EN CURSO)
- **Grupo CLIENTE (COMPLETO y aprobado)**: index (servicios), disponibilidad,
  confirmacion, mis-citas, login, perfil. Patrón: **cabecera de negocio**
  (avatar-placeholder con inicial + nombre en teal) + **Card contenedora
  centrada** (ancho `contentMaxWidth=680`) + elementos con borde+sombra. Mejora
  UX aplicada: "Cancelar cita" ahora es botón **secundario** (contorno), el rojo
  (danger) solo en la confirmación "Sí, cancelar".
- **Grupo NEGOCIO — piloto AJUSTES (COMPLETO y aprobado)**: index, servicios,
  horarios, politicas, datos. Patrón de HERRAMIENTA (distinto del cliente):
  ancho `panelMaxWidth=880` (más ancho que el cliente, pero con límite — un
  formulario a pantalla completa se usa mal), **una Card por sección lógica**
  (no una gigante), listas como filas-chip con borde, botones inline (Editar/
  Quitar/Activar) como texto/chip ligero, no Button completo.

### Fase 2 — PENDIENTE de rediseñar (negocio)
- **Clientes** (listado + ficha) — usará ancho completo o generoso (tabla).
- **Resumen financiero** (con gráficos).
- **Calendario** (día/semana/mes) — la más compleja; ancho COMPLETO (no 880),
  es una herramienta densa.
- **Admin** (`/admin`).
Criterio de ancho ya decidido: formularios → `panelMaxWidth` (880); calendario y
tablas → ancho completo.

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

### Notas operativas
Aprobar `active` desde SQL Editor NO funciona (trigger comprueba auth.uid, null
en editor) → la vía es `/admin`. Verificaciones que requieren OTP: Claude Code
usa mailinator o las hace David; usuario-de-test con OTP fijo DESCARTADO (el
mecanismo oficial de Supabase es para SMS no email; las vías para email son
inseguras/frágiles — no se toca la auth).

---

## 7. Configuración (Supabase)

Confirmación de email activada; login email+OTP (clientes y dueños; dueños
además contraseña); plantillas "Magic Link" y "Confirm signup" editadas para
enviar código `{{ .Token }}`; SMTP Brevo (300/día, 30/hora — se nota en pruebas);
`detectSessionInUrl: true` (inofensivo, el flujo usa código).

---

## 8. Principios del proyecto

RGPD/LOPDGDD desde el diseño; herramientas gratuitas en el MVP; sin librerías
innecesarias (fechas con Intl, gráficos y calendarios con vistas nativas — se
verificó que el date-picker "oficial" de RN no tiene web, por eso a mano);
seguridad de datos con revisión doble (el SQL se revisa antes de aplicarlo y lo
aplica David, no Claude Code); trocear el trabajo (cambios acotados y
verificables uno a uno); **accesibilidad**: nunca depender solo del color (David
tiene daltonismo leve), etiqueta de texto siempre.

---

## 9. COLA DE PENDIENTES (lo que queda, ordenado)

### Rediseño (terminar Fase 2)
1. Rediseñar **Clientes** (listado + ficha) — negocio.
2. Rediseñar **Resumen financiero** — negocio.
3. Rediseñar **Calendario** (día/semana/mes) — negocio, ancho completo, la más
   compleja. NOTA: al hacerla, unificar el mapeo estado→tono (ahora hay uno local
   en mis-citas.tsx y otro en calendario.tsx — evitar que diverjan).
4. Rediseñar **Admin**.
5. **Modo oscuro** (tanda propia; el sistema ya está preparado con tokens
   tipados).

### Pulido visual anotado (menor, tras el rediseño)
- El "desierto" debajo del resumen en confirmacion.tsx (centrar la tarjeta o
  añadir la política de cancelación como contexto útil).
- La cabecera de pantalla nativa ("Reservar", "Ajustes"...) — título negro suelto
  arriba, integrarla mejor con la identidad o quitarla.
- En Horarios, "Editar/Quitar" van muy pegados y "Quitar" en rojo llama mucho
  para una acción frecuente — separar/suavizar.

### Funcional pendiente
- **Pantalla de Perfil del cliente** (hoy vacía): gestión de sus datos, toggle de
  consent_marketing, borrado/anonimización (activa el último RLS aplazado: UPDATE/
  anonimización del cliente sobre su ficha).
- **Bug del slug / punto de entrada**: al ir a "Reservar" desde Mis citas cae en
  `/` sin slug (hay que refrescar). Falta pantalla inicial "reservar" vs "tengo un
  negocio" y encaminar al cliente sin slug.
- **Subida de logo del negocio** (Supabase Storage + campo + RLS de archivos):
  sustituir el avatar-placeholder por logo real. Probablemente junto a gestión de
  imagen del negocio.
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

Rediseño Fase 2 en curso. **Cliente rediseñado y aprobado.** **Piloto de negocio
(Ajustes) rediseñado y aprobado**, con el criterio de ancho fijado
(panelMaxWidth=880 para formularios; completo para calendario/tablas). 

**Siguiente paso inmediato**: propagar el rediseño al resto del panel de negocio,
en tandas — sugerido: (a) Clientes + Resumen, (b) Calendario (la compleja, sola),
(c) Admin. Todo con el sistema y los patrones ya validados.
