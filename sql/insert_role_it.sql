-- Rol IT: por ahora su trabajo en el panel es preaprobar notas de credito
-- (/notas-credito). Lo usa Rangel Hernandez.
--
-- El rol solo le da el menu y el inicio en Notas de credito. Lo que puede
-- hacer ahi lo decide la pestana Responsables de esa pantalla (tabla
-- nc_aprobadores, por correo): Rangel ya esta como "preaprueba" en Valencia
-- (lib/notas-credito/datos.ts).
--
-- Para el phpMyAdmin de EasyPanel: tablas con la base delante
-- (supricom_panel.roles) y sin information_schema.
--
-- El login autentica contra Odoo: la persona ya tiene que existir como
-- usuario de Odoo.

-- 1. Crear el rol (sin duplicarlo si se corre dos veces)
INSERT INTO supricom_panel.roles (name, display_name)
SELECT 'it', 'IT'
 WHERE NOT EXISTS (SELECT 1 FROM supricom_panel.roles WHERE name = 'it');

-- 2. Comprobar que quedo uno solo
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'it';

-- 3. Ver que rol tiene hoy Rangel ANTES de cambiarlo (se reemplaza: deja de
--    ver lo que le daba su rol anterior)
SELECT uc.id, uc.email, uc.name, r.name AS rol_actual, uc.cids
  FROM supricom_panel.users_config uc
  LEFT JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'rangel.hernandez@supricom.com.ve';

-- 4. Asignarle el rol IT
UPDATE supricom_panel.users_config
   SET role_id = (SELECT id FROM (SELECT id FROM supricom_panel.roles WHERE name = 'it') AS r)
 WHERE email = 'rangel.hernandez@supricom.com.ve';

-- 5. Comprobar
SELECT uc.email, r.name AS rol FROM supricom_panel.users_config uc
  JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'rangel.hernandez@supricom.com.ve';
