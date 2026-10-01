-- issue #131: peso del KPI para el puntaje ponderado del grupo del Stoplight.
-- Antes estaba hardcodeado en components/superadmin/StoplightReport.tsx.
-- 0 = usar el fallback hardcodeado (comportamiento previo).
--
-- Los routes del Stoplight corren este ALTER solos (lib/kpiTargets.ts), así que
-- este archivo es solo para dejar el cambio documentado / correrlo a mano.
ALTER TABLE kpi_targets ADD COLUMN peso DECIMAL(5,2) NOT NULL DEFAULT 0;
