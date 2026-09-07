-- Migración 0010 — el cliente puede cancelar (SOLO cancelar) su propia
-- cita, cerrando el hueco que se dejó a propósito en 0008.
-- ============================================================
-- Una política UPDATE ingenua ("cliente actualiza su cita") le dejaría
-- marcarse una cita como completed, tocar el precio, el servicio o la
-- hora, con tal de que el WITH CHECK final le pareciera aceptable: RLS
-- solo evalúa la forma de la fila resultante, nunca qué columnas
-- concretas cambiaron. Por eso esto son DOS capas, no una:
--   - La política RLS acota la forma final (ownership + status='cancelled').
--   - Un trigger compara columna por columna contra la fila anterior y
--     rechaza cualquier cambio que no sea exactamente
--     pending/confirmed -> cancelled tocando solo
--     status/cancelled_at/cancellation_reason.
-- ============================================================

create policy "cliente cancela su propia cita" on appointments
  for update
  using (
    client_id in (select id from clients where auth_user_id = auth.uid())
  )
  with check (
    client_id in (select id from clients where auth_user_id = auth.uid())
    and status = 'cancelled'
  );

create or replace function public.enforce_client_cancel_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El staff no está sujeto a nada de esto: sigue teniendo total libertad
  -- sobre las citas de su negocio vía "staff actualiza citas de su
  -- negocio" (0008). Esta comprobación es solo para lo único que un
  -- CLIENTE puede llegar a tocar: su propia cita, vía la política de
  -- arriba. Trigger independiente de check_appointment_overlap (0009) a
  -- propósito: ese ya está verificado en vivo, mejor no arriesgarlo.
  if exists (
    select 1 from business_members
    where business_id = new.business_id and user_id = auth.uid()
  ) then
    return new;
  end if;

  if old.status not in ('pending', 'confirmed') or new.status <> 'cancelled' then
    raise exception 'Solo se puede cancelar una cita pendiente o confirmada.'
      using errcode = '42501';
  end if;

  -- El corazón del asunto: ninguna otra columna puede cambiar. status,
  -- cancelled_at y cancellation_reason son las únicas que se dejan tocar
  -- (cancellation_reason no la usa todavía la pantalla de "mis citas",
  -- pero no hay motivo para bloquearla de cara a cuando se capture un
  -- motivo de cancelación).
  if new.business_id is distinct from old.business_id
     or new.client_id is distinct from old.client_id
     or new.service_id is distinct from old.service_id
     or new.member_id is distinct from old.member_id
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.price_at_booking is distinct from old.price_at_booking
     or new.payment_status is distinct from old.payment_status
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'No se puede modificar ningún otro dato de la cita al cancelarla.'
      using errcode = '42501';
  end if;

  -- allow_client_cancellation, también a nivel de BD: dejarla solo en la
  -- UI sería la única excepción incoherente en todo este trabajo (la BD
  -- es el límite real) y un cliente podría saltársela llamando a la API
  -- directamente. Si el negocio todavía no tiene fila en
  -- cancellation_policies (no existe pantalla para crearla todavía), se
  -- asume permitido — mismo default que la propia columna
  -- (`not null default true`).
  --
  -- min_hours_notice NO se comprueba aquí a propósito: fuera de plazo se
  -- permite cancelar igual (con aviso en la UI, posible penalización según
  -- la política) — bloquearlo en BD contradiría ese requisito de producto.
  if not coalesce(
    (select allow_client_cancellation from cancellation_policies where business_id = new.business_id),
    true
  ) then
    raise exception 'Este negocio no permite cancelar citas desde la app; contacta con él directamente.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_client_cancel_only
  before update on appointments
  for each row
  execute function public.enforce_client_cancel_only();
