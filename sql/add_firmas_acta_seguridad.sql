-- Las 4 firmas del acta de RMA, tal como la planilla de papel.
--
-- La planilla "RECEPCION Y DESPACHO DE RMA" lleva cuatro firmantes: el tecnico
-- de OSC, el almacen, el de Seguridad, y la persona que entrega o retira el
-- equipo. Hasta ahora el sistema guardaba UNA sola firma —la del cliente— y
-- solo en el despacho, asi que el acta de recepcion no la firmaba nadie.
--
-- Eso dejaba la prueba del lado equivocado: los 4 checks de estado
-- (accesorios, manipulacion, fecha, garantia) existen para cuando un cliente
-- reclama que faltaba algo, y los respondia el almacenista solo, sin que nadie
-- reconociera en que estado se entrego.
--
-- Tabla aparte y no columnas en cada acta: son 4 roles x 2 tipos de acta, que
-- serian 8 pares de columnas LONGBLOB repartidos en dos tablas. Asi ademas
-- queda registrado CUANDO firmo cada uno, que en una disputa importa tanto
-- como la firma.

CREATE TABLE IF NOT EXISTS seguridad_firmas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  acta_tipo ENUM('ingreso','despacho') NOT NULL,
  acta_id INT NOT NULL,
  rol ENUM('tecnico','almacen','seguridad','cliente') NOT NULL,
  -- Nombre de quien firma. Se guarda con la firma y no se deriva despues:
  -- si el almacenista cambia de nombre o se va, el acta tiene que seguir
  -- diciendo quien firmo ese dia.
  firmante_nombre VARCHAR(200) NOT NULL,
  firma_data LONGBLOB NOT NULL,
  firma_mime VARCHAR(50) DEFAULT 'image/png',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Un rol firma una vez por acta. Volver a firmar reemplaza, no acumula:
  -- si alguien firmo mal y repite, no pueden quedar dos firmas suyas y que
  -- nadie sepa cual vale.
  UNIQUE KEY uq_acta_rol (acta_tipo, acta_id, rol),
  INDEX idx_acta (acta_tipo, acta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Numero "ND" del encabezado de la planilla.
--
-- Es el correlativo que el almacen escribe a mano en el papel. Se guarda para
-- poder cruzar un acta del sistema con la carpeta de papeles viejos, cosa que
-- el id del sistema no permite.
--
-- ALTERs separados: MySQL no soporta `ADD COLUMN IF NOT EXISTS` antes de
-- 8.0.29. Si la columna ya existe, devuelve "Duplicate column name".

ALTER TABLE seguridad_ingresos
  ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL;

ALTER TABLE seguridad_despachos
  ADD COLUMN nd_numero VARCHAR(50) DEFAULT NULL;


-- Configuracion del modulo, en base de datos y no en el codigo.
--
-- Nace para el nombre del tecnico que firma: hoy es siempre Manuel Garcia,
-- pero escribirlo en el codigo significa tocar y desplegar el dia que cambie
-- el tecnico. Esto es un almacen de clave/valor para ese tipo de dato.

CREATE TABLE IF NOT EXISTS seguridad_config (
  clave VARCHAR(64) PRIMARY KEY,
  valor VARCHAR(500) NOT NULL,
  actualizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seguridad_config (clave, valor) VALUES
  ('tecnico_nombre', 'Ing. Manuel García'),
  ('tecnico_cargo', 'Técnico de OSC')
ON DUPLICATE KEY UPDATE valor = valor;
