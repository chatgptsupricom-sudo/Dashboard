-- Rol Inteligencia de Negocio (BI): ve los tableros del panel con la data de
-- las tres sedes (Panamá 7, Valencia 9, Caracas 10) y no cambia nada.
-- Lo usa Wilker Escalona (Odoo: wilker.escalona@supricom.com.ve, uid 495).
--
-- Secciones: Dashboard, Actividades, Stoplight Report, Inventario, Agente IA,
-- los desplegables Leads / Ventas / Marketing y, de Cuentas por Cobrar,
-- Contado/Crédito, Incobrables, Tiempo de Cobro y Sobregiro
-- (lib/types.ts, lib/auth/inteligenciaNegocio.ts).
--
-- El nombre del rol tiene que ser exactamente 'inteligencia de negocio'
-- (minúsculas): es el que comparan el middleware, el menú y las APIs.
--
-- Para el phpMyAdmin de EasyPanel: tablas con la base delante
-- (supricom_panel.roles) y sin information_schema.
--
-- El login autentica contra Odoo: la persona ya tiene que existir como
-- usuario de Odoo y tener su fila en users_config.

-- 1. Crear el rol (sin duplicarlo si se corre dos veces)
INSERT INTO supricom_panel.roles (name, display_name)
SELECT 'inteligencia de negocio', 'Inteligencia de Negocio'
 WHERE NOT EXISTS (SELECT 1 FROM supricom_panel.roles WHERE name = 'inteligencia de negocio');

-- 2. Comprobar que quedó uno solo
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'inteligencia de negocio';

-- 3. Ver qué rol tiene hoy Wilker ANTES de cambiarlo (se reemplaza: deja de
--    ver lo que le daba su rol anterior). Si no sale ninguna fila, todavía no
--    está en users_config: hay que darlo de alta en Usuarios primero.
SELECT uc.id, uc.email, uc.name, r.name AS rol_actual, uc.cids
  FROM supricom_panel.users_config uc
  LEFT JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'wilker.escalona@supricom.com.ve';

-- 4. Asignarle el rol, sin sede: ve las tres, como el SuperAdmin (Usuarios
--    tampoco le pide ciudad a este rol).
UPDATE supricom_panel.users_config
   SET role_id = (SELECT id FROM (SELECT id FROM supricom_panel.roles WHERE name = 'inteligencia de negocio') AS r),
       cids = NULL
 WHERE email = 'wilker.escalona@supricom.com.ve';

-- 5. Comprobar
SELECT uc.email, r.name AS rol, uc.cids FROM supricom_panel.users_config uc
  JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'wilker.escalona@supricom.com.ve';
