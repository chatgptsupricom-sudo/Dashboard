-- Ejecutar una sola vez sobre instalaciones existentes de Material POP.
ALTER TABLE pop_movements
  ADD COLUMN movement_group_id CHAR(36) NULL AFTER id,
  ADD INDEX idx_group (movement_group_id);
