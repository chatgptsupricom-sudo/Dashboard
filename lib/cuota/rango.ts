// Rango de fechas del filtro de la sección Cuota (SuperAdmin, Gerencia de
// Ventas / Asistente de Ventas y Gerente de Operaciones). Sin filtro, el
// rango es el mes en curso hasta hoy, que es lo que la sección mostraba
// antes de tener filtro.

export interface RangoCuota {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function aTexto(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function rangoMesActual(hoy: Date = new Date()): RangoCuota {
  return {
    desde: aTexto(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: aTexto(hoy),
  };
}

function esFecha(valor: string | null): valor is string {
  return !!valor && FECHA.test(valor) && !isNaN(new Date(`${valor}T00:00:00`).getTime());
}

/** Lee `?desde=&hasta=`; lo que falte o venga mal cae al mes en curso. */
export function leerRangoCuota(params: URLSearchParams): RangoCuota {
  const actual = rangoMesActual();
  const desdeParam = params.get("desde");
  const hastaParam = params.get("hasta");
  let desde = esFecha(desdeParam) ? desdeParam : actual.desde;
  let hasta = esFecha(hastaParam) ? hastaParam : actual.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  return { desde, hasta };
}

/**
 * El ritmo diario necesario y los días hábiles restantes solo tienen sentido
 * cuando se mira el mes en curso completo hasta hoy.
 */
export function esRangoMesActual(rango: RangoCuota): boolean {
  const actual = rangoMesActual();
  return rango.desde === actual.desde && rango.hasta >= actual.hasta;
}

/**
 * La cuota es un historial (una fila por cambio). Devuelve, por vendedor, la
 * que estaba vigente al cierre del rango; si el vendedor todavía no tenía
 * cuota en esa fecha, la primera que se le registró.
 */
export function cuotasVigentes(
  filas: { seller_id: number; cuota: number | string; created_at: Date | string }[],
  hasta: string,
): Map<number, number> {
  const limite = new Date(`${hasta}T23:59:59.999`).getTime();
  const ordenadas = [...filas].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const vigentes = new Map<number, number>();
  for (const fila of ordenadas) {
    const dentro = new Date(fila.created_at).getTime() <= limite;
    if (dentro || !vigentes.has(fila.seller_id)) {
      vigentes.set(fila.seller_id, Number(fila.cuota) || 0);
    }
  }
  return vigentes;
}
