-- Sincronizacion de ordenes de compra con purchase.order en Odoo (issue #166).
-- Documentacion de referencia -- se auto-migra en runtime (ver
-- lib/compras/odooSync.ts::ensureOdooSyncColumns), aplicar esto a mano es
-- opcional.

ALTER TABLE purchase_orders ADD COLUMN odoo_purchase_order_id INT NULL;
ALTER TABLE purchase_orders ADD COLUMN odoo_sync_status ENUM('sincronizado','pendiente','error','no_aplica') NOT NULL DEFAULT 'no_aplica';
ALTER TABLE purchase_orders ADD COLUMN odoo_sync_error TEXT NULL;

-- no_aplica    -- la orden tiene proveedor y/o lineas sin match en Odoo
--                 (proveedor escrito a mano, producto sin product_odoo_id);
--                 nunca se intenta escribir en Odoo para esa orden.
-- pendiente     -- deberia sincronizarse pero todavia no se proceso.
-- sincronizado  -- el ultimo intento de escritura en Odoo tuvo exito;
--                 odoo_purchase_order_id apunta al purchase.order real.
-- error         -- el ultimo intento fallo; odoo_sync_error tiene el motivo.
--                 La orden sigue siendo valida en el panel (MySQL manda),
--                 Odoo se reintenta en la proxima edicion/transicion.
