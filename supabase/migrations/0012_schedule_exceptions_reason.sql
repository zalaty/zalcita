-- Migración 0012 — motivo opcional en las excepciones de horario, para
-- que el negocio pueda explicar un cierre ("Fiesta del pueblo",
-- "Vacaciones") y el cliente lo vea en disponibilidad.tsx.
--
-- Sin cambios de RLS: "staff gestiona excepciones de su negocio" (0007) y
-- "excepciones de horario son públicas" (0008) son políticas de FILA
-- completa — una columna nueva viaja automáticamente con el resto de la
-- fila, sin tocar ninguna política existente.
alter table schedule_exceptions add column reason text;
