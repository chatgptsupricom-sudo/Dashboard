import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import {
  construirExcel,
  fechaExcel,
  respuestaExcel,
  siNo,
} from "@/lib/seguridad/excel";
import { filtroDespachos } from "@/lib/seguridad/filtros";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** `facturas_json` guarda un arreglo; en Excel se lee mejor separado por comas. */
function facturas(v: any): string {
  if (!v) return "";
  try {
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.join(", ") : String(v);
  } catch {
    return String(v);
  }
}

// GET /api/seguridad/despacho/export  — mismos filtros que el listado.
export async function GET(request: NextRequest) {
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const { where, params } = filtroDespachos(searchParams);

  // El listado hace LEFT JOIN con ingresos; acá se replica para poder traer el
  // cliente y el serial del ingreso vinculado, que es lo que hace útil el
  // reporte.
  const result = await query(
    `SELECT d.*, i.cliente_nombre AS ingreso_cliente, i.serial AS ingreso_serial
       FROM seguridad_despachos d
       LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
       ${where}
      ORDER BY d.fecha_despacho DESC, d.id DESC
      LIMIT 5000`,
    params,
  );

  const buffer = await construirExcel(
    "Despachos",
    [
      { header: "N.º", key: "id", width: 8 },
      { header: "Fecha de despacho", key: "fecha_despacho", width: 18, valor: (f) => fechaExcel(f.fecha_despacho) },
      { header: "Almacenista", key: "almacenista_nombre", width: 26 },
      { header: "Retira", key: "cliente_retira", width: 30 },
      { header: "Cliente del ingreso", key: "ingreso_cliente", width: 32 },
      { header: "Serial", key: "ingreso_serial", width: 22 },
      { header: "Facturas", key: "facturas_json", width: 30, valor: (f) => facturas(f.facturas_json) },
      { header: "Accesorios íntegros", key: "accesorios_integros", width: 18, valor: (f) => siNo(f.accesorios_integros) },
      { header: "Observaciones", key: "observaciones", width: 46 },
      { header: "Firmado", key: "firma_url", width: 10, valor: (f) => siNo(!!f.firma_url) },
      { header: "Ingreso", key: "ingreso_id", width: 10 },
      { header: "Ticket RMA", key: "rma_case_id", width: 12 },
      { header: "Registrado", key: "created_at", width: 18, valor: (f) => fechaExcel(f.created_at) },
    ],
    (result.rows as any[]) || [],
  );

  const hoy = new Date().toISOString().slice(0, 10);
  return respuestaExcel(buffer, `despachos-seguridad-${hoy}.xlsx`);
}
