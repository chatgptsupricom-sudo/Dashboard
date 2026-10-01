-- Agregar rol "cuentas por cobrar" a la tabla roles
-- Ejecutar en MySQL antes de asignar el rol a un usuario

INSERT INTO roles (name, display_name)
VALUES ('cuentas por cobrar', 'Cuentas por Cobrar')
ON DUPLICATE KEY UPDATE display_name = 'Cuentas por Cobrar';
