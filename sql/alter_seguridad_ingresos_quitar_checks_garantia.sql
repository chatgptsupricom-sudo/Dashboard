-- #48 — El bloque "Verificación de estado" del ingreso de Seguridad deja de
-- preguntar "Dentro de la fecha (de garantía)" y "Falla cubierta por garantía".
-- Esa evaluación viene resuelta y CONGELADA en el ticket de RMA
-- (rma_cases.garantia_estado / garantia_vence / garantia_meses / garantia_marca)
-- y se muestra en el detalle del ingreso, no es algo que Seguridad decida en
-- el mostrador.
--
-- Las columnas nacieron NOT NULL sin DEFAULT para no declarar por nadie que el
-- equipo llegó bien. Ahora que no se piden, hay que permitir NULL para poder
-- omitirlas del INSERT. Se CONSERVAN (no se hace DROP) para no perder el
-- histórico de actas ya firmadas.
--
-- La ruta app/api/seguridad/ingreso/route.ts ejecuta este mismo MODIFY una vez
-- por proceso (best-effort); este archivo es para correrlo a mano en la MySQL
-- de producción, que tiene allowlist por IP.

ALTER TABLE seguridad_ingresos
  MODIFY dentro_de_fecha TINYINT(1) NULL DEFAULT NULL,
  MODIFY falla_cubierta_garantia TINYINT(1) NULL DEFAULT NULL;
