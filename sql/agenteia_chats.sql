-- Conversaciones del Agente IA, por usuario (app/api/superadmin/agenteia/chats).
-- La API la crea sola si falta; este script es para crearla a mano en el
-- phpMyAdmin de EasyPanel. Verificar después con:
--   SHOW TABLES FROM supricom_panel LIKE 'agenteia_chats';
--   SHOW COLUMNS FROM supricom_panel.agenteia_chats;

CREATE TABLE IF NOT EXISTS supricom_panel.agenteia_chats (
  uid VARCHAR(120) NOT NULL,
  id VARCHAR(40) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  mensajes LONGTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (uid, id),
  KEY idx_uid_updated (uid, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
