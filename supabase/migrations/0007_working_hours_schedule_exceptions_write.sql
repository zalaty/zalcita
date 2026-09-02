-- working_hours y schedule_exceptions tienen RLS activado desde
-- 0001_init.sql pero solo con política de SELECT público — nunca se creó
-- la política de escritura para staff/dueño (a diferencia de `services`,
-- que sí la tiene). Confirmado en vivo: insertar un tramo de horario
-- fallaba con 42501 "new row violates row-level security policy".
--
-- Mismo patrón que "staff gestiona sus servicios" (0001_init.sql), solo
-- con USING: para una política FOR ALL sin WITH CHECK explícito, Postgres
-- reutiliza la expresión de USING también como WITH CHECK — comportamiento
-- documentado, y ya verificado en vivo en `services`, que solo tiene
-- USING y el INSERT del dueño funciona. No hace falta duplicar la
-- expresión en un WITH CHECK aparte.
create policy "staff gestiona horarios de su negocio" on working_hours
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "staff gestiona excepciones de su negocio" on schedule_exceptions
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

-- TODO: cuando la pantalla de admin necesite ver horarios/excepciones de
-- OTROS negocios (no solo aprobar el propio, sino por ejemplo auditar la
-- configuración de un negocio pendiente), añadir aquí una política de
-- admin con is_platform_admin() — mismo patrón que en `businesses` y
-- `business_members` (0006_fix_platform_admin_rls.sql). No hace falta
-- todavía: nada en la app lee horarios de un negocio ajeno.
