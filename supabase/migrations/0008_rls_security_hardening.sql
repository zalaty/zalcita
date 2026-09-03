-- Migración 0008 — cierre de hallazgos de la auditoría RLS
-- ============================================================
-- Cierra solo los hallazgos de riesgo presente o independientes de una
-- pantalla todavía por construir. Deliberadamente fuera de esta migración
-- (queda para cuando se construya cada pantalla):
--   - UPDATE de cliente sobre sus propias citas (cancelar) -> "mis citas"
--   - UPDATE/anonimización de cliente sobre su ficha -> perfil de cliente
--   - Gestión de equipo en business_members -> invitar/quitar staff
--   - Escritura de cancellation_policies -> pantalla de políticas
--   - DELETE de `services` (mitigado por on delete restrict desde
--     appointments; riesgo menor, se deja para más adelante)
-- ============================================================


-- ============================================================
-- 1) businesses: quitar DELETE al staff
-- ============================================================
-- "staff gestiona su negocio" era FOR ALL: cualquier staff (no solo el
-- owner) podía hacer DELETE directo vía API. businesses tiene FKs on
-- delete cascade desde business_members, services, clients,
-- working_hours, schedule_exceptions, cancellation_policies y
-- appointments (y desde ahí, en cascada, payments/notifications_log) — un
-- único DELETE se llevaría el negocio entero. Se sustituye por 3
-- políticas con la MISMA condición que antes, así que SELECT/INSERT/
-- UPDATE no cambian en nada, solo desaparece el DELETE.
--
-- El INSERT se mantiene por paridad con la política original, aunque en
-- la práctica nunca se satisface por sí solo: un negocio nuevo solo se
-- crea vía create_business_with_owner() (security definer, salta RLS), y
-- el id de un negocio recién insertado no puede estar ya en
-- business_members. No abre nada nuevo, así que es seguro dejarlo.
--
-- La columna `active` sigue protegida por el trigger
-- trg_protect_business_active (0004/0006) — no se toca aquí.
--
-- El admin conserva DELETE: "admin de plataforma gestiona cualquier
-- negocio" (0006) sigue siendo FOR ALL, no se toca en esta migración.
drop policy "staff gestiona su negocio" on businesses;

create policy "staff ve su negocio" on businesses
  for select using (
    id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff crea su negocio" on businesses
  for insert with check (
    id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff actualiza su negocio" on businesses
  for update using (
    id in (select business_id from business_members where user_id = auth.uid())
  );


-- ============================================================
-- 2) appointments: quitar DELETE al staff
-- ============================================================
-- Mismo problema: "staff gestiona citas de su negocio" era FOR ALL, y
-- payments/notifications_log referencian appointment_id con on delete
-- cascade — un DELETE de staff se llevaría el historial de pagos y
-- notificaciones de esa cita. Se sustituye por 3 políticas con la MISMA
-- condición que antes:
--   - SELECT: sigue viendo las citas de su negocio.
--   - INSERT: sigue pudiendo crear citas para su negocio (reserva manual,
--     TODO ya anotado en calendario.tsx) — a diferencia de businesses,
--     aquí SÍ es alcanzable: business_id referencia un negocio ya
--     existente del que el staff ya es miembro.
--   - UPDATE: sigue pudiendo cambiar el estado (confirmar/cancelar/
--     completar/no-show) — el USING se reutiliza como WITH CHECK igual
--     que antes, así que las 4 transiciones ya verificadas en vivo sobre
--     calendario.tsx no cambian en nada.
--
-- Las políticas de cliente ("cliente ve sus propias citas", "cliente crea
-- sus propias citas") no se tocan. No existe ninguna política de admin
-- sobre appointments (ni antes ni después) — fuera de este hallazgo.
drop policy "staff gestiona citas de su negocio" on appointments;

create policy "staff ve citas de su negocio" on appointments
  for select using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff crea citas en su negocio" on appointments
  for insert with check (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff actualiza citas de su negocio" on appointments
  for update using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );


-- ============================================================
-- 3) payments: solo lectura (RLS activado sin ninguna política -> hoy
--    bloqueado en silencio para todo el mundo, ni el propio dueño ve sus
--    cobros)
-- ============================================================
-- Sin políticas de escritura a propósito: el estado del pago lo fijará el
-- webhook de Stripe corriendo con service_role (salta RLS por completo)
-- cuando se construya esa integración. Un insert/update para
-- authenticated dejaría que cliente o staff se inventaran su propio
-- estado de pago.
--
-- Las subconsultas a `appointments` no rompen por RLS (a diferencia del
-- bug de 0006 con platform_admins, que venía de un revoke de grants a
-- nivel de tabla, no de RLS en sí): la condición que se repite aquí es la
-- misma que ya usan "staff ve citas de su negocio" / "cliente ve sus
-- propias citas", así que el filtro de appointments no resta ninguna fila
-- que no restaría ya mi propio WHERE.
create policy "staff ve pagos de las citas de su negocio" on payments
  for select using (
    exists (
      select 1 from appointments a
      where a.id = payments.appointment_id
        and a.business_id in (select business_id from business_members where user_id = auth.uid())
    )
  );

create policy "cliente ve sus propios pagos" on payments
  for select using (
    exists (
      select 1 from appointments a
      where a.id = payments.appointment_id
        and a.client_id in (select id from clients where auth_user_id = auth.uid())
    )
  );


-- ============================================================
-- 4) notifications_log: solo lectura para staff (mismo bloqueo silencioso
--    que payments)
-- ============================================================
-- Sin política de cliente por ahora: ninguna pantalla la necesita todavía
-- y no es un hallazgo de riesgo — queda aplazado igual que el resto de lo
-- que se deja fuera de esta migración. Sin escritura, mismo motivo que
-- payments: la generará una Edge Function con service_role.
--
-- appointment_id y client_id son ambos NULLABLE en este esquema, así que
-- se comprueba cualquiera de los dos caminos que exista.
create policy "staff ve notificaciones de su negocio" on notifications_log
  for select using (
    (
      client_id is not null
      and exists (
        select 1 from clients c
        where c.id = notifications_log.client_id
          and c.business_id in (select business_id from business_members where user_id = auth.uid())
      )
    )
    or (
      appointment_id is not null
      and exists (
        select 1 from appointments a
        where a.id = notifications_log.appointment_id
          and a.business_id in (select business_id from business_members where user_id = auth.uid())
      )
    )
  );


-- ============================================================
-- 5) services / working_hours / schedule_exceptions: el acceso público
--    debe exigir también que el negocio padre esté active=true
-- ============================================================
-- Hoy los datos de un negocio aún pendiente de aprobación son legibles
-- vía API directa aunque la app nunca los muestre. El staff conserva
-- acceso completo a lo suyo pase lo que pase: no se tocan
-- "staff gestiona sus servicios" (0001) ni "staff gestiona horarios de su
-- negocio" / "staff gestiona excepciones de su negocio" (0007).
--
-- Mismo patrón que ya usa get_business_busy_slots (0003) para esta misma
-- comprobación.
drop policy "servicios activos son públicos" on services;
create policy "servicios activos son públicos" on services
  for select using (
    active = true
    and exists (select 1 from businesses b where b.id = services.business_id and b.active = true)
  );

drop policy "horarios son públicos" on working_hours;
create policy "horarios son públicos" on working_hours
  for select using (
    exists (select 1 from businesses b where b.id = working_hours.business_id and b.active = true)
  );

drop policy "excepciones de horario son públicas" on schedule_exceptions;
create policy "excepciones de horario son públicas" on schedule_exceptions
  for select using (
    exists (select 1 from businesses b where b.id = schedule_exceptions.business_id and b.active = true)
  );
