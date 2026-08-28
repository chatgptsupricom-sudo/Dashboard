/**
 * Construcción de los filtros de los listados de ingresos y despachos.
 *
 * Vive acá para que el listado y el export a Excel usen exactamente el mismo
 * criterio. El issue #38 pide que "los filtros del listado se respeten": si
 * cada uno arma su propio WHERE, tarde o temprano divergen y el archivo
 * exportado deja de coincidir con lo que la persona está viendo en pantalla —
 * sin que nada falle de forma visible.
 */

export interface Filtro {
  where: string;
  params: any[];
}

function texto(sp: URLSearchParams, k: string) {
  return (sp.get(k) || "").trim();
}

export function filtroIngresos(sp: URLSearchParams, cids: number | null): Filtro {
  let where = "WHERE 1=1";
  const params: any[] = [];

  const search = texto(sp, "search");
  if (search) {
    where += " AND (cliente_nombre LIKE ? OR serial LIKE ? OR factura_numero LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const desde = texto(sp, "desde");
  if (desde) {
    where += " AND fecha_entrega >= ?";
    params.push(desde);
  }

  const hasta = texto(sp, "hasta");
  if (hasta) {
    where += " AND fecha_entrega <= ?";
    params.push(hasta);
  }

  const rmaCaseId = parseInt(texto(sp, "rma_case_id"), 10);
  if (!isNaN(rmaCaseId)) {
    where += " AND rma_case_id = ?";
    params.push(rmaCaseId);
  }

  // "Solo pendientes de despacho": equipo que sigue fisicamente en el taller.
  // Va aca y no filtrando en el cliente para que el total y la paginacion del
  // listado cuadren, y para que el Excel exporte lo mismo que se ve.
  if (texto(sp, "solo_pendientes") === "1") {
    where += ` AND NOT EXISTS (
      SELECT 1 FROM seguridad_despachos d WHERE d.ingreso_id = seguridad_ingresos.id
    )`;
  }

  // null = superadmin, ve todas las sucursales. Mismo criterio que el resto
  // del modulo: sin esto cualquiera con sesion veia ingresos de otra sucursal
  // en el listado y en el Excel exportado.
  if (cids !== null) {
    where += " AND cids = ?";
    params.push(cids);
  }

  return { where, params };
}

/**
 * Nota sobre `d.cids`: a diferencia de `filtroIngresos`, aca el filtro va
 * calificado con el alias `d`. El listado y el export unen
 * `seguridad_despachos` con `seguridad_ingresos` (LEFT JOIN), y desde que
 * `seguridad_ingresos` tambien tiene columna `cids`, un `cids = ?` sin
 * calificar es ambiguo para MySQL en esa consulta — rompe el listado entero,
 * no solo el filtro. Todo consumidor de este `where` tiene que exponer la
 * tabla `seguridad_despachos` como `d` (con alias, aunque sea de una sola
 * tabla) para que esto resuelva.
 */
export function filtroDespachos(sp: URLSearchParams, cids: number | null): Filtro {
  let where = "WHERE 1=1";
  const params: any[] = [];

  const search = texto(sp, "search");
  if (search) {
    where += " AND (cliente_retira LIKE ? OR almacenista_nombre LIKE ? OR facturas_json LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const desde = texto(sp, "desde");
  if (desde) {
    where += " AND fecha_despacho >= ?";
    params.push(desde);
  }

  const hasta = texto(sp, "hasta");
  if (hasta) {
    where += " AND fecha_despacho <= ?";
    params.push(hasta);
  }

  const almacenista = texto(sp, "almacenista");
  if (almacenista) {
    // Coincidencia exacta, igual que el listado. Cambiarlo a LIKE haría que el
    // Excel trajera filas que en pantalla no se ven.
    where += " AND almacenista_nombre = ?";
    params.push(almacenista);
  }

  const ingresoId = parseInt(texto(sp, "ingreso_id"), 10);
  if (!isNaN(ingresoId)) {
    where += " AND ingreso_id = ?";
    params.push(ingresoId);
  }

  const rmaCaseId = parseInt(texto(sp, "rma_case_id"), 10);
  if (!isNaN(rmaCaseId)) {
    where += " AND rma_case_id = ?";
    params.push(rmaCaseId);
  }

  if (cids !== null) {
    where += " AND d.cids = ?";
    params.push(cids);
  }

  return { where, params };
}
