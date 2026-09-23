-- Ejecutar una sola vez sobre instalaciones existentes de Material POP.
ALTER TABLE pop_products
  ADD COLUMN brand VARCHAR(100) NULL AFTER uom_id;
