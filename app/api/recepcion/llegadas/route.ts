import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/recepcion/llegadas?dias=180
 *
 * "Lo que llego" para el Diseñador y AdminLeads de Valencia: que productos
 * entraron al almacen y cuando, para saber de que hay mercancia nueva.
 *
 * Devuelve SOLO la fecha de llegada y los productos con la cantidad recibida
 * de los packing list ya cerrados (contados) de Valencia, agrupados por dia.
 * A proposito NO devuelve proveedor, numero de packing list, contenedores,
 * precintos, fotos ni novedades: esos datos son de Compras y Almacen.
 *
 * La fecha es la de llegada al almacen (la del primer contenedor, si el
 * packing list trajo varios: el conteo es uno solo para todo el packing list).
 */

const CIDS_VALENCIA = 9;
const DIAS_DEFECTO = 180;
const DIAS_MAX = 730;
const ZONA = "America/Caracas";

/** Dia (YYYY-MM-DD) en hora de Venezuela. */
function diaLocal(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    fecha,
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["diseñador", "adminleads"]);
  if (auth.error) return auth.error;

  const rol = String(auth.payload?.role || "").toLowerCase().trim();
  if (rol !== "superadmin" && Number(auth.payload?.cids) !== CIDS_VALENCIA) {
    return NextResponse.json({ error: "Solo para Valencia" }, { status: 403 });
  }

  const pedido = Number(new URL(request.url).searchParams.get("dias"));
  const dias = Number.isInteger(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAX) : DIAS_DEFECTO;

  try {
    const r = await query(
      `SELECT COALESCE(r.llegada_at, r.cerrado_at) AS fecha,
              i.codigo, i.producto, i.cantidad_recibida
         FROM recepcion_packing r
         JOIN recepcion_packing_items i ON i.recepcion_id = r.id
        WHERE r.cids = ?
          AND r.etapa = 'cerrado'
          AND i.cantidad_recibida > 0
          AND COALESCE(r.llegada_at, r.cerrado_at) >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY fecha DESC`,
      [CIDS_VALENCIA, dias],
    );

    // Por dia, y dentro del dia un renglon por producto (si el mismo producto
    // llego en dos packing list el mismo dia, se suma).
    const porDia = new Map<string, Map<string, { codigo: string | null; producto: string; cantidad: number }>>();
    for (const f of r.rows as any[]) {
      if (!f.fecha) continue;
      const dia = diaLocal(new Date(f.fecha));
      if (!porDia.has(dia)) porDia.set(dia, new Map());
      const productos = porDia.get(dia)!;
      const clave = (f.codigo || f.producto || "").trim().toUpperCase();
      const ya = productos.get(clave);
      const cantidad = Number(f.cantidad_recibida) || 0;
      if (ya) ya.cantidad += cantidad;
      else productos.set(clave, { codigo: f.codigo || null, producto: f.producto, cantidad });
    }

    const resultado = [...porDia.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([fecha, productos]) => ({
        fecha,
        productos: [...productos.values()].sort((a, b) => a.producto.localeCompare(b.producto, "es")),
      }));

    return NextResponse.json({ success: true, dias, llegadas: resultado });
  } catch (e: any) {
    console.error("[llegadas] error:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar lo que llego" }, { status: 500 });
  }
}
