-- ============================================================
-- EGRESO DE MERCANCIA POR ETAPAS (Almacen -> Seguridad)
--
-- Columnas del egreso por etapas (armado -> pre-despacho -> verificacion de
-- Almacen -> empaquetado -> despacho -> porton -> calificacion). Es la misma
-- seccion "4b" de migrar_seguridad_completo.sql, pero escrita para correr en
-- el phpMyAdmin de EasyPanel:
--
--   * NO usa information_schema: ahi el usuario root@'%' no la puede leer
--     (#1044 Acceso negado ... 'information_schema') y el script completo
--     "corre" sin agregar nada.
--   * Cada tabla lleva el nombre de la base delante (supricom_panel.tabla):
--     sin eso, phpMyAdmin puede ejecutar en el contexto de information_schema
--     aunque la base este elegida.
--
-- ANTES DE CORRERLO:
--   1. Si la base no se llama `supricom_panel`, reemplaza ese nombre en todo
--      el archivo.
--   2. Mira que no existan ya (MySQL no tiene ADD COLUMN IF NOT EXISTS, y si
--      una ya existe el ALTER entero falla sin cambiar nada):
--        SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'etapa';
--        SHOW COLUMNS FROM supricom_panel.seguridad_mercancia_items LIKE 'cantidad_armado';
--      Si alguna devuelve una fila, esa parte ya esta aplicada: no la corras.
--
-- Cada ALTER es una sola sentencia: se aplica completo o no se aplica nada.
-- Los egresos que ya existen quedan con `etapa` NULL = "flujo anterior".
-- ============================================================

ALTER TABLE supricom_panel.seguridad_mercancia
  ADD COLUMN etapa VARCHAR(30) DEFAULT NULL,
  ADD COLUMN tipo_entrega VARCHAR(20) DEFAULT NULL,
  ADD COLUMN almacenista_armado VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_inicio_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN armado_fin_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN armado_verificado_por VARCHAR(200) DEFAULT NULL,
  ADD COLUMN armado_verificado_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN empaquetado_por VARCHAR(200) DEFAULT NULL,
  ADD COLUMN empaquetado_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN almacenista_despacho VARCHAR(200) DEFAULT NULL,
  ADD COLUMN despacho_asignado_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN aprobado TINYINT(1) DEFAULT NULL,
  ADD COLUMN despachado TINYINT(1) DEFAULT NULL,
  ADD COLUMN motivo_no_aprobado VARCHAR(500) DEFAULT NULL,
  ADD COLUMN cerrado_at TIMESTAMP NULL DEFAULT NULL,
  ADD INDEX idx_etapa (etapa);

-- Conteo de Almacen al verificar el armado (el de Seguridad en el porton
-- sigue siendo cantidad_verificada).
ALTER TABLE supricom_panel.seguridad_mercancia_items
  ADD COLUMN cantidad_armado DECIMAL(12,3) DEFAULT NULL;

-- Comprobacion: cada una tiene que devolver una fila.
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia LIKE 'etapa';
SHOW COLUMNS FROM supricom_panel.seguridad_mercancia_items LIKE 'cantidad_armado';
