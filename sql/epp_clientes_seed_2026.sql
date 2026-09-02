-- Semilla opcional: las 14 cuentas EPP (marca EZVIZ, Panama) de la hoja "EPP"
-- del Excel original, con su Meta Anual 2026. Ejecutar UNA vez si se quiere
-- arrancar con esas cuentas; luego se administran desde la vista.
INSERT INTO epp_clientes (company_id, anio, marca, cliente_nombre, meta_anual, activo) VALUES
  (7, 2026, 'EZVIZ', 'INTEGRA ALARMA', 60000, 1),
  (7, 2026, 'EZVIZ', 'INVERSIONES MO. & SONG, S.A. ( MS COMPUTER )', 80000, 1),
  (7, 2026, 'EZVIZ', 'GRUPO SUPER DOLLAR, S.A', 120000, 1),
  (7, 2026, 'EZVIZ', 'SET TECHNOLOGIES PANAMA, S.A', 40000, 1),
  (7, 2026, 'EZVIZ', 'HONG KONG SMART', 36000, 1),
  (7, 2026, 'EZVIZ', 'GLOBAL TECHNOLOGY SECURITY /Inversiones Bodiat, Global Technology Security #2', 60000, 1),
  (7, 2026, 'EZVIZ', 'ECO SMART TECH S.A.', 30000, 1),
  (7, 2026, 'EZVIZ', 'NGU HOLDING, S. DE RL/SAGATRONIX', 24000, 1),
  (7, 2026, 'EZVIZ', 'GRUPO CMW S.A. ( MOBIL TEK ) CARLOS EL DORADO', 24000, 1),
  (7, 2026, 'EZVIZ', 'YOYTEC COMPUTER, S.A', 24000, 1),
  (7, 2026, 'EZVIZ', 'SYSCOM STORE (QIU HUA HUANG LIN)/ (SYSCOM MARKET PLAZA)', 36000, 1),
  (7, 2026, 'EZVIZ', 'MI CELL PTY, S.A.', 20000, 1),
  (7, 2026, 'EZVIZ', 'PC & TECH', 12000, 1),
  (7, 2026, 'EZVIZ', 'GLR SECURITY SYSTEMS, S.A.', 30000, 1)
ON DUPLICATE KEY UPDATE meta_anual = VALUES(meta_anual), activo = 1;
