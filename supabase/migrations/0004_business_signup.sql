-- Alta autoservicio de negocios + infraestructura de administración de
-- plataforma. Un negocio se registra solo y entra con active=false
-- (pendiente de aprobación); el dueño puede entrar a configurarlo mientras
-- tanto, pero no puede auto-aprobarse.

-- ============================================================
-- ADMINISTRADORES DE PLATAFORMA
-- ============================================================
-- La existencia de la fila ES el permiso — sin campo is_admin. Solo se
-- escribe a mano desde el panel de Supabase (rol service_role/postgres,
-- que salta RLS); no hay política de insert/update/delete para nadie más.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- Un usuario solo puede ver si ÉL es admin, nunca la lista de admins.
create policy "usuario ve su propia fila de admin" on platform_admins
  for select using (user_id = auth.uid());

revoke all on platform_admins from anon, authenticated;
grant select on platform_admins to authenticated;

-- ============================================================
-- ADMIN GESTIONA CUALQUIER NEGOCIO
-- ============================================================
-- Hoy "staff gestiona su negocio" (0001_init.sql) solo cubre negocios
-- donde el usuario ya es business_member. Un admin de plataforma necesita
-- poder tocar cualquier negocio (para aprobarlo, desactivarlo, etc.).
create policy "admin de plataforma gestiona cualquier negocio" on businesses
  for all using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- ============================================================
-- PROTEGER businesses.active: solo un admin puede tocarlo
-- ============================================================
-- No se puede resolver por columna (grant update (col) ...) porque el
-- dueño y el admin son el MISMO rol de Postgres (authenticated) — un
-- permiso de columna no distingue quién eres, solo qué rol eres. Hace
-- falta lógica consciente de la fila/usuario: un trigger.
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
    if not exists (select 1 from platform_admins where user_id = auth.uid()) then
      raise exception 'Solo un administrador de la plataforma puede aprobar o desactivar un negocio.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_business_active
  before insert or update on businesses
  for each row
  execute function public.protect_business_active_column();

-- ============================================================
-- ALTA ATÓMICA: businesses + business_members
-- ============================================================
-- Se llama DESPUÉS de que el dueño confirme su email (ver
-- context/AuthContext.tsx, resolveRole): en ese momento ya hay sesión, así
-- que auth.uid() resuelve al usuario correcto. Nunca recibe el nombre del
-- negocio/dueño como parámetro del cliente — los lee de los metadatos del
-- propio usuario (adjuntados en el signUp original vía options.data), que
-- el cliente no puede falsear en esta llamada.
--
-- Idempotente bajo concurrencia real: pg_advisory_xact_lock serializa las
-- llamadas del MISMO usuario (dos pestañas resolviendo el rol a la vez,
-- por ejemplo) sin bloquear a otros usuarios, así que el chequeo de "ya
-- tiene negocio" que sigue siempre ve el resultado consistente de una
-- llamada anterior en vez de arriesgarse a una carrera con un insert a
-- medias.
create or replace function public.create_business_with_owner()
returns businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_name text;
  v_owner_name text;
  v_business businesses;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
begin
  if v_user_id is null then
    raise exception 'No hay sesión activa.' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Idempotente: si el usuario ya es dueño de un negocio, no crea otro.
  -- Filtra por role='owner', no por cualquier membership: alguien podría
  -- ya ser staff de otro negocio antes de registrar el suyo propio.
  select b.* into v_business
  from businesses b
  join business_members bm on bm.business_id = b.id
  where bm.user_id = v_user_id and bm.role = 'owner'
  limit 1;

  if found then
    return v_business;
  end if;

  v_business_name := nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'business_name'), '');
  v_owner_name := nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'owner_name'), '');

  if v_business_name is null or v_owner_name is null then
    raise exception 'Faltan los datos del negocio en el registro; vuelve a registrarte.'
      using errcode = '22023';
  end if;

  -- Slug único a partir del nombre, transliterando acentos/ñ comunes del
  -- español sin depender de la extensión unaccent (podría estar instalada
  -- en un esquema distinto de public y romper set search_path = public).
  v_base_slug := lower(translate(v_business_name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
  v_base_slug := trim(both '-' from regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'negocio';
  end if;

  v_slug := v_base_slug;
  while exists (select 1 from businesses where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into businesses (name, slug, timezone, payment_policy, active)
  values (v_business_name, v_slug, 'Europe/Madrid', 'none', false)
  returning * into v_business;

  insert into business_members (business_id, user_id, role, name)
  values (v_business.id, v_user_id, 'owner', v_owner_name);

  return v_business;
end;
$$;

revoke all on function public.create_business_with_owner() from public;
grant execute on function public.create_business_with_owner() to authenticated;
