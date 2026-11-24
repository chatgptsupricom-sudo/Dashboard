import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { completarCodigos } from "@/lib/recepcion/codigosLlegadas";
import { esFacturaEspecial } from "@/lib/recepcion/flujo";
import { CARACAS, VALENCIA, claveProducto, fraccionDeRenglon } from "@/lib/recepcion/repartoSedes";
import { asegurarTablasReparto, fraccionesCaracas } from "@/lib/recepcion/repartoSedesDatos";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/recepcion/llegadas
 *
 * Calendario de mercancia para el Diseñador y AdminLeads de Valencia y de
 * Caracas: que productos llegaron al almacen de su sede y cuales van a
 * llegar, dia por dia, para saber de que hay (o va a haber) mercancia nueva.
 *
 * Cada sede ve lo suyo: la del `cids` del token (9 o 10; otra sede → 403).
 * El SuperAdmin elige con `?cids=9|10` (default Valencia).
 *
 * Reparto entre sedes (`lib/recepcion/repartoSedesDatos.ts`): un packing list
 * de Valencia con el reparto activo trae mercancia para las dos sedes. Todo
 * llega (y se carga en Odoo) en Valencia, pero aqui Valencia ve solo su parte
 * y Caracas la suya, en la fecha de llegada a Valencia y marcada
 * `via_valencia` ("llega a Valencia y se despacha a Caracas"). Lo mismo al
 * reves con un packing list de Caracas (`via_caracas`). La parte es la
 * cantidad × la fraccion del producto (por `claveProducto`, tomada ANTES de
 * completar codigos), redondeada una vez por packing list y producto; si
 * queda en 0 no se muestra.
 *
 * Por dia devuelve tres listas de productos:
 *  - `llego`:      packing list cerrados (contados), con la cantidad recibida,
 *                  en su fecha de llegada (la del primer contenedor; si no
 *                  quedo registrada, la de cierre).
 *  - `contando`:   ya llegaron pero Almacen todavia los esta contando: la
 *                  cantidad es la del packing list, no la contada.
 *  - `por_llegar`: todavia no llegan, en la fecha estimada que cargo Compras,
 *                  sin cantidad (solo que producto viene).
 * Los que no llegaron y no tienen fecha estimada van aparte en `sin_fecha`,
 * tambien sin cantidad.
 * El renglon que se cargo sin codigo lo toma de Odoo si se puede
 * (lib/recepcion/codigosLlegadas.ts).
 *
 * A proposito NO devuelve proveedor, numero de packing list, contenedores,
 * precintos, fotos ni novedades: esos datos son de Compras y Almacen.
 */

/** Sedes con calendario de Llegadas. */
const SEDES_LLEGADAS: number[] = [VALENCIA, CARACAS];
const DIAS_HISTORIA = 365;
const ZONA = "America/Caracas";

type Producto = {
  codigo: string | null;
  producto: string;
  cantidad?: number;
  /** Parte del reparto de un packing list que llega a Valencia y se despacha a Caracas. */
  via_valencia?: true;
  /** Parte del reparto de un packing list que llega a Caracas y se despacha a Valencia. */
  via_caracas?: true;
};
/** Por que sede llega lo de la otra ("" = llega a la sede que mira). */
type Via = "" | "valencia" | "caracas";
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
  sumar(grupo: string, f: { codigo: string | null; producto: string; cantidad: unknown; via?: Via }) {
    const cantidad = Number(f.cantidad) || 0;
    if (cantidad <= 0) return;
    if (!this.mapa.has(grupo)) this.mapa.set(grupo, new Map());
    const productos = this.mapa.get(grupo)!;
    // Lo que viene por la otra sede va en su propia fila, con su nota.
    const via: Via = f.via || "";
    const clave = `${(f.codigo || f.producto || "").trim().toUpperCase()}|${via}`;
    const ya = productos.get(clave);
    if (ya) ya.cantidad = (ya.cantidad || 0) + cantidad;
    else
      productos.set(clave, {
        codigo: f.codigo || null,
        producto: f.producto,
        cantidad,
        ...(via === "valencia" ? { via_valencia: true as const } : via === "caracas" ? { via_caracas: true as const } : {}),
      });
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
  const sede =
    rol === "superadmin" ? Number(request.nextUrl.searchParams.get("cids") || VALENCIA) : Number(auth.payload?.cids);
  if (!SEDES_LLEGADAS.includes(sede)) {
    return NextResponse.json({ error: "Solo para Valencia y Caracas" }, { status: 403 });
  }

  try {
    // odoo_product_id se agrega sola con la carga en Odoo de la recepcion.
    await asegurarColumnasOdoo();
    await asegurarTablasReparto();
    // Cerrados del ultimo año + todo lo que esta en camino o contandose: los
    // packing list de la sede y los de la otra sede con el reparto activo.
    // La fecha estimada es DATE: se formatea en SQL para que la zona horaria
    // del driver no la corra un dia.
    const r = await query(
      `SELECT r.id AS recepcion_id, r.cids, r.etapa,
              COALESCE(r.llegada_at, r.cerrado_at) AS llegada,
              DATE_FORMAT(r.fecha_estimada, '%Y-%m-%d') AS estimada,
              i.codigo, i.producto, i.odoo_product_id, i.cantidad_esperada, i.cantidad_recibida,
              i.factura_aparte
         FROM recepcion_packing r
         JOIN recepcion_packing_items i ON i.recepcion_id = r.id
        WHERE r.descartado_at IS NULL
          AND (r.cids = ?
               OR (r.cids IN (?, ?) AND EXISTS (
                     SELECT 1 FROM recepcion_reparto_sedes s WHERE s.recepcion_id = r.id AND s.activo = 1)))
          AND (r.etapa <> 'cerrado'
               OR COALESCE(r.llegada_at, r.cerrado_at) >= DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [sede, VALENCIA, CARACAS, DIAS_HISTORIA],
    );
    // La Factura Especial de Caracas (compra directa) nunca entra: ni al
    // inventario de la sede donde llega ni al reparto entre sedes.
    const filas = (r.rows as any[]).filter((f) => !esFacturaEspecial(f));

    // La clave del reparto es la del codigo que se cargo: se toma antes de
    // que completarCodigos le ponga el de Odoo a los que no lo traian.
    for (const f of filas) {
      f.clave = claveProducto(f.codigo, f.producto);
      f.codigoCargado = f.codigo;
    }
    const fracciones = await fraccionesCaracas([...new Set(filas.map((f) => Number(f.recepcion_id)))]);

    // Antes de agrupar: con el codigo, el mismo producto se suma en un renglon.
    await completarCodigos(filas);

    // Primero por packing list + producto + dia/lista, para que la parte de
    // cada sede se redondee una sola vez y las dos sumen lo del producto.
    const porProducto = new Map<string, { grupo: string; f: any; cantidad: number }>();
    for (const f of filas) {
      let grupo: string | null = null;
      let cantidad: unknown = 0;
      if (f.etapa === "cerrado") {
        if (f.llegada) {
          grupo = `${diaLocal(new Date(f.llegada))}|llego`;
          cantidad = f.cantidad_recibida;
        }
      } else if (f.etapa === "descargando") {
        const dia = f.llegada ? diaLocal(new Date(f.llegada)) : f.estimada;
        if (dia) {
          grupo = `${dia}|contando`;
          cantidad = f.cantidad_esperada;
        }
      } else {
        grupo = `${f.estimada || "sin_fecha"}|por_llegar`;
        cantidad = f.cantidad_esperada;
      }
      if (!grupo) continue;
      const llave = `${f.recepcion_id}|${f.clave}|${grupo}`;
      const ya = porProducto.get(llave);
      if (ya) ya.cantidad += Number(cantidad) || 0;
      else porProducto.set(llave, { grupo, f, cantidad: Number(cantidad) || 0 });
    }

    const acc = new Acumulador();
    for (const { grupo, f, cantidad } of porProducto.values()) {
      const llega = Number(f.cids);
      const fraccion = fraccionDeRenglon(fracciones.get(Number(f.recepcion_id)), f.codigoCargado, f.producto);
      let parte: number;
      if (fraccion == null) {
        // Sin reparto (o producto que no quedo en el reparto): todo es de la sede donde llega.
        parte = llega === sede ? cantidad : 0;
      } else {
        // Unidades enteras (el reparto va en cajas completas); una cantidad
        // con decimales se respeta a 3 decimales.
        const bruto = cantidad * fraccion;
        const caracas = Number.isInteger(cantidad) ? Math.round(bruto) : Math.round(bruto * 1000) / 1000;
        parte = sede === CARACAS ? caracas : Math.round((cantidad - caracas) * 1000) / 1000;
      }
      if (parte <= 0) continue;
      const via: Via = llega === sede ? "" : llega === VALENCIA ? "valencia" : "caracas";
      acc.sumar(grupo, { codigo: f.codigo, producto: f.producto, cantidad: parte, via });
    }

    // Lo que va a llegar se muestra sin cantidad: solo que producto viene.
    const sinCantidad = (ps: Producto[]): Producto[] => ps.map(({ cantidad: _c, ...resto }) => resto);

    const dias = new Map<string, Dia>();
    for (const grupo of acc.grupos()) {
      const [fecha, lista] = grupo.split("|") as [string, Lista];
      if (fecha === "sin_fecha") continue;
      if (!dias.has(fecha)) dias.set(fecha, { fecha, llego: [], contando: [], por_llegar: [] });
      const productos = acc.lista(grupo);
      dias.get(fecha)![lista] = lista === "por_llegar" ? sinCantidad(productos) : productos;
    }

    return NextResponse.json({
      success: true,
      sede,
      hoy: diaLocal(new Date()),
      dias: [...dias.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
      sin_fecha: sinCantidad(acc.lista("sin_fecha|por_llegar")),
    });
  } catch (e: any) {
    console.error("[llegadas] error:", e?.message);
    return NextResponse.json({ error: "No se pudo cargar lo que llego" }, { status: 500 });
  }
}
