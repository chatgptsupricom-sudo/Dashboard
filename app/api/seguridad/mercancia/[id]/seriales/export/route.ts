import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { construirExcel, respuestaExcel } from "@/lib/seguridad/excel";
import { cargarMovimiento } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/[id]/seriales/export
 *
 * Seriales del egreso (issue #301): los esperados del picking, con si
 * Seguridad los pistoleo en C4, quien y cuando; y abajo los que se
 * pistolearon sin estar en el picking (sobras y seriales de otra orden).
 */

/** Fecha y hora de Caracas, donde estan los almacenes. */
function horaCaracas(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

type Fila = {
  producto: string;
  codigo: string | null;
  serial: string;
  estado: string;
  verificado_por: string | null;
  verificado_at: string | null;
  ronda: number | string;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAlmacenOSeguridad(request);
  if (auth.error) return auth.error;
  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const id = parseInt((await params).id, 10);
  if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const datos = await cargarMovimiento(id);
  if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids) || datos.movimiento.tipo !== "egreso") {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const item = new Map<number, any>(datos.items.map((i: any) => [Number(i.id), i]));
  const filas: Fila[] = datos.seriales.map((s) => ({
    producto: item.get(Number(s.item_id))?.producto || "",
    codigo: item.get(Number(s.item_id))?.codigo || null,
    serial: s.serial,
    estado: s.verificado_at ? "Verificado" : "Sin verificar",
    verificado_por: s.verificado_por,
    verificado_at: s.verificado_at,
    ronda: "",
  }));
  for (const n of datos.novedades) {
    if (n.origen !== "escaneo" || !n.serial) continue;
    filas.push({
      producto: n.item_id !== null ? item.get(n.item_id)?.producto || n.producto : "(no está en la orden)",
      codigo: n.item_id !== null ? item.get(n.item_id)?.codigo || null : null,
      serial: n.serial,
      estado:
        n.tipo === "serial_otra_orden"
          ? `De otra orden (${n.otra_orden || "—"})`
          : n.tipo === "producto_ajeno"
            ? `Producto que no está en la orden (x${n.contado ?? 1})`
            : "No está en el picking",
      verificado_por: n.registrado_por,
      verificado_at: n.created_at,
      ronda: n.ronda,
    });
  }

  const buffer = await construirExcel(
    "Seriales",
    [
      { header: "Producto", key: "producto", width: 40 },
      { header: "Código", key: "codigo", width: 18 },
      { header: "Serial", key: "serial", width: 26 },
      { header: "Estado", key: "estado", width: 34 },
      { header: "Pistoleado por", key: "verificado_por", width: 24 },
      { header: "Hora", key: "verificado_at", width: 18, valor: (f) => horaCaracas(f.verificado_at) },
      { header: "Ronda", key: "ronda", width: 8 },
    ],
    filas,
  );

  const nombre = String(datos.movimiento.odoo_picking_name || `egreso-${id}`).replace(/[^\w.-]+/g, "-");
  return respuestaExcel(buffer, `seriales-${nombre}.xlsx`);
}
