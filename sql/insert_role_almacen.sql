-- Rol Almacen (prepara el egreso de mercancia, issue #42)
-- Ejecutar en la base MySQL del dashboard.
--
-- Almacen busca la orden de despacho en Odoo, junta las facturas del camion y
-- asigna quien lo carga (issue #43), y le entrega ese registro a Seguridad,
-- que lo verifica en el porton (issue #44). No ve RMA ni el resto de
-- Mercancia — separar quien carga el camion de quien lo verifica es el punto
-- de este rol.
--
-- OJO: para PROBAR el modulo no hace falta nada de esto. El middleware deja
-- pasar a superAdmin y el guard de las rutas de Almacen tambien admite al rol
-- `seguridad`, asi que una cuenta de Seguridad existente ya puede probar el
-- flujo de #43. Este script es para dar acceso a la persona real que carga
-- los camiones, que no debe ver el resto del panel ni la verificacion del
-- porton.
--
-- El login autentica contra ODOO y despues busca el perfil aca. La persona ya
-- tiene que existir como usuario de Odoo con su contraseña. Este script no
-- crea cuentas ni contraseñas — solo le dice al panel que rol tiene alguien
-- que Odoo ya reconoce.

-- 1. Crear el rol
--
-- INSERT ... SELECT WHERE NOT EXISTS y no ON DUPLICATE KEY UPDATE: ese solo
-- evita el duplicado si `roles.name` tiene indice unico, y si no lo tiene,
-- correr el script dos veces deja dos roles 'almacen'. A partir de ahi el
-- login resuelve el rol con el que le devuelva primero la consulta — un
-- fallo intermitente y dificil de rastrear. Mismo arreglo que se le hizo al
-- script de Seguridad en el commit 65d40d1.
INSERT INTO roles (name, display_name)
SELECT 'almacen', 'Almacén (Egresos de mercancía)'
 WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'almacen');

-- Si ya existia con otro nombre visible, se deja al dia.
UPDATE roles SET display_name = 'Almacén (Egresos de mercancía)' WHERE name = 'almacen';

-- 2. Comprobar que quedó, y que quedó UNO SOLO
SELECT COUNT(*) AS filas_esperado_1 FROM roles WHERE name = 'almacen';
SELECT id, name, display_name FROM roles WHERE name = 'almacen';

-- 3. Asignárselo a alguien que YA existe en users_config
--    (reemplazar el correo por el real)
-- UPDATE users_config
--    SET role_id = (SELECT id FROM roles WHERE name = 'almacen')
--  WHERE email = 'carga@supricom.com.ve';

-- 4. O darle perfil a alguien que existe en Odoo pero todavía no en el panel.
--    `cids` es la compañía: 9 = Valencia, 10 = Caracas, 7 = Panamá.
-- INSERT INTO users_config (email, name, role_id, cids)
-- VALUES (
--   'carga@supricom.com.ve',
--   'Nombre del almacenista',
--   (SELECT id FROM roles WHERE name = 'almacen'),
--   9
-- );

-- 5. Verificar el resultado
-- SELECT uc.email, uc.name, r.name AS rol, uc.cids
--   FROM users_config uc JOIN roles r ON uc.role_id = r.id
--  WHERE r.name = 'almacen';
