-- Seguimiento del Top 10 de Alertas del Indice de Salud Administrativa (#8).
--
-- Las alertas se recalculan en cada carga a partir de los KPIs, asi que la
-- fecha compromiso y el estatus —dos de los seis campos que exige la
-- propuesta— no pueden vivir en el calculo: los pone una persona y tienen que
-- sobrevivir a la siguiente carga.
--
-- El alcance de un seguimiento es (alerta_id, empresa, mes): la misma alerta
-- en Valencia y en Caracas son dos compromisos distintos, y el compromiso de
-- un mes no se arrastra al siguiente, donde el indicador ya se recalculo.
-- `empresa` vacio significa "todas las sedes".
--
-- La aplicacion la crea sola al arrancar el endpoint (ensureTable), igual que
-- presupuesto_gastos y admin_kpi_metas. Este archivo es el DDL de referencia y
-- se puede correr dos veces sin romper nada.

CREATE TABLE IF NOT EXISTS alertas_admin_seguimiento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alerta_id VARCHAR(120) NOT NULL,
  empresa VARCHAR(20) NOT NULL DEFAULT '',
  mes VARCHAR(7) NOT NULL,
  estatus VARCHAR(20) NOT NULL DEFAULT 'abierta',
  fecha_compromiso DATE NULL,
  responsable VARCHAR(120) NULL,
  nota VARCHAR(500) NULL,
  actualizado_por VARCHAR(120) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_seguimiento (alerta_id, empresa, mes),
  KEY idx_periodo (empresa, mes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
