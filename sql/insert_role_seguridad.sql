-- Rol Seguridad (Almacén / Recepción y despacho de RMA)
-- Ejecutar en la base MySQL del dashboard.
--
-- OJO: para PROBAR el módulo no hace falta nada de esto. El middleware deja
-- pasar a superAdmin y el sidebar le muestra la entrada, así que se entra con
-- una cuenta de superadmin existente. Esto es para dar acceso al personal de
-- almacén, que no debe ver el resto del panel.
--
-- El login autentica contra ODOO y después busca el perfil acá. Es decir: la
-- persona ya tiene que existir como usuario de Odoo con su contraseña. Este
-- script no crea cuentas ni contraseñas — solo le dice al panel qué rol tiene
-- alguien que Odoo ya reconoce.

-- 1. Crear el rol
--
-- Con INSERT ... SELECT WHERE NOT EXISTS y no con ON DUPLICATE KEY UPDATE:
-- ese solo evita el duplicado si `roles.name` tiene indice unico, y si no lo
-- tiene, correr el script dos veces deja dos roles 'seguridad'. A partir de
-- ahi el login resuelve el rol con el que le devuelva primero la consulta —
-- un fallo intermitente y dificil de rastrear.
INSERT INTO roles (name, display_name)
SELECT 'seguridad', 'Seguridad (Almacén)'
 WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'seguridad');

-- Si ya existia con otro nombre visible, se deja al dia.
UPDATE roles SET display_name = 'Seguridad (Almacén)' WHERE name = 'seguridad';

-- 2. Comprobar que quedó, y que quedó UNO SOLO
SELECT COUNT(*) AS filas_esperado_1 FROM roles WHERE name = 'seguridad';
SELECT id, name, display_name FROM roles WHERE name = 'seguridad';

-- 3. Asignárselo a alguien que YA existe en users_config
--    (reemplazar el correo por el real)
-- UPDATE users_config
--    SET role_id = (SELECT id FROM roles WHERE name = 'seguridad')
--  WHERE email = 'almacen@supricom.com.ve';

-- 4. O darle perfil a alguien que existe en Odoo pero todavía no en el panel.
--    `cids` es la compañía: 9 = Valencia, 10 = Caracas, 7 = Panamá.
-- INSERT INTO users_config (email, name, role_id, cids)
-- VALUES (
--   'almacen@supricom.com.ve',
--   'Nombre del almacenista',
--   (SELECT id FROM roles WHERE name = 'seguridad'),
--   9
-- );

-- 5. Verificar el resultado
-- SELECT uc.email, uc.name, r.name AS rol, uc.cids
--   FROM users_config uc JOIN roles r ON uc.role_id = r.id
--  WHERE r.name = 'seguridad';
