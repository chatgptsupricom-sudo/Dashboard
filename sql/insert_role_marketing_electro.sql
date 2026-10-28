-- Rol Marketing y Electrodomésticos: gerente de la línea de electrodomésticos
-- que apoya a Marketing en el desarrollo de marcas (lib/auth/marketingElectro.ts).
-- Solo lee. Entra a /marketing_electrodomesticos y ve:
--   Ventas por marca e Inventario (de SUS marcas), Mayor/Menor rotación y
--   Tendencia de ventas (Compras), Catálogo, Actividades, Plan de Contenido,
--   Banco de Flyers, Material POP, Metas y Stock por marca, Opiniones y
--   Mapa de clientes.
--
-- Qué marcas lleva NO lo da el rol: lo asigna el SuperAdmin en Gerencia de
-- Marca > Configuración (/gerente_marca/configuracion), por correo, igual que
-- a un Gerente de Marca. Sin marcas asignadas, Ventas e Inventario salen vacíos.
--
-- El Catálogo y Opiniones usan la sede de su cids: asignarle ciudad en Usuarios.
--
-- Para el phpMyAdmin de EasyPanel: tablas con la base delante
-- (supricom_panel.roles) y sin information_schema.
--
-- El login autentica contra Odoo: la persona ya tiene que existir como
-- usuario de Odoo. Reemplazar CORREO_DEL_GERENTE por su correo.

-- 1. Crear el rol (sin duplicarlo si se corre dos veces)
INSERT INTO supricom_panel.roles (name, display_name)
SELECT 'marketing y electrodomesticos', 'Marketing y Electrodomésticos'
 WHERE NOT EXISTS (SELECT 1 FROM supricom_panel.roles WHERE name = 'marketing y electrodomesticos');

-- 2. Comprobar que quedó uno solo
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'marketing y electrodomesticos';

-- 3. Ver qué rol tiene hoy la persona ANTES de cambiarlo (se reemplaza:
--    deja de ver lo que le daba su rol anterior)
SELECT uc.id, uc.email, uc.name, r.name AS rol_actual, uc.cids
  FROM supricom_panel.users_config uc
  LEFT JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'CORREO_DEL_GERENTE';

-- 4. Asignarle el rol (también se puede desde SuperAdmin > Usuarios)
UPDATE supricom_panel.users_config
   SET role_id = (SELECT id FROM (SELECT id FROM supricom_panel.roles WHERE name = 'marketing y electrodomesticos') AS r)
 WHERE email = 'CORREO_DEL_GERENTE';

-- 5. Comprobar
SELECT uc.email, r.name AS rol, uc.cids FROM supricom_panel.users_config uc
  JOIN supricom_panel.roles r ON r.id = uc.role_id
 WHERE uc.email = 'CORREO_DEL_GERENTE';
