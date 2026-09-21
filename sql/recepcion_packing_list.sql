-- ============================================================
-- RECEPCION DE MERCANCIA POR PACKING LIST (Compras -> Almacen)
--
-- Reemplaza al "ingreso de mercancia" por factura de compra que registraba
-- Seguridad. Ahora:
--   1. Compras carga el packing list en el panel (antes llegaba por correo):
--      proveedor, contenedor, precinto esperado y los renglones esperados.
--   2. Almacen recibe el contenedor: foto al llegar, foto del precinto y el
--      numero de precinto que lee (se compara con el esperado).
--   3. Almacen descarga y cuenta renglon por renglon contra el packing list:
--      faltantes/sobrantes con motivo, cajas golpeadas con foto.
--   4. Almacen cierra con la foto de como quedo el contenedor.
--
-- Se puede correr VARIAS VECES sin romper nada (CREATE TABLE IF NOT EXISTS).
-- Al final imprime una comprobacion: debe decir 3.
-- ============================================================

CREATE TABLE IF NOT EXISTS recepcion_packing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- Sucursal donde llega el contenedor (9=Valencia, 10=Caracas, 7=Panama).
  -- La elige Compras al cargarlo; Almacen solo ve los de su sucursal.
  cids INT NOT NULL,
  proveedor VARCHAR(200) NOT NULL,
  referencia VARCHAR(100) NOT NULL,           -- numero del packing list
  contenedor VARCHAR(50) DEFAULT NULL,        -- numero de contenedor
  precinto_esperado VARCHAR(50) DEFAULT NULL, -- el que dice el packing list
  -- Orden de compra del panel de la que salieron los renglones, si aplica.
  purchase_order_id INT DEFAULT NULL,
  oc_referencia VARCHAR(50) DEFAULT NULL,
  fecha_estimada DATE DEFAULT NULL,
  observaciones TEXT DEFAULT NULL,
  -- por_llegar -> descargando -> cerrado
  etapa VARCHAR(20) NOT NULL DEFAULT 'por_llegar',
  creado_por VARCHAR(200) NOT NULL,
  -- Llegada (Almacen)
  llegada_at TIMESTAMP NULL DEFAULT NULL,
  llegada_por VARCHAR(200) DEFAULT NULL,
  precinto_recibido VARCHAR(50) DEFAULT NULL,
  -- NULL cuando Compras no cargo precinto esperado: no hay contra que comparar.
  precinto_coincide TINYINT(1) DEFAULT NULL,
  -- Cierre (Almacen)
  cerrado_at TIMESTAMP NULL DEFAULT NULL,
  cerrado_por VARCHAR(200) DEFAULT NULL,
  -- conforme | con_novedades
  resultado VARCHAR(20) DEFAULT NULL,
  notas_cierre TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rp_cids_etapa (cids, etapa),
  INDEX idx_rp_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `cantidad_recibida` empieza en NULL a proposito: "todavia no lo conte" no
-- es lo mismo que "llegaron cero".
CREATE TABLE IF NOT EXISTS recepcion_packing_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  codigo VARCHAR(100) DEFAULT NULL,
  producto VARCHAR(300) NOT NULL,
  cantidad_esperada DECIMAL(14,3) NOT NULL DEFAULT 0,
  cajas_esperadas INT DEFAULT NULL,
  cantidad_recibida DECIMAL(14,3) DEFAULT NULL,
  -- Obligatorio cuando lo recibido no coincide con lo esperado.
  motivo_diferencia VARCHAR(300) DEFAULT NULL,
  golpeado TINYINT(1) NOT NULL DEFAULT 0,
  golpeado_nota VARCHAR(300) DEFAULT NULL,
  INDEX idx_rpi_recepcion (recepcion_id),
  CONSTRAINT fk_rpi_recepcion FOREIGN KEY (recepcion_id)
    REFERENCES recepcion_packing(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Packing list original (PDF/Excel) y las fotos. En la base, igual que la
-- foto del ingreso RMA: no hay almacenamiento de archivos aparte.
-- tipo: packing_list | foto_llegada | foto_precinto | foto_cierre | foto_golpe
CREATE TABLE IF NOT EXISTS recepcion_packing_archivos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recepcion_id INT NOT NULL,
  -- Solo en foto_golpe: el renglon (caja) golpeado.
  item_id INT DEFAULT NULL,
  tipo VARCHAR(20) NOT NULL,
  nombre VARCHAR(200) DEFAULT NULL,
  mime VARCHAR(100) NOT NULL,
  tamano INT NOT NULL,
  data LONGBLOB NOT NULL,
  subido_por VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rpa_recepcion (recepcion_id, tipo),
  CONSTRAINT fk_rpa_recepcion FOREIGN KEY (recepcion_id)
    REFERENCES recepcion_packing(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprobacion: debe decir 3.
SELECT COUNT(*) AS tablas_de_3 FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('recepcion_packing','recepcion_packing_items',
                      'recepcion_packing_archivos');
