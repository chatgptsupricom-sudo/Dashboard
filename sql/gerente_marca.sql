-- Marcas de cada Gerente de Marca (lib/gerente-marca/asignaciones.ts).
-- La tabla se crea sola al abrir la sección; esto es la referencia y, si se
-- prefiere, la carga inicial a mano (lo normal es asignarlas en
-- Gerencia de Marca > Configuración).
--
-- marca_id = id de spiff.brand en Odoo (la marca de Metas por marca).
-- linea: 'todo' = toda la marca; 'computo' = solo Cómputo Corporativo (todo
-- menos impresoras, consumibles y papelería: CATEGORIAS_IMPRESION en
-- lib/gerente-marca/tipos.ts).

CREATE TABLE IF NOT EXISTS supricom_panel.gerente_marca_asignaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  marca_id INT NOT NULL,
  marca VARCHAR(120) NOT NULL,
  linea VARCHAR(20) NOT NULL DEFAULT 'todo',
  updated_by VARCHAR(190) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_marca (email, marca_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Las del primer gerente (pedido de oct-2026): FORZA, APC y DELL enteras;
-- HP, Lenovo y Acer solo Cómputo Corporativo. Ids de Odoo al 23-oct-2026.
-- INSERT INTO supricom_panel.gerente_marca_asignaciones (email, marca_id, marca, linea) VALUES
--   ('CORREO_DEL_GERENTE', 927, 'FORZA', 'todo'),
--   ('CORREO_DEL_GERENTE', 921, 'APC', 'todo'),
--   ('CORREO_DEL_GERENTE', 963, 'DELL', 'todo'),
--   ('CORREO_DEL_GERENTE', 930, 'HP', 'computo'),
--   ('CORREO_DEL_GERENTE', 934, 'LENOVO', 'computo'),
--   ('CORREO_DEL_GERENTE', 919, 'ACER', 'computo');

SELECT * FROM supricom_panel.gerente_marca_asignaciones ORDER BY email, marca;
