-- Corregir el rol "cuentas por cobrar" (se insertó con id=0 por error)
-- Ejecutar en MySQL

-- 1. Asignar id correcto (13, el siguiente disponible)
UPDATE roles SET id = 13 WHERE id = 0 AND name = 'cuentas por cobrar';

-- Verificar: SELECT * FROM roles ORDER BY id;
