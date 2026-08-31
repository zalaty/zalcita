-- Falta desde 0001_init.sql: business_members tiene RLS activado (línea
-- "alter table business_members enable row level security;") pero nunca
-- se le creó ninguna política. Con RLS activado y cero políticas, una
-- SELECT no da error — simplemente no devuelve ninguna fila, para nadie,
-- nunca. Solo se usaba hasta ahora como subconsulta dentro de políticas de
-- OTRAS tablas (businesses, services, clients, appointments), así que el
-- agujero pasó desapercibido: nadie hacía SELECT directo sobre la tabla en
-- sí. Eso cambió con BusinessContext (y ya afectaba, sin que se notara, a
-- AuthContext.resolveRole, que también lee business_members directamente).
--
-- Solo política de SELECT: la creación de membresías sigue pasando
-- exclusivamente por create_business_with_owner (security definer, salta
-- RLS) — no se abre insert/update/delete a authenticated aquí.
create policy "usuario ve sus propias membresías" on business_members
  for select using (user_id = auth.uid());

-- Un admin de plataforma necesitará ver membresías de cualquier negocio
-- para la futura pantalla de aprobación — mismo patrón que la política de
-- admin sobre `businesses` (0004_business_signup.sql).
create policy "admin de plataforma ve cualquier membresía" on business_members
  for select using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );
