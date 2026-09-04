-- Migración 0009 — el dueño puede crear/mover citas que solapen (con
-- aviso ya mostrado en la app), sin perder la protección de doble reserva
-- para clientes.
-- ============================================================
-- La restricción exclude original (0002) es simétrica y se basa en datos
-- ya guardados en la fila, no en quién ejecuta la escritura ahora mismo.
-- No puede expresar "el cliente no puede solapar a nadie, pero el dueño
-- puede solapar a cualquiera" — y una versión acotada por
-- created_by='client' falla en cuanto el dueño MUEVE una cita creada
-- originalmente por un cliente (created_by es un dato histórico que no
-- cambia al mover: seguiría bloqueando al dueño el solape que se supone
-- que puede forzar). Se sustituye por un trigger, que sí puede razonar
-- sobre "quién escribe ahora" en vez de "qué dice la fila".
-- ============================================================

alter table appointments
  drop constraint if exists appointments_no_overlap;

create or replace function public.check_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource uuid := coalesce(new.member_id, new.business_id);
  v_conflict boolean;
begin
  -- El staff/dueño del negocio puede solapar a propósito (la app ya avisa
  -- antes de confirmar). Se decide por quién ejecuta la escritura AHORA,
  -- no por new.created_by: si se mirase created_by, cuando el dueño mueve
  -- una cita creada originalmente por un cliente (created_by sigue siendo
  -- 'client', es un dato histórico que no se toca al mover) esta
  -- comprobación seguiría aplicándose y le bloquearía el solape que
  -- debería poder forzar.
  if exists (
    select 1 from business_members
    where business_id = new.business_id and user_id = auth.uid()
  ) then
    return new;
  end if;

  -- Una cita cancelada/completada/no-show no ocupa hueco: nada que
  -- comprobar (mismo alcance que el WHERE del exclude original).
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;

  -- Serializa las comprobaciones concurrentes sobre el MISMO recurso
  -- (profesional, o negocio si no hay profesional asignado) — mismo
  -- patrón que create_business_with_owner (0004) usa para evitar
  -- condiciones de carrera sin bloquear a quien reserva en otro recurso.
  perform pg_advisory_xact_lock(hashtext(v_resource::text));

  select exists (
    select 1 from appointments a
    where a.id <> new.id
      and coalesce(a.member_id, a.business_id) = v_resource
      and a.status in ('pending', 'confirmed')
      and tstzrange(a.start_time, a.end_time) && tstzrange(new.start_time, new.end_time)
  ) into v_conflict;

  if v_conflict then
    -- Mismo código que ya lanzaba el exclude constraint (exclusion_violation):
    -- confirmacion.tsx ya sabe interpretar 23P01 como "esa hora se acaba
    -- de ocupar" y no hace falta tocar ese manejo.
    raise exception 'Esa hora ya está ocupada.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create trigger trg_check_appointment_overlap
  before insert or update on appointments
  for each row
  execute function public.check_appointment_overlap();
