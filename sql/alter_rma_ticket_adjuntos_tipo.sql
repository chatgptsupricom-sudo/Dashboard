-- Guia de agencia adjunta al marcar un caso "entregado" (metodo de
-- entrega = agencia). Documentacion de referencia -- se auto-migra en
-- runtime la primera vez que GET /api/rma/[id] o POST /api/rma/[id]/guia
-- la necesitan (mismo patron que el resto del modulo), aplicar esto a
-- mano es opcional.

ALTER TABLE rma_ticket_adjuntos ADD COLUMN tipo VARCHAR(30) DEFAULT 'reporte';

-- Valores usados hoy: 'reporte' (fotos que el cliente sube al reportar la
-- falla, valor por default para todas las filas viejas) y 'guia_agencia'
-- (comprobante de envio subido por el equipo de RMA al marcar un caso
-- como entregado por agencia).
