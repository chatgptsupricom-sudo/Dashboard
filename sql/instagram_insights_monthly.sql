-- Snapshot mensual de metricas de Instagram para el informe de redes sociales.
--
-- Para que existe:
--  1. La Graph API solo entrega ventanas recientes de Insights; guardar el cierre
--     de cada mes permite comparar "mes actual vs mes anterior" indefinidamente.
--  2. Mientras la app de Meta no tenga el permiso `instagram_manage_insights`,
--     estas filas se pueden cargar a mano y el informe las usa como fuente.
--
-- `origen` distingue de donde vino el dato: 'api' (sincronizado desde Instagram)
-- o 'manual' (cargado desde el panel). Un snapshot manual nunca se pisa con
-- ceros de la API: ver la logica de guardado en la ruta informe-mensual.

CREATE TABLE IF NOT EXISTS instagram_insights_monthly (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ig_user_id VARCHAR(64) NOT NULL,
  username VARCHAR(120) NULL,
  pais VARCHAR(40) NOT NULL DEFAULT 'Venezuela',
  periodo CHAR(7) NOT NULL COMMENT 'YYYY-MM',

  views INT NOT NULL DEFAULT 0 COMMENT 'Visualizaciones totales',
  reach INT NOT NULL DEFAULT 0 COMMENT 'Alcance',
  profile_views INT NOT NULL DEFAULT 0 COMMENT 'Visitas al perfil',
  website_clicks INT NOT NULL DEFAULT 0 COMMENT 'Clics en enlace externo',
  total_interactions INT NOT NULL DEFAULT 0 COMMENT 'Interacciones con el contenido',
  accounts_engaged INT NOT NULL DEFAULT 0 COMMENT 'Cuentas con interacciones',

  followers_count INT NOT NULL DEFAULT 0 COMMENT 'Seguidores al cierre del mes',
  followers_gained INT NOT NULL DEFAULT 0 COMMENT 'Seguidores ganados en el mes',

  publicaciones INT NOT NULL DEFAULT 0 COMMENT 'Publicaciones del mes (feed + reels)',
  demografia JSON NULL COMMENT 'Genero / edad / ciudades',

  origen ENUM('api', 'manual') NOT NULL DEFAULT 'api',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_cuenta_periodo (ig_user_id, periodo),
  KEY idx_periodo (periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
