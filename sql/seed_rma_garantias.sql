-- Seed de la tabla rma_garantias con la tabla del prototipo Flask.
-- Issue #28: "Confirmar con servicio tecnico antes de implementar: HP y EPSON
-- no estan en la tabla, cayendo al default de 12 meses."
--
-- Si servicio tecnico confirma cambios (ej. HP/Epson a 12 o 24 meses), editar
-- este archivo y re-correrlo. El INSERT usa ON DUPLICATE KEY UPDATE para
-- respetar cambios manuales que se hayan hecho en el panel.

INSERT INTO rma_garantias (marca, meses, notas) VALUES
  -- Vida util (NULL = cubierto mientras exista)
  ('ASTA', NULL, 'Vida util - cubierto mientras el producto exista'),

  -- 6 meses
  ('AEROCOOL', 6, NULL),
  ('CASIO', 6, NULL),
  ('HAVIT', 6, NULL),
  ('KINGSTON', 6, NULL),
  ('AMAZON', 6, NULL),
  ('VOYAGER', 6, NULL),
  ('GOOGLE', 6, NULL),

  -- 12 meses (default si la marca no esta en la tabla)
  ('ADATA', 12, NULL),
  ('ASUS', 12, NULL),
  ('BROTHER', 12, NULL),
  ('CANON', 12, NULL),
  ('EVGA', 12, NULL),
  ('EZVIZ', 12, NULL),
  ('HIKVISION', 12, NULL),
  ('IKEA', 12, NULL),
  ('KLIP', 12, NULL),
  ('LOGITECH', 12, NULL),
  ('MSI', 12, NULL),
  ('NEXXT', 12, NULL),
  ('NVIDIA', 12, NULL),
  ('PATRIOT', 12, NULL),
  ('SAT', 12, NULL),
  ('TARGUS', 12, NULL),
  ('TEAM', 12, NULL),
  ('TOSHIBA', 12, NULL),
  ('XEROX', 12, NULL),
  ('XIAOMI', 12, NULL),
  ('XTECH', 12, NULL),
  ('PRIMUS', 12, NULL),

  -- 24 meses
  ('SMARTBITT', 24, NULL),
  ('FORZA', 24, NULL),

  -- 36 meses
  ('LINKSYS', 36, NULL)

ON DUPLICATE KEY UPDATE
  meses = VALUES(meses),
  notas = VALUES(notas);