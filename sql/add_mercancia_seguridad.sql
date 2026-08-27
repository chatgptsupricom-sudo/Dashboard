-- ============================================================
-- Seccion Mercancia del modulo Seguridad.
--
-- Es un flujo distinto al de RMA. RMA es el equipo de UN cliente que entra a
-- reparacion y vuelve a salir. Mercancia es la carga de un camion: el
-- almacenista carga contra una orden de entrega de Odoo, y Seguridad verifica
-- en el porton que lo que sale es lo que se cargo.
--
-- Se puede correr varias veces sin romper nada.
-- ============================================================


-- Movimiento de mercancia: un ingreso (llega al almacen) o un egreso (sale en
-- camion). Los dos comparten tabla porque comparten acta, firmas y
-- calificacion; los distingue `tipo`.
CREATE TABLE IF NOT EXISTS seguridad_mercancia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('ingreso','egreso') NOT NULL,
  fecha DATE NOT NULL,

  -- Orden de entrega de Odoo (stock.picking). La lista de lo que deberia ir
  -- en el camion sale de ahi, no de lo que alguien escriba a mano.
  odoo_picking_id INT DEFAULT NULL,
  odoo_picking_name VARCHAR(100) DEFAULT NULL,
  cliente_nombre VARCHAR(200) DEFAULT NULL,

  -- Quien carga el camion. Es a quien se califica.
  almacenista_nombre VARCHAR(200) NOT NULL,
  -- Quien conduce y que vehiculo: sin esto, un descuadre no se le puede
  -- atribuir a nadie una semana despues.
  chofer_nombre VARCHAR(200) DEFAULT NULL,
  placa_vehiculo VARCHAR(50) DEFAULT NULL,

  -- Resultado de la verificacion en el porton.
  --   pendiente = cargado, todavia sin verificar
  --   conforme  = lo verificado coincide con lo cargado
  --   descuadre = falta o sobra algo. NO bloquea la salida: el camion lo para
  --               una persona, no el software. Queda registrado y avisa.
  estado ENUM('pendiente','conforme','descuadre') NOT NULL DEFAULT 'pendiente',
  verificado_por VARCHAR(200) DEFAULT NULL,
  verificado_at TIMESTAMP NULL DEFAULT NULL,

  observaciones TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_tipo_fecha (tipo, fecha),
  INDEX idx_almacenista (almacenista_nombre),
  INDEX idx_estado (estado),
  INDEX idx_picking (odoo_picking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Renglones del movimiento: una fila por producto.
--
-- `cantidad_cargada` es lo que dice Odoo que va en el camion.
-- `cantidad_verificada` es lo que Seguridad cuenta en el porton, y empieza en
-- NULL: "todavia no lo he contado" no es lo mismo que "conte cero". Sin esa
-- distincion, un renglon sin revisar se leeria como faltante completo.
CREATE TABLE IF NOT EXISTS seguridad_mercancia_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mercancia_id INT NOT NULL,

  odoo_product_id INT DEFAULT NULL,
  producto VARCHAR(300) NOT NULL,
  codigo VARCHAR(100) DEFAULT NULL,

  cantidad_cargada DECIMAL(12,3) NOT NULL DEFAULT 0,
  cantidad_verificada DECIMAL(12,3) DEFAULT NULL,
  observacion VARCHAR(300) DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_mercancia (mercancia_id),
  CONSTRAINT fk_mercancia_item FOREIGN KEY (mercancia_id)
    REFERENCES seguridad_mercancia(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- La calificacion del almacenista reusa `seguridad_calificaciones`, que ya
-- existe. Solo hay que admitir el nuevo origen en su ENUM: antes solo aceptaba
-- 'ingreso' y 'despacho', los dos de RMA.
--
-- Se comprueba antes de tocarlo para poder repetir el script, y solo se
-- modifica si le falta el valor nuevo.
SET @tiene := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'seguridad_calificaciones'
    AND COLUMN_NAME = 'relacionado_a'
    AND COLUMN_TYPE LIKE '%mercancia%');

SET @sql := IF(@tiene > 0,
  'SELECT "relacionado_a ya admite mercancia" AS aviso',
  'ALTER TABLE seguridad_calificaciones
     MODIFY COLUMN relacionado_a ENUM(''ingreso'',''despacho'',''mercancia'') NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- Las firmas del acta tambien valen para mercancia.
SET @tiene := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'seguridad_firmas'
    AND COLUMN_NAME = 'acta_tipo'
    AND COLUMN_TYPE LIKE '%mercancia%');

SET @sql := IF(@tiene > 0,
  'SELECT "acta_tipo ya admite mercancia" AS aviso',
  'ALTER TABLE seguridad_firmas
     MODIFY COLUMN acta_tipo ENUM(''ingreso'',''despacho'',''mercancia'') NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('seguridad_mercancia','seguridad_mercancia_items')) AS tablas_de_2;
