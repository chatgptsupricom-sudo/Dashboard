-- Cambia el nombre que se ve del rol Diseñador a "Diseño" (Usuarios, correo de
-- bienvenida, Manuales, Agente IA leen roles.display_name).
--
-- Solo cambia display_name: roles.name sigue siendo 'diseñador', que es lo que
-- comparan el middleware, lib/types.ts (UserRole.DISENADOR) y las APIs.
-- No hay que volver a iniciar sesión.
--
-- Para el phpMyAdmin de EasyPanel: tabla con la base delante.

-- 1. Antes
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'diseñador';

-- 2. Cambiar
UPDATE supricom_panel.roles SET display_name = 'Diseño' WHERE name = 'diseñador';

-- 3. Después (debe salir una fila con display_name = 'Diseño')
SELECT id, name, display_name FROM supricom_panel.roles WHERE name = 'diseñador';
