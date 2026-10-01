import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/recepcion/llegadas
 *
 * Calendario de mercancia para el Diseñador y AdminLeads de Valencia: que
 * productos llegaron al almacen y cuales van a llegar, dia por dia, para
 * saber de que hay (o va a haber) mercancia nueva.
 *
 * Por dia devuelve tres listas de productos:
 *  - `llego`:      packing list cerrados (contados), con la cantidad recibida,
 *                  en su fecha de llegada (la del primer contenedor; si no
 *                  quedo registrada, la de cierre).
 *  - `contando`:   ya llegaron pero Almacen todavia los esta contando: la
 *                  cantidad es la del packing list, no la contada.
 *  - `por_llegar`: todavia no llegan, en la fecha estimada que cargo Compras,
 *                  con la cantidad del packing list.
 * Los que no llegaron y no tienen fecha estimada van aparte en `sin_fecha`.
 *
 * A proposito NO devuelve proveedor, numero de packing list, contenedores,
 * precintos, fotos ni novedades: esos datos son de Compras y Almacen.
 */

const CIDS_VALENCIA = 9;
const DIAS_HISTORIA = 365;
const ZONA = "America/Caracas";

type Producto = { codigo: string | null; producto: string; cantidad: number };
type Lista = "llego" | "contando" | "por_llegar";
type Dia = { fecha: string } & Record<Lista, Producto[]>;

/** Dia (YYYY-MM-DD) en hora de Venezuela. */
function diaLocal(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    fecha,
  );
}

/**
 * Agrupa renglones en productos: si el mismo producto viene en dos packing
 * list para la misma lista del mismo dia, se suma.
 */
class Acumulador {
  private mapa = new Map<string, Map<string, Producto>>();
  sumar(grupo: string, f: { codigo: string | null; producto: string; cantidad: unknown }) {
    const cantidad = Number(f.cantidad) || 0;
    if (cantidad <= 0) return;
    if (!this.mapa.has(grupo)) this.mapa.set(grupo, new Map());
    const productos = this.mapa.get(grupo)!;
    const clave = (f.codigo || f.producto || "").trim().toUpperCase();
    const ya = productos.get(clave);
    if (ya) ya.cantidad += cantidad;
    else productos.set(clave, { codigo: f.codigo || null, producto: f.producto, cantidad });
  }
  lista(grupo: string): Producto[] {
    return [...(this.mapa.get(grupo)?.values() || [])].sort((a, b) => a.producto.localeCompare(b.producto, "es"));
  }
  grupos(): string[] {
    return [...this.mapa.keys()];
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["diseñador", "adminleads"]);
  if (auth.error) return auth.error;

  const rol = String(auth.payload?.role || "").toLowerCase().trim();
  if (rol !== "superadmin" && Number(auth.payload?.cids) !== CIDS_VALENCIA) {
    return NextResponse.json({ error: "Solo para Valencia" }, { status: 403 });
  }

  try {
    // Cerrados del ultimo año + todo lo que esta en camino o contandose.
    // La fecha estimada es DATE: se formatea en SQL para que la zona horaria
    // del driver no la corra un dia.
    const r = await query(
      `SELECT r.etapa,
              COALESCE(r.llegada_at, r.cerrado_at) AS llegada,
              DATE_FORMAT(r.fecha_estimada, '%Y-%m-%d') AS estimada,
              i.codigo, i.producto, i.cantidad_esperada, i.cantidad_recibida
         FROM recepcion_packing r
         JOIN recepcion_packing_items i ON i.recepcion_id = r.id
        WHERE r.cids = ?
          AND (r.etapa <> 'cerrado'
               OR COALESCE(r.llegada_at, r.cerrado_at) >= DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [CIDS_VALENCIA, DIAS_HISTORIA],
    );

    const acc = new Acumulador();
    for (const f of r.rows as any[]) {
      if (f.etapa === "cerrado") {
        if (f.llegada) acc.sumar(`${diaLocal(new Date(f.llegada))}|llego`, { ...f, cantidad: f.cantidad_recibida });
      } else if (f.etapa === "descargando") {
        const dia = f.llegada ? diaLocal(new Date(f.llegada)) : f.estimada;
        if (dia) acc.sumar(`${dia}|contando`, { ...f, cantidad: f.cantidad_esperada });
      } else {
        acc.sumar(`${f.estimada || "sin_fecha"}|por_llegar`, { ...f, cantidad: f.cantidad_esperada });
      }
    }

    const dias = new Map<string, Dia>();
    for (const grupo of acc.grupos()) {
      const [fecha, lista] = grupo.split("|") as [string, Lista];
      if (fecha === "sin_fecha") continue;
      if (!dias.has(fecha)) dias.set(fecha, { fecha, llego: [], contando: [], por_llegar: [] });
      dias.get(fecha)![lista] = acc.lista(grupo);
    }

    return NextResponse.json({
      success: true,
      hoy: diaLocal(new Date()),
      dias: [...dias.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
      sin_fecha: acc.lista("sin_fecha|por_llegar"),
    });
  } catch (e: any) {
    console.error("[llegadas] error:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar lo que llego" }, { status: 500 });
  }
}
