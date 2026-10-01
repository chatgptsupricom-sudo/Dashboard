-- #50 — Catálogo de personal de Seguridad y RMA.
--
-- En un ingreso de RMA intervienen 2 personas de Seguridad y 2 de RMA. El acta
-- guardaba un solo `recibido_por` (texto libre). Ahora el formulario de ingreso
-- tiene dos selects — "Recibió por Seguridad" y "Recibió por RMA" — poblados
-- desde este catálogo, y el ingreso guarda ambos nombres.
--
-- Mismo patrón que seguridad_catalogo_almacenistas / _choferes: una tabla de
-- nombres válidos por sucursal (`cids`), administrada desde
-- /es/seguridad/config/personal. `activo` permite dar de baja a alguien sin
-- borrar el histórico de actas donde ya figura.
--
-- La ruta app/api/seguridad/catalogo/personal/route.ts ejecuta este mismo
-- CREATE/ALTER una vez por proceso (best-effort); este archivo es para correrlo
-- a mano en la MySQL de producción, que tiene allowlist por IP.

CREATE TABLE IF NOT EXISTS seguridad_catalogo_personal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  -- 'seguridad' = guardia que recibe en el portón; 'rma' = quien recibe del
  -- lado del taller. Un mismo nombre puede existir en los dos roles.
  rol ENUM('seguridad','rma') NOT NULL,
  cids INT DEFAULT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nombre_rol_cids (nombre, rol, cids),
  INDEX idx_rol_cids (rol, cids)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nombres guardados en el ingreso (texto, no FK: si mañana se corrige un nombre
-- en el catálogo, el acta ya firmada tiene que seguir mostrando lo que se
-- firmó). `recibido_por` se conserva para el sistema de calificación y los KPIs
-- que ya dependen de él.
ALTER TABLE seguridad_ingresos
  ADD COLUMN recibido_seguridad_nombre VARCHAR(200) DEFAULT NULL,
  ADD COLUMN recibido_rma_nombre VARCHAR(200) DEFAULT NULL;
