# Zalcita — Estado del proyecto (v11)

_App de reserva de citas para negocios de servicios (peluquerías, barberías,
estética, fisioterapia, etc.). Documento vivo del estado de desarrollo._

Fecha de esta versión: octubre 2026. Cambios grandes respecto a v10: **Zalcita está
LANZADA en web y en producción.** Dominio propio, correo transaccional con dominio
verificado, despliegue automático, base de datos limpia, negocio demo creado, y
varios bugs de onboarding del negocio arreglados. El rediseño (claro + oscuro) sigue
terminado del v10. Lo que queda es pulir onboarding, construir funcionalidad nueva
(Perfil cliente, multi-negocio por dueño) y el camino a la app nativa. Ver §5, §9, §10.

**Documento hermano**: `infraestructura-despliegue.md` cubre dominio, DNS, Brevo,
Supabase SMTP, GitHub Action y flujo de ramas. Consultarlo para todo lo de
infraestructura/lanzamiento.

---

## 1. Visión del producto

Plataforma multi-negocio (multi-tenant) donde:
- **Clientes** reservan citas sin fricción (ven disponibilidad y eligen hora SIN
  registrarse; se identifican solo al CONFIRMAR, por email OTP) y gestionan (cancelan)
  sus citas. Entran a un negocio por su enlace con slug (`zalcita.com/?slug=negocio`).
- **Negocios (dueños)** gestionan agenda, clientes, servicios, horarios, políticas
  y ven un resumen de ingresos.
- **Administrador de plataforma** aprueba los negocios antes de que operen.

Modelo de alta: **autoservicio con aprobación** (`active=false` hasta que el admin
lo aprueba). El núcleo funciona de punta a punta, EN PRODUCCIÓN.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Expo (React Native) + Expo Router |
| Lenguaje | TypeScript (estricto) |
| Backend | Supabase (Postgres + Auth + RLS) — proyecto PRODUCTION |
| Pagos | Stripe (previsto, no implementado) |
| Email | Brevo (SMTP) vía Supabase Auth — dominio `zalcita.com` autenticado |
| Iconos | @expo/vector-icons (Ionicons); portapapeles con expo-clipboard |
| Build nativo | EAS Build (fase 2, app nativa) |
| Hosting web | Hostinger (zalcita.com, estático, deploy por GitHub Action) |

Identificadores: app `com.zalcita.app`, cuenta Expo (owner) `zalaty`, dominio público
`zalcita.com`. Iconos/favicon: marca placeholder "Z" sobre teal `#0f766e`.

---

## 3. Modelo de datos (implementado)

Tablas: `businesses`, `business_members`, `services`, `clients`, `working_hours`,
`schedule_exceptions`, `cancellation_policies`, `appointments`, `payments`,
`notifications_log`, `push_tokens`, `platform_admins`.

Decisiones clave: multi-tenant por RLS; `clients` por negocio (RGPD, una fila de
cliente por cada negocio donde reserva, unidas por `auth_user_id`);
`price_at_booking` copiado; anonimización en vez de borrado; `platform_admins` (la
fila ES el permiso, vía `is_platform_admin()`); solape por trigger
`check_appointment_overlap` (cliente nunca solapa, dueño sí con aviso).
`business_members.name` = nombre de la PERSONA (dueño/empleado), distinto de
`businesses.name` (nombre del negocio) — preparado para multi-profesional (fase 2).

Estados de cita: pendiente, confirmada, completada, no-show, cancelada. Una reserva
de CLIENTE nace **confirmada** salvo que el negocio active "confirmación manual" en
Ajustes › Políticas (entonces nace pendiente). Una cita creada por el DUEÑO nace
pendiente.

Horario (`working_hours`): tramos = "cuándo abre el negocio" (de corrido, p. ej.
10:00–14:00), NO slots troceados. La disponibilidad se calcula sola según la
duración del servicio y descuenta lo ocupado (`computeAvailableSlots`). **Cabo
latente**: los tramos NO se funden entre sí, así que un servicio más largo que un
tramo no cabe si el horario está partido en trozos pequeños — solución práctica:
meter el horario de corrido. (Verificado: no era bug, era meter tramos partidos.)

Migraciones: `0001_init` … `0012`. Nada de lo hecho tras el v10 añadió migraciones
(lanzamiento, demo y arreglos de onboarding fueron código + config + datos, no
esquema).

---

## 4. Estado funcional — NÚCLEO COMPLETO Y EN PRODUCCIÓN

### Lado cliente (COMPLETO)
Entra por `?slug=`; ve servicios y disponibilidad SIN login; OTP solo al confirmar;
ficha con consentimiento RGPD; creación de cita con protección de doble reserva;
"Mis citas" (ver + cancelar según política); **selector de negocio** para clientes
con varios negocios + "Cambiar de negocio"; logout en Perfil.

### Lado negocio (COMPLETO en su núcleo)
Registro autoservicio; panel pendiente/aprobado; Ajustes (Servicios / Horarios y
excepciones / Políticas / Datos del negocio, con enlace de reserva + botón copiar);
Calendario (día/semana/mes, crear+mover citas, alta de cliente en "Nueva cita" con
email opcional + RGPD); Clientes (listado+ficha); Resumen financiero; logout en
Ajustes; toggle de tema (claro/oscuro).

### Administración de plataforma (COMPLETO)
`/admin` solo para admins; aprobar/desactivar negocios.

---

## 5. REDISEÑO (claro + oscuro) — TERMINADO (sin cambios desde v10)

Rediseño completo en claro y oscuro, con tokens semánticos tipados, modo oscuro con
toggle en Ajustes (negocio; el cliente sigue al sistema), accesibilidad por
estructura (nunca solo color, por el daltonismo de David), tab bars con iconos
Ionicons, logo placeholder "Z". **Para el detalle completo del sistema de diseño y
del modo oscuro, ver el v10** (sección 5 y "Aprendizajes del modo oscuro"). No se ha
tocado nada de diseño desde entonces.

---

## 6. LANZAMIENTO WEB — HECHO (octubre 2026)

Todo el detalle operativo está en `infraestructura-despliegue.md`. Resumen:
- **Dominio** `zalcita.com` (Hostinger), la app en la raíz, sitio estático.
- **Correo**: Brevo, dominio `zalcita.com` autenticado (DKIM/SPF/DMARC), remitente
  `no-reply@zalcita.com`. OTP llega a inbox (verificado en Gmail). Buzones de dominio
  creados: `admin@zalcita.com`, `demo@zalcita.com`.
- **Supabase**: custom SMTP de Brevo; rate limit de emails subido de 30 a 100/h
  (el 30 por defecto estrangulaba). Límite real = Brevo free (300/día, 30/h).
- **Despliegue**: GitHub Action (`deploy-web.yml`) en push a `main` → `expo export`
  → FTP a Hostinger. Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL
  (=https://zalcita.com), FTP_*. `.htaccess` SPA en la raíz.
- **Flujo de ramas**: se trabaja en `dev`, se prueba en local, PR a `main` → deploy.
  NUNCA commitear directo a main (despliega en vivo).
- **Verificado en producción**: flujo de cliente por slug completo, OTP real, reserva,
  recarga sin 404, en móvil real.

### Limpieza de datos (hecha)
Borrados todos los negocios/datos de prueba; conservado **`zalcita negocio`** (negocio
de pruebas de David, dueño `zalcita.app@gmail.com`) + el admin. Creado el **negocio
demo** por el flujo normal: "Barbería Central", dueño `demo@zalcita.com`, aprobado,
con servicios y horarios. Slug actual `barberia-central` (pendiente cambiar a `demo`
si se quiere, §9). **Quedan 63 usuarios en Auth** (mailinator/tests) por limpiar (§9).

---

## 7. Configuración (Supabase) — ver infraestructura-despliegue.md

Login email+OTP (clientes; dueños además contraseña); plantillas envían código
(`{{ .Token }}`); custom SMTP Brevo. Keys: anon/publishable es PÚBLICA (la seguridad
la da RLS); service_role NUNCA en cliente. **Pendiente**: rotar la anon key antes del
crecimiento (pasó por chat), cambiar solo el GitHub Secret.

---

## 8. Principios del proyecto

RGPD/LOPDGDD desde el diseño; herramientas gratuitas en el MVP; sin librerías
innecesarias; seguridad de datos con revisión doble (SQL revisado y aplicado por
David, no Claude Code; borrados en transacción con comprobación antes de commit);
trocear el trabajo (cambios acotados verificables uno a uno); accesibilidad (nunca
solo color — David tiene daltonismo leve). **Método de trabajo**: Claude (chat)
asesora, prepara prompts en bloque de código y hace las preguntas ANTES del bloque;
Claude Code implementa en local sin commit; David revisa, verifica en vivo y
commitea/mergea. Rama `dev`, merge a `main` solo lo probado.

---

## 9. COLA DE PENDIENTES (lo que queda)

### Bugs/pulido de onboarding (antes o justo tras lanzar marketing)
- **Enter en formularios restantes** (YA aplicado en auth + OTP): aplicar también a
  `ajustes/datos.tsx`, `ajustes/servicios.tsx`, y alta de cliente en `cita.tsx`
  (los tres "Sí, candidato"; el resto —horarios, políticas, buscadores, hora,
  notas— NO, por no tener acción principal inequívoca o ser multilínea). DECIDIDO.
- **Slug del demo** → cambiar `barberia-central` a `demo` (SQL: `update businesses
  set slug='demo' where ...`). Y valorar permitir editar el slug desde la UI.
- **Logout** (negocio en Ajustes, cliente en Perfil): HECHO, estilo secondary
  (cerrar sesión no es destructivo), con confirmación. Verificado.

### Funcional nuevo (importante, no bloquea el lanzamiento inicial)
- **Registro de negocio ADICIONAL con un email que ya existe**: hoy el registro solo
  crea usuario nuevo, así que un dueño con el email ya registrado NO puede dar de alta
  un segundo negocio. La estructura (`business_members`) YA soporta multi-negocio por
  dueño; falta el FLUJO de onboarding (p. ej. "añadir otro negocio" desde el panel del
  dueño logueado). Decisión de producto + desarrollo. Caso: peluquería + estética del
  mismo dueño, o segundo local.
- **Pantalla de Perfil del cliente** (hoy solo logout + placeholder): gestión de
  datos, toggle consent_marketing, borrado/anonimización (RGPD, activa el último RLS
  aplazado). Incluir aquí "darse de baja de un negocio" (quitar ficha → deja de salir
  en el selector).
- **Cliente MODIFICA (mueve) su cita** desde Mis citas (hoy solo cancela).
- **Subida de logo del negocio** (Supabase Storage + RLS de archivos).
- RLS aplazado: gestión de equipo (business_members), UPDATE de cliente sobre su ficha.

### Pulido visual menor
- Foco/Enter ya cubierto arriba. El "desierto" bajo el resumen en confirmacion.tsx.
- "Editar/Quitar" muy pegados en Horarios.

### Operación / radar
- **Rotar la anon key** de Supabase (solo el GitHub Secret).
- **Limpiar los 63 usuarios de Auth** (conservando el admin `zalcita.app@gmail.com`;
  cuidado con FKs a `clients`). Reporte + SQL revisado.
- **Migrar el admin** de `zalcita.app@gmail.com` a `admin@zalcita.com` (buzón ya
  creado). Tarea aparte, con cuidado (el login va por OTP, el buzón debe recibir).
- **Negocio demo**: recibirá reservas reales de curiosos del marketing (normal).
- **Guía de usuario para negocios** (entregable pedido): documento de "qué se puede
  hacer y cómo", con capturas reales de producción. Tras estabilizar.

### Backlog de producto (más adelante)
- Recordatorios: email (Brevo, gratis) por defecto; WhatsApp automático = fase 2 de
  pago (WhatsApp Business API, ~céntimos/mensaje). El `wa.me` actual es manual.
- Exportar/imprimir a PDF (agenda del día, resumen mensual).
- Ampliar Resumen con más métricas.
- Stripe (cobro online); push (Expo + Edge Functions con cron).

### App nativa (FASE 2, tras consolidar la web)
- **Deep linking**: que un enlace con slug abra la app en el negocio correcto.
- **Pantalla de entrada** en la app para el cliente que entra sin slug.
- QR para descargar/abrir negocio.
- Build EAS + publicación en Play Store (David tiene cuenta y experiencia).
- Revisar icono nativo y modo oscuro en el build.

---

## 10. DÓNDE ESTAMOS AHORA MISMO (para retomar)

**Zalcita está LANZADA en web, en producción, en `zalcita.com`.** Núcleo funcional
completo, rediseño (claro+oscuro) terminado, infraestructura montada y verificada
(dominio, correo a inbox, despliegue automático). Base de datos limpia, negocio demo
creado. Arreglados en producción los bugs de onboarding que más molestaban: el enlace
de reserva (dominio+formato correctos + botón copiar) y la race condition del login
del dueño (ya cae directo a su panel). Logout y Enter en auth: hechos y verificados
en dev, pendientes de mergear a main.

**Siguiente, en orden sugerido:**
1. Mergear a main el logout + Enter (verificado en dev).
2. Cerrar el pulido de onboarding: Enter en los 3 formularios restantes, slug del
   demo a `demo`.
3. **Registro de negocio adicional para usuario existente** (producto + desarrollo) —
   el pendiente funcional más relevante para dueños reales.
4. Perfil del cliente (con RGPD) y "cliente mueve su cita".
5. Operación: rotar anon key, limpiar 63 usuarios de Auth, migrar admin a dominio.
6. App nativa (fase 2): deep linking, build EAS, Play Store.

Objetivo inmediato de David: **marketing suave en redes** (Instagram/Facebook) con el
negocio demo, mientras sigue puliendo y añadiendo. No espera superar 300 correos/día
al principio (dentro del límite de Brevo free).

Método intacto (§8): Claude asesora y prepara prompts (preguntas ANTES del bloque);
Claude Code implementa en local sin commit; David revisa, verifica en vivo, y mergea
dev→main (que despliega).
