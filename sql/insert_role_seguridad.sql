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
INSERT INTO roles (name, display_name) VALUES ('seguridad', 'Seguridad (Almacén)')
ON DUPLICATE KEY UPDATE display_name = 'Seguridad (Almacén)';

-- 2. Comprobar que quedó
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
