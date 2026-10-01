-- Ejecutar una sola vez sobre instalaciones existentes de Material POP.
ALTER TABLE pop_uoms
  ADD COLUMN allows_decimal TINYINT(1) NOT NULL DEFAULT 0 AFTER name;
