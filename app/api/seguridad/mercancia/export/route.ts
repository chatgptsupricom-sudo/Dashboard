import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { construirExcel, fechaExcel, respuestaExcel } from "@/lib/seguridad/excel";
import { filtroMercancia } from "@/lib/seguridad/filtros";
import { parsearLista } from "@/lib/seguridad/mercancia";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ENTREGA: Record<string, string> = {
  ruta: "Ruta",
  puerta: "Retira el cliente",
  encomienda: "Encomienda",
};

const ETAPA: Record<string, string> = {
  por_armar: "Por armar",
  armando: "Armando",
  pre_despacho: "Pre-despacho",
  por_empaquetar: "Por empaquetar",
  por_asignar_despacho: "Por asignar despacho",
  por_verificar: "En portón",
  por_calificar: "Por calificar",
  cerrado: "Cerrado",
};

function resultado(f: any): string {
  if (f.aprobado === null || f.aprobado === undefined) return "";
  if (Number(f.aprobado) === 1) return "Aprobado y despachado";
  return Number(f.despachado) === 1 ? "No aprobado — se despachó igual" : "No aprobado — no se despachó";
}

// GET /api/seguridad/mercancia/export — mismos filtros que el listado
// (tipo, estado, tipo_entrega). Lo ven Almacen y Seguridad, igual que la lista.
export async function GET(request: NextRequest) {
  const auth = await requireAlmacenOSeguridad(request);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const { where, params } = filtroMercancia(new URL(request.url).searchParams, cids);

  // Sin paginar, pero con techo: exportar es legitimo, tumbar el servidor con
  // una consulta sin limite no.
  const result = await query(
    `SELECT m.*,
      (SELECT COUNT(*) FROM seguridad_mercancia_items i
        WHERE i.mercancia_id = m.id) AS total_items,
      (SELECT COUNT(*) FROM seguridad_mercancia_items i
        WHERE i.mercancia_id = m.id
          AND i.cantidad_verificada IS NOT NULL
          AND i.cantidad_verificada <> i.cantidad_cargada) AS items_con_diferencia
     FROM seguridad_mercancia m ${where}
     ORDER BY m.fecha DESC, m.id DESC
     LIMIT 5000`,
    params,
  );

  const buffer = await construirExcel(
    "Egresos",
    [
      { header: "N.º", key: "id", width: 8 },
      { header: "Fecha", key: "fecha", width: 14, valor: (f) => fechaExcel(f.fecha) },
      { header: "Orden", key: "odoo_picking_name", width: 20 },
      { header: "Cliente", key: "contraparte", width: 34 },
      {
        header: "Factura(s)",
        key: "facturas_json",
        width: 22,
        valor: (f) => {
          const lista = parsearLista(f.facturas_json);
          return (lista.length ? lista : [f.factura_numero].filter(Boolean)).join(", ");
        },
      },
      { header: "Tipo de entrega", key: "tipo_entrega", width: 18, valor: (f) => ENTREGA[f.tipo_entrega] ?? "" },
      { header: "Chofer", key: "chofer_nombre", width: 24 },
      { header: "Placa", key: "placa_vehiculo", width: 14 },
      { header: "Almacenista del armado", key: "almacenista_armado", width: 24 },
      { header: "Almacenista de despacho", key: "almacenista_despacho", width: 24 },
      { header: "Etapa", key: "etapa", width: 20, valor: (f) => ETAPA[f.etapa] ?? "" },
      { header: "Resultado", key: "aprobado", width: 30, valor: resultado },
      { header: "Motivo", key: "motivo_no_aprobado", width: 40 },
      { header: "Renglones", key: "total_items", width: 11 },
      { header: "Con diferencia", key: "items_con_diferencia", width: 14 },
      { header: "Verificado por", key: "verificado_por", width: 24 },
      { header: "Verificado", key: "verificado_at", width: 18, valor: (f) => fechaExcel(f.verificado_at) },
    ],
    (result.rows as any[]) || [],
  );

  const hoy = new Date().toISOString().slice(0, 10);
  return respuestaExcel(buffer, `egresos-mercancia-${hoy}.xlsx`);
}
