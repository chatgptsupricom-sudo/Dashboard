-- Issue #39 [Seguridad] Cola offline del mostrador.
--
-- Clave de idempotencia para que un ingreso encolado sin conexion no se
-- registre dos veces.
--
-- El caso que esto evita: el telefono manda el ingreso, el servidor lo guarda,
-- y la respuesta se pierde antes de llegar de vuelta (tunel, ascensor, wifi
-- del deposito). La cola no puede distinguir "no llego" de "llego y no me
-- entere", asi que reintenta — y sin esta columna crea un segundo ingreso del
-- mismo equipo. Dos actas de recepcion del mismo Monitor LG con el mismo
-- serial, y nadie sabe cual es la buena.
--
-- La genera el navegador (crypto.randomUUID) ANTES del primer intento y la
-- reusa en cada reintento. El endpoint, al ver una clave que ya existe,
-- devuelve el ingreso que ya habia en vez de crear otro.
--
-- NULL para todo lo que se registra con conexion: el UNIQUE de MySQL admite
-- tantos NULL como haga falta, asi que no molesta a las filas normales ni a
-- las que ya existen.

ALTER TABLE seguridad_ingresos
  ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL;

ALTER TABLE seguridad_ingresos
  ADD UNIQUE INDEX uq_idempotency_key (idempotency_key);
