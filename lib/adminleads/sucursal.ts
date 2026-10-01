/**
 * Alcance de sucursal para el modulo de Leads.
 *
 * Panama (cids 7) es una operacion aparte: su cartera, sus vendedores y sus
 * reportes no se cruzan con Venezuela. Valencia (9) y Caracas (10) trabajan
 * como un solo pool y se pasan leads entre si — es lo que ya devuelven el
 * listado de leads (`WHERE s.cids != 7 OR s.cids IS NULL`) y el de
 * vendedores (`WHERE cids != 7`), que meten las dos sedes en una sola lista.
 *
 * Los guards de reasignacion y de alta/baja de vendedores pedian en cambio
 * igualdad exacta de cids. Con eso la pantalla le ofrecia a AdminLeads de
 * Caracas los vendedores de Valencia y el backend los rechazaba con 403: no
 * podia transferir leads a los nombres que el propio panel le mostraba.
 *
 * Se compara con `Number()` y no con `!==` sobre los valores crudos porque
 * `cids` llega del JWT y de MySQL, y no siempre con el mismo tipo: un "10"
 * de texto contra un 10 numerico nunca es igual en estricto, y ahi el guard
 * rechazaba todo.
 */
const PANAMA = 7;

export function mismaOperacion(userCids: unknown, targetCids: unknown): boolean {
  const usuario = Number(userCids);
  const destino = Number(targetCids);

  // Sin sucursal asignada (superadmin y compania) no hay restriccion.
  if (!Number.isFinite(usuario) || usuario <= 0) return true;

  // Un vendedor sin sucursal no es destino valido para nadie que si tenga
  // una: no hay forma de saber de que operacion es.
  if (!Number.isFinite(destino) || destino <= 0) return false;

  // Panama solo con Panama. El resto comparte operacion.
  if (usuario === PANAMA || destino === PANAMA) return usuario === destino;
  return true;
}
