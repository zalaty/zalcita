# Zalcita — Infraestructura y Despliegue (operativo)

_Documento técnico-operativo: dominio, DNS, correo, Supabase, despliegue web.
Separado del `estado-proyecto-vXX` (que cubre el desarrollo de la app). Se
complementa según avanza el lanzamiento._

Última actualización: septiembre 2026.

---

## 1. Dominio

- **Dominio principal**: `zalcita.com`
- **Registrador / DNS**: Hostinger (misma cuenta que el hosting; ya se usa para
  otras webs — desatascospaya.com, masquepalabrasconil.com, etc.).
- Comprado el 2026-09-28. Auto-renovación ACTIVADA. Privacidad WHOIS ACTIVADA.
- Expira 2027-09-28.
- Nameservers: `apollo.dns-parking.com` / `athena.dns-parking.com` (parking de
  Hostinger; la zona DNS se gestiona igualmente desde el panel de Hostinger →
  DNS/Nameservers → Manage DNS records).
- **Decisión de marca**: se eligió `.com` (estándar, el que la gente teclea) sobre
  `.es`/`.app`. El `.app` que aparecía en notas antiguas (`@zalcita.app`) queda
  DESCARTADO — todo va a `zalcita.com`.

### La app va en la RAÍZ del dominio
- Zalcita se despliega en la raíz de `zalcita.com` (NO en subcarpeta ni
  subdominio, a diferencia de buclebot que vive en subdominio de otra web).
- Motivo: URLs limpias para marketing (`zalcita.com/?slug=negocio`) y evitar
  líos de `baseUrl`/rutas de Expo Router en web.
- Es un sitio ESTÁTICO (Expo web export), NO WordPress.

---

## 2. DNS (registros en Hostinger para zalcita.com)

Registros propios de la web:
- `A` @ → `2.57.91.91` (IP del hosting) — no tocar.
- `CNAME` www → `zalcita.com` — no tocar.

Registros añadidos para Brevo (autenticación de correo), TTL 14400:
| Tipo | Nombre | Valor |
|---|---|---|
| TXT | @ | `brevo-code:455569e01a8e82adc64a744d91e247a4` |
| CNAME | brevo1._domainkey | `b1.zalcita-com.dkim.brevo.com` |
| CNAME | brevo2._domainkey | `b2.zalcita-com.dkim.brevo.com` |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| CNAME | mail | `mail-zalcita-com.brand.brevosend.com` |
| CNAME | r.mail | `mail-zalcita-com.r.brand.brevosend.com` |
| CNAME | img.mail | `mail-zalcita-com.img.brand.brevosend.com` |

Nota: el `TXT @` (código Brevo) convive con el `A @` (web) — tipos distintos, sin
conflicto. Los TXT pueden mostrarse entrecomillados en Hostinger, es correcto.

---

## 3. Correo transaccional (Brevo)

- **Proveedor**: Brevo (SMTP), cuenta "Zalcita" (plan FREE, 300/día, 30/hora).
- **Dominio autenticado**: `zalcita.com` — verificado el 2026-09-29 (DKIM ✓, SPF
  vía include, DMARC ✓, subdominio de marca `mail` ✓).
- **Remitente**: `Zalcita <no-reply@zalcita.com>` — Verificado en Brevo.
- **Subdominio con marca**: `mail.zalcita.com` (mejora entregabilidad).
- **VERIFICADO EN VIVO** (2026-09-29): OTP de reserva llega a bandeja de ENTRADA
  en Gmail (no spam), desde `no-reply@zalcita.com`. El circuito completo funciona.
- Aviso: dominio recién estrenado = reputación cero al principio; puede haber
  cautela de filtros los primeros días, se asienta con volumen. Con DKIM/SPF/
  DMARC bien puestos, llega a inbox desde el principio en la mayoría de casos.

---

## 4. Supabase (config de envío de Auth)

- Proyecto: `zalcita` (org `zalaty`, plan FREE, entorno PRODUCTION).
- URL: `https://nyrxszmwdnlvzpuppwcc.supabase.co`
- **Custom SMTP ACTIVADO** (Authentication → Emails → SMTP Settings):
  - Sender email: `no-reply@zalcita.com`
  - Sender name: `Zalcita`
  - Host/puerto/credenciales: SMTP de Brevo (ya configurado de antes).
- Las plantillas de email ("Magic Link"/"Confirm signup") envían CÓDIGO
  (`{{ .Token }}`), no enlace (decidido hace tiempo).

### Keys de Supabase (seguridad)
- **anon / publishable key** (`sb_publishable_...`): PÚBLICA por diseño, se
  incrusta en el JS del cliente. La seguridad la da RLS, no el secreto de la key.
- **service_role key**: NUNCA en el cliente ni en sitios públicos — salta RLS,
  acceso total. Solo en secrets de servidor (Edge Functions, webhook Stripe).
- **PENDIENTE (radar)**: rotar la anon key antes del lanzamiento público (pasó
  por chat durante el setup). Cuando se rote: cambiarla SOLO en el GitHub Secret
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (es donde vive una vez montado el Action).

---

## 5. Despliegue web (GitHub Actions → Hostinger vía FTP)

- **Patrón**: igual que buclebot (ya probado y funcionando contra Hostinger).
  Push a `main` → GitHub Action → `expo export --platform web` → sube `dist/` por
  FTP a la raíz de `zalcita.com`.
- Sitio estático (no WordPress). Cuenta FTP del website nuevo apunta a la raíz
  (`public_html`) de zalcita.com.

### Flujo de ramas (IMPORTANTE)
- Se trabaja en la rama **`dev`**, NUNCA directamente en `main`.
- `main` = lo que está en producción. Push a `main` dispara el Action y **redespliega
  zalcita.com en vivo**, así que solo se mergea a main lo probado y listo.
- Ciclo: desarrollar en `dev` → probar en LOCAL (`npx expo start`) → PR de `dev` a
  `main` (para ver el diff) → merge → el Action despliega. Verificar Action en verde
  y zalcita.com tras cada deploy.
- Staging (un subdominio que despliegue desde `dev`) = mejora futura, no montado aún.

### Workflow `.github/workflows/deploy-web.yml`
Pasos: checkout → Node 20 → `npm install --legacy-peer-deps` → crear `.env` desde
secrets → `npx expo export --platform web` → FTP-Deploy-Action sube `./dist/` a
`./`, excluyendo `.git*` y `.htaccess` (preserva el .htaccess subido a mano).

### GitHub Secrets necesarios (repo de Zalcita)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SITE_URL` (= `https://zalcita.com`; dominio público para construir el
  enlace de reserva que ve el dueño. Fallback en `lib/config.ts` también a zalcita.com.)
- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`

### .htaccess (subir a mano una vez a la raíz de zalcita.com)
Regla de rewrite SPA (sirve index.html para rutas no-fichero), para que entrar
directo a una URL no dé 404:
```
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```
El flujo de cliente va por query param (`?slug=`), así que la ruta base es `/` y
el riesgo de 404 por path es bajo; el .htaccess se sube igual por seguridad.

### Estado — DESPLEGADO Y VERIFICADO EN VIVO (2026-09-30)
- [x] Website nuevo `zalcita.com` en Hostinger (tipo "Custom PHP/HTML", raíz, estático).
- [x] Cuenta FTP apuntando a `/home/u501641731/domains/zalcita.com/public_html`
  (host `ftp.zalcita.com`, user `u501641731.githubZalcitaHostingerFTP`; contraseña
  ya rotada tras el setup).
- [x] GitHub Secrets creados (los 5).
- [x] `deploy-web.yml` en el repo (OJO: la carpeta es `.github/workflows/` — el punto
  de `.github` es imprescindible; sin él GitHub no detecta el workflow). Con
  `workflow_dispatch` añadido (botón "Run workflow" para relanzar sin commit).
- [x] `.htaccess` en la raíz (borrado el `default.php` que crea Hostinger por defecto).
- [x] Primer deploy OK y **verificado en vivo por David en producción**: flujo de
  cliente por `?slug=` completo (servicios→disponibilidad→confirmar), OTP real
  llegando a inbox desde `no-reply@zalcita.com`, reserva creada (pendiente), recarga
  sin 404, cambio entre negocios, y todo probado en MÓVIL real. Web + correo + app,
  todo conectado y funcionando.

---

## 6. Pendientes de infraestructura / lanzamiento

- Rotar la anon key de Supabase (ver §4) antes del lanzamiento público.
- Negocio DEMO poblado (servicios, horarios, citas) con su slug, para el marketing.
- Verificar en el primer deploy: rutas y assets (Expo Router en web), que
  `?slug=` funciona en producción, y que el .htaccess está.
- App nativa (Play Store) = FASE 2, no lanzamiento web: deep linking (que un
  enlace con slug abra la app en el negocio), pantalla de entrada para el cliente
  sin slug en la app, build EAS, publicación. QR para descargar/abrir negocio: va
  con la app nativa.

---

## 7. Guía de usuario para negocios (PENDIENTE — tras el despliegue)

Entregable pedido por David: un documento tipo guía para los negocios que
empiecen a usar Zalcita (qué se puede hacer y cómo). Se hará CUANDO la app esté
desplegada y estable, con capturas reales de producción — escribirla antes sería
rehacerla. Anotado como entregable.
