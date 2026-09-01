-- Corrige un bug de RLS: evaluar la política de admin en `businesses`
-- (0004) requiere leer platform_admins, pero el rol anon (cliente sin
-- sesión) no tiene NINGÚN permiso sobre esa tabla — ni siquiera para que
-- Postgres pueda intentar la subconsulta. El resultado no es "0 filas", es
-- un permission denied que revienta TODA la consulta a businesses,
-- incluida la política pública ("negocios activos son públicos") que sí
-- debería aplicar. Postgres evalúa TODAS las políticas permisivas
-- aplicables a una operación; si evaluar cualquiera de ellas falla con un
-- error de permisos, la consulta entera falla, aunque otra política sí
-- concediera acceso.
--
-- is_platform_admin() encapsula la comprobación en una función SECURITY
-- DEFINER: se ejecuta con los permisos de su propietario (el rol de las
-- migraciones), así que lee platform_admins saltándose los grants del rol
-- que llama. anon/authenticated solo necesitan permiso para EJECUTAR la
-- función, nunca para leer la tabla en sí — mismo patrón que ya usaba
-- protect_business_active_column para esto mismo, ahora factorizado para
-- no duplicar la lógica en tres sitios distintos.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated;

-- businesses: la política de admin pasa a usar is_platform_admin() en vez
-- del exists(...) directo, que exigía permiso de lectura sobre
-- platform_admins al rol que consulta (roto para anon).
drop policy "admin de plataforma gestiona cualquier negocio" on businesses;
create policy "admin de plataforma gestiona cualquier negocio" on businesses
  for all using (public.is_platform_admin());

-- business_members: mismo problema latente (0005_business_members_select.sql).
-- No se había disparado porque nada consultaba esa tabla de forma anónima
-- todavía, pero habría reventado igual en cuanto algo lo hiciera.
drop policy "admin de plataforma ve cualquier membresía" on business_members;
create policy "admin de plataforma ve cualquier membresía" on business_members
  for select using (public.is_platform_admin());

-- protect_business_active_column: no tenía este bug (ya era security
-- definer, así que su exists(...) interno ya funcionaba para cualquier
-- rol), pero se reescribe para usar is_platform_admin() en vez de
-- duplicar la comprobación — una sola fuente de verdad, para que nadie
-- vuelva a copiar el exists(...) directo en una política nueva sin darse
-- cuenta de este problema.
create or replace function public.protect_business_active_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.active)
     or (tg_op = 'UPDATE' and new.active is distinct from old.active)
  then
    if not public.is_platform_admin() then
      raise exception 'Solo un administrador de la plataforma puede aprobar o desactivar un negocio.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
