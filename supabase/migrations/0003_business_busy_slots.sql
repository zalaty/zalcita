-- Función de solo lectura para calcular disponibilidad sin exponer citas
-- ajenas. La política RLS "cliente ve sus propias citas" (0001_init.sql)
-- solo deja leer appointments propias; la pantalla de disponibilidad
-- necesita saber qué horas están ocupadas para TODO el negocio, sin
-- filtrar por client_id/service_id ni ningún otro dato de la cita.
--
-- security definer: se ejecuta con los permisos del propietario de la
-- función (el rol de las migraciones, dueño de `appointments`), así que
-- por dentro puede ver todas las citas del negocio saltándose el RLS de
-- "cliente ve sus propias citas" — pero solo devuelve start_time/end_time,
-- nunca client_id, service_id, member_id ni ningún otro campo.
--
-- p_business_id es un parámetro obligatorio: no existe forma de llamar a
-- esta función sin acotarla a un negocio concreto, así que es
-- estructuralmente imposible mezclar la agenda de un negocio con la de otro.
create or replace function public.get_business_busy_slots(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (start_time timestamptz, end_time timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select a.start_time, a.end_time
  from appointments a
  where a.business_id = p_business_id
    and a.status in ('pending', 'confirmed')
    and a.start_time < p_to
    and a.end_time > p_from
    -- solo negocios activos, igual que ya exige la política de `businesses`
    and exists (
      select 1 from businesses b where b.id = p_business_id and b.active = true
    );
$$;

-- Solo se puede EJECUTAR (no hay SELECT directo a appointments); tanto
-- clientes sin sesión como logueados pueden consultar disponibilidad,
-- igual que ya pasa con working_hours/schedule_exceptions (ver 0001_init.sql).
revoke all on function public.get_business_busy_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_business_busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
