import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  construirExcel,
  fechaExcel,
  respuestaExcel,
  siNo,
} from "@/lib/seguridad/excel";
import { filtroIngresos } from "@/lib/seguridad/filtros";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET /api/seguridad/ingreso/export  — mismos filtros que el listado.
export async function GET(request: NextRequest) {
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const { searchParams } = new URL(request.url);
  // El mismo builder que usa el listado: lo exportado es lo que se ve.
  const { where, params } = filtroIngresos(searchParams, cids);

  // Sin paginar, pero con techo: exportar es legítimo, tumbar el servidor con
  // una consulta sin límite no.
  const result = await query(
    `SELECT * FROM seguridad_ingresos ${where}
      ORDER BY fecha_entrega DESC, id DESC
      LIMIT 5000`,
    params,
  );

  const buffer = await construirExcel(
    "Ingresos",
    [
      { header: "N.º", key: "id", width: 8 },
      { header: "Fecha de entrega", key: "fecha_entrega", width: 16, valor: (f) => fechaExcel(f.fecha_entrega) },
      { header: "Factura", key: "factura_numero", width: 18 },
      { header: "Cliente", key: "cliente_nombre", width: 34 },
      { header: "Hardware", key: "hardware", width: 30 },
      { header: "Serial", key: "serial", width: 22 },
      { header: "Falla reportada", key: "descripcion_falla", width: 46 },
      { header: "Accesorios íntegros", key: "accesorios_integros", width: 18, valor: (f) => siNo(f.accesorios_integros) },
      { header: "Sin manipulación", key: "sin_manipulacion", width: 17, valor: (f) => siNo(f.sin_manipulacion) },
      // Estos dos checks salieron del formulario de ingreso (#48): la garantía
      // ahora vive congelada en el ticket de RMA. Las columnas quedan por el
      // histórico — en filas nuevas salen en blanco.
      { header: "Dentro de fecha (histórico)", key: "dentro_de_fecha", width: 16, valor: (f) => siNo(f.dentro_de_fecha) },
      { header: "Cubierta por garantía (histórico)", key: "falla_cubierta_garantia", width: 24, valor: (f) => siNo(f.falla_cubierta_garantia) },
      { header: "Recibido por", key: "recibido_por", width: 24 },
      { header: "Ticket RMA", key: "rma_case_id", width: 12 },
      { header: "Registrado", key: "created_at", width: 18, valor: (f) => fechaExcel(f.created_at) },
    ],
    (result.rows as any[]) || [],
  );

  const hoy = new Date().toISOString().slice(0, 10);
  return respuestaExcel(buffer, `ingresos-seguridad-${hoy}.xlsx`);
}
