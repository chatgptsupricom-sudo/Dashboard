-- ============================================================
-- PERSONAL DE SEGURIDAD: CLAVE PERSONAL PARA FIRMAR
--
-- En el despacho de mercancia, Seguridad firma el acta con su clave personal
-- (4 a 6 digitos) en vez de dibujar la firma. Cada persona la registra en
-- "Personal de Seguridad". Se guarda SOLO el hash (bcrypt), nunca la clave.
-- Ver lib/seguridad/clavePersonal.ts.
--
-- El panel agrega la columna solo si falta (asegurarColumnaClave). Este
-- script es por si se prefiere hacerlo a mano en el phpMyAdmin de EasyPanel:
-- tabla con la base delante y sin information_schema.
--
-- ANTES DE CORRERLO, mira si ya esta:
--   SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_personal LIKE 'clave_hash';
-- Si devuelve una fila, ya esta: no lo corras (fallaria con #1060).
-- ============================================================

ALTER TABLE supricom_panel.seguridad_catalogo_personal
  ADD COLUMN clave_hash VARCHAR(100) DEFAULT NULL;

-- Comprobacion: tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.seguridad_catalogo_personal LIKE 'clave_hash';
