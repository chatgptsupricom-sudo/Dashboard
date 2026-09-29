-- ============================================================
-- METODO DE RETIRO: RUTAS Y AGENCIAS DE PANAMA (sede 7)
--
-- Hasta ahora las rutas (rma_rutas_despacho) y las agencias
-- (rma_agencias_envio) eran una sola lista para todas las sedes, y todas de
-- Venezuela. Con esto cada fila dice de que sede es:
--   cids NULL = las de siempre (Venezuela: Valencia y Caracas). Las sigue
--               usando el portal de RMA sin cambios.
--   cids 7    = Panama. Solo le aparecen a los pedidos de Panama en
--               "Metodo de retiro".
--
-- Datos de Panama (Gabriel Camacho, 29/9/2026):
--  - Rutas: Ciudad de Panama (minimo 200 $ sin ITBMS para ruta gratis) y
--    viaje a Colon y a La Chorrera (2.500 $). Por debajo del minimo igual va
--    por ruta, pero el flete lo paga el cliente (lib/ventas/metodoRetiroTipos).
--    El minimo sale del NOMBRE de la ruta ("Colon" / "Chorrera"): si se
--    renombran, que lo sigan diciendo.
--  - Encomienda al interior: Fletes Chavales, Flete Express, RedServi,
--    Red and Blue. Encomienda local: Pedidos Ya, ASAP, Uber, Motorizado
--    privado. Cualquier otra se escribe con "Otra...".
--
-- Hasta que se corra, Panama ve la lista de Venezuela como antes.
--
-- Escrito para el phpMyAdmin de EasyPanel (produccion): las tablas llevan el
-- nombre de la base delante y no se usa information_schema. Si la base no se
-- llama `supricom_panel`, reemplaza ese nombre en todo el archivo.
--
-- ANTES DE CORRERLO, mira si ya esta aplicado:
--   SHOW COLUMNS FROM supricom_panel.rma_rutas_despacho LIKE 'cids';
--   SHOW COLUMNS FROM supricom_panel.rma_agencias_envio LIKE 'cids';
-- Si las dos devuelven una fila, ya se corrio: no lo vuelvas a correr (los
-- INSERT duplicarian las rutas y agencias de Panama).
-- ============================================================

ALTER TABLE supricom_panel.rma_rutas_despacho
  ADD COLUMN cids INT DEFAULT NULL;

ALTER TABLE supricom_panel.rma_agencias_envio
  ADD COLUMN cids INT DEFAULT NULL;

INSERT INTO supricom_panel.rma_rutas_despacho (nombre, cids) VALUES
  ('Ciudad de Panamá', 7),
  ('Colón', 7),
  ('La Chorrera', 7);

INSERT INTO supricom_panel.rma_agencias_envio (nombre, cids) VALUES
  ('Fletes Chavales', 7),
  ('Flete Express', 7),
  ('RedServi', 7),
  ('Red and Blue', 7),
  ('Pedidos Ya', 7),
  ('ASAP', 7),
  ('Uber', 7),
  ('Motorizado privado', 7);

-- Comprobacion: las dos columnas existen y Panama tiene 3 rutas y 8 agencias.
SHOW COLUMNS FROM supricom_panel.rma_rutas_despacho LIKE 'cids';
SHOW COLUMNS FROM supricom_panel.rma_agencias_envio LIKE 'cids';
SELECT id, nombre, cids FROM supricom_panel.rma_rutas_despacho WHERE cids = 7;
SELECT id, nombre, cids FROM supricom_panel.rma_agencias_envio WHERE cids = 7;
