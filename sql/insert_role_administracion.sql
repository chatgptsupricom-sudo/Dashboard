-- Script para insertar el rol Administración (Salud Financiera)
-- Ejecutar en la base de datos MySQL del dashboard

-- 1. Insertar el rol en la tabla roles
INSERT INTO roles (name, display_name) VALUES ('administración', 'Administración')
ON DUPLICATE KEY UPDATE display_name = 'Administración';

-- 2. Verificar
SELECT id, name FROM roles WHERE name = 'administración';

-- 3. Para asignar a un usuario:
-- UPDATE users_config SET role_id = (SELECT id FROM roles WHERE name = 'administración') WHERE email = 'usuario@ejemplo.com';
