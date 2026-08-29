-- Migración 0002 — corregir la protección contra dobles reservas
-- ============================================================
-- PROBLEMA detectado en pruebas:
-- La restricción exclude original usaba (member_id with =, ...). Como en SQL
-- NULL = NULL NO es verdadero, dos citas con member_id NULL (negocio sin
-- profesionales asignados, como la demo) nunca se consideraban solapadas, y
-- la base de datos permitía DOBLES RESERVAS a la misma hora.
--
-- SOLUCIÓN:
-- Sustituir member_id por una expresión que, cuando member_id es NULL, use el
-- business_id como "recurso" contra el que se compite. Así:
--   - Citas con profesional asignado: solo chocan entre sí si es el mismo profesional.
--   - Citas sin profesional (horario general): chocan entre sí dentro del mismo negocio.
--
-- Se usa COALESCE(member_id, business_id): si hay profesional, compite por
-- member_id; si no, compite por business_id. Ambos son uuid, así que el tipo
-- es coherente. Como business_id y member_id vienen de tablas distintas, en la
-- práctica no habrá colisión de valores entre ambos.
-- ============================================================

-- Quitar la restricción antigua (el nombre puede variar; Postgres la nombró
-- automáticamente. Si este nombre no coincide, míralo en el panel:
-- Database > Tables > appointments > Constraints, y ajusta el nombre aquí).
alter table appointments
  drop constraint if exists appointments_member_id_tstzrange_excl;

-- Por si el nombre autogenerado fue otro, intento también el patrón alternativo.
-- (Si ninguno existe, estos DROP no fallan gracias a IF EXISTS.)
alter table appointments
  drop constraint if exists appointments_exclusion;

-- Nueva restricción: usa COALESCE(member_id, business_id) como recurso.
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    (coalesce(member_id, business_id)) with =,
    tstzrange(start_time, end_time) with &&
  ) where (status in ('pending','confirmed'));

-- Comprobación: intenta ver las restricciones actuales de la tabla.
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'appointments'::regclass;
