-- Issue #32 [Seguridad 3/5] Registrar en el ticket que el equipo fue entregado.
--
-- Para bases que ya tienen `rma_cases` creada. En una base nueva no hace falta:
-- la columna ya viene en sql/rma_cases.sql.
--
-- Por que una columna y no un valor mas en el ENUM de `status`:
-- `status` guarda el DESENLACE del caso (reparado, nota_credito, no_procesado,
-- reingresado). La entrega fisica es un hecho distinto que le ocurre a
-- cualquiera de esos desenlaces — un equipo con nota de credito tambien se le
-- entrega al cliente. Si el despacho pisara `status`, el caso dejaria de decir
-- por que se cerro.
--
-- Los ALTER van separados a proposito: MySQL no soporta
-- `ADD COLUMN IF NOT EXISTS` antes de 8.0.29. Si la columna ya existe, el
-- servidor devuelve "Duplicate column name" y se puede ignorar.

ALTER TABLE rma_cases
  ADD COLUMN despachado_at DATE DEFAULT NULL AFTER notes;

ALTER TABLE rma_cases
  ADD INDEX idx_despachado (despachado_at);
