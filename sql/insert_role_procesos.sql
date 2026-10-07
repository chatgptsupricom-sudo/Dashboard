-- Rol Procesos: arma y mantiene los manuales de procedimiento (sección
-- Manuales, /manuales). Por ahora es el único rol que ve esa sección (ni el
-- SuperAdmin entra): entra directo a Manuales y crea, edita, publica y
-- elimina manuales.
--
-- Para el phpMyAdmin de EasyPanel: tablas con la base delante
-- (supricom_panel.roles) y sin information_schema.
--
-- El login autentica contra Odoo: la persona ya tiene que existir como
-- usuario de Odoo. Este script solo crea el rol; asignarlo se hace desde
-- Usuarios del SuperAdmin o con el UPDATE del paso 3.

-- 1. Crear el rol (sin duplicarlo si se corre dos veces)
INSERT INTO supricom_panel.roles (name, display_name)
SELECT 'procesos', 'Procesos'
 WHERE NOT EXISTS (SELECT 1 FROM supricom_panel.roles WHERE name = 'procesos');

-- 2. Comprobar que quedó uno solo
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'procesos';

-- 3. Asignárselo a alguien que ya existe en users_config (reemplazar el correo)
-- UPDATE supricom_panel.users_config
--    SET role_id = (SELECT id FROM supricom_panel.roles WHERE name = 'procesos')
--  WHERE email = 'correo@supricom.com.ve';
