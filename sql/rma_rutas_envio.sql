-- Issue #120: email del cliente + catalogo de rutas de despacho y agencias
--
-- Mismo patron que sql/alter_rma_cases_portal.sql: esto es documentacion de
-- referencia. `lib/rma/rutasEnvio.ts::ensureRutasEnvioSchema()` corre el
-- mismo schema (columna + tablas + seed) en runtime la primera vez que algo
-- del modulo de entrega lo necesita, asi que aplicar esto a mano es
-- opcional.

ALTER TABLE rma_cases ADD COLUMN client_email VARCHAR(200) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS rma_rutas_despacho (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rma_rutas_ciudades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ruta_id INT NOT NULL,
  ciudad VARCHAR(100) NOT NULL,
  estado VARCHAR(100) DEFAULT NULL,
  -- Variantes de escritura del mismo lugar, separadas por "|" (ej.
  -- "Pto Cabello|Pto. Cabello"). El match ya ignora mayusculas/acentos por
  -- su cuenta -- esto es solo para abreviaturas o nombres alternos
  -- genuinamente distintos.
  alias VARCHAR(300) DEFAULT NULL,
  INDEX idx_ruta (ruta_id),
  FOREIGN KEY (ruta_id) REFERENCES rma_rutas_despacho(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rma_agencias_envio (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed inicial (datos que dio operaciones el 8/sep/2026). Usa subqueries por
-- nombre en vez de ids literales porque el AUTO_INCREMENT real puede variar.
INSERT INTO rma_rutas_despacho (nombre) VALUES
  ('Barquisimeto / Cabudare'), ('Caracas'), ('Aragua'), ('Valencia');

INSERT INTO rma_rutas_ciudades (ruta_id, ciudad, estado, alias) VALUES
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Barquisimeto / Cabudare'), 'Puerto Cabello', 'Carabobo', 'Pto Cabello|Pto. Cabello'),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Barquisimeto / Cabudare'), 'San Felipe', 'Yaracuy', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Barquisimeto / Cabudare'), 'Barquisimeto', 'Lara', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Barquisimeto / Cabudare'), 'Cabudare', 'Lara', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Caracas'), 'Caracas', 'Distrito Capital', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Caracas'), 'Los Altos Mirandinos', 'Miranda', 'Altos Mirandinos'),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Caracas'), 'Charallave', 'Miranda', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Caracas'), 'Guatire', 'Miranda', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Aragua'), 'Maracay', 'Aragua', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Aragua'), 'Turmero', 'Aragua', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Aragua'), 'La Victoria', 'Aragua', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Aragua'), 'San Mateo', 'Aragua', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Aragua'), 'Cagua', 'Aragua', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'Valencia', 'Carabobo', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'Los Guayos', 'Carabobo', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'San Diego', 'Carabobo', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'Naguanagua', 'Carabobo', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'Guacara', 'Carabobo', NULL),
  ((SELECT id FROM rma_rutas_despacho WHERE nombre = 'Valencia'), 'Güigüe', 'Carabobo', NULL);

INSERT INTO rma_agencias_envio (nombre) VALUES ('MRW'), ('Zoom'), ('Tealca'), ('Domesa');
