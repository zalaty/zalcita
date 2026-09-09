-- Migración 0011 — el dueño configura sus propias políticas de negocio
-- (cancelación y pago) desde la app, en vez de insertar filas por SQL.
-- ============================================================
-- cancellation_policies tenía RLS activado desde 0001 pero solo con
-- política de SELECT público (igual que working_hours/schedule_exceptions
-- antes de 0007) — nunca se creó la de escritura para staff. Se dejó
-- fuera de la 0008 a propósito, para hacerla ahora con la pantalla
-- delante.
--
-- Mismo patrón que "staff gestiona sus servicios" (0001) / "staff
-- gestiona horarios de su negocio" (0007): FOR ALL sin WITH CHECK
-- explícito — Postgres reutiliza el USING como WITH CHECK, ya verificado
-- en vivo para ese mismo patrón. Para el INSERT del upsert, business_id
-- (la propia PK de esta tabla) ya existe de antemano en business_members
-- del usuario que lo manda — a diferencia de businesses.id (que no puede
-- estar en business_members hasta que la propia fila businesses exista),
-- aquí no hay problema de huevo-y-gallina: el staff manda su propio
-- business.id, que YA es miembro de su negocio, así que el WITH CHECK se
-- cumple.
--
-- Se deja como FOR ALL (incluye DELETE) a propósito, sin acotar como se
-- hizo con businesses/appointments en 0008: aquella acotación existía
-- porque el DELETE ahí arrastra en cascada casi todo el negocio o el
-- historial de pagos/notificaciones. cancellation_policies es una tabla
-- hoja — nada referencia sus filas — así que borrarla solo hace que la
-- app vuelva a los valores por defecto (coalesce(...,true) ya lo
-- contempla en el trigger de 0010), sin ningún riesgo de arrastre. Mismo
-- perfil de riesgo que working_hours/schedule_exceptions, que se dejaron
-- FOR ALL sin acotar en 0007.
create policy "staff gestiona política de cancelación de su negocio" on cancellation_policies
  for all using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );
