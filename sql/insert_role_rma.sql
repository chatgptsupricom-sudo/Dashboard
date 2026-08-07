-- Script para insertar el rol RMA (Servicio Técnico) en la base de datos
-- Ejecutar en la base de datos MySQL del dashboard

-- 1. Insertar el rol en la tabla roles
-- Nota: El ID se auto-incrementa, pero se muestra el último ID conocido para referencia
-- Ajustar el ID según la base de datos actual
INSERT INTO roles (name) VALUES ('rma')
ON DUPLICATE KEY UPDATE name = 'rma';

-- 2. Verificar que el rol se insertó correctamente
SELECT id, name FROM roles WHERE name = 'rma';

-- 3. Para asignar el rol a un usuario específico, usar:
-- UPDATE users_config SET role_id = (SELECT id FROM roles WHERE name = 'rma') WHERE email = 'usuario@ejemplo.com';

-- 4. Verificar la estructura actual de la tabla roles
-- SHOW COLUMNS FROM roles;

-- 5. Ver todos los roles existentes
-- SELECT * FROM roles ORDER BY id;
