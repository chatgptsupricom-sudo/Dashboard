import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { construirExcel, fechaExcel, respuestaExcel } from "@/lib/seguridad/excel";
import { filtroMercancia } from "@/lib/seguridad/filtros";
import { esEtapa, esTipoEntrega, resultadoEgreso } from "@/lib/seguridad/egresoFlujo";
import { parsearLista } from "@/lib/seguridad/mercancia";
import es from "@/messages/es.json";
import { createTranslator } from "next-intl";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Las etiquetas salen de los mismos textos que la pantalla, en espanol como
// los demas Excel del modulo: si se renombra una etapa, el Excel se entera.
const tf = createTranslator({
  locale: "es",
  messages: es as any,
  namespace: "seguridad.mercancia.flujo" as any,
}) as unknown as (clave: string) => string;

const etiqueta = (grupo: string, valor: unknown) =>
  valor ? tf(`${grupo}.${String(valor)}`) : "";

// GET /api/seguridad/mercancia/export — mismos filtros que el listado
// (tipo, estado, tipo_entrega). Lo ven Almacen y Seguridad, igual que la lista.
export async function GET(request: NextRequest) {
  try {
    return await exportar(request);
  } catch (error: any) {
    // JSON y no la pagina de error de Next: la lista lo baja con fetch y
    // muestra el mensaje ahi mismo, sin sacar al usuario del panel.
    console.error("Error exportando egresos de mercancia:", error);
    return NextResponse.json({ error: error?.message || "No se pudo exportar" }, { status: 500 });
  }
}

async function exportar(request: NextRequest) {
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
        // En el egreso, facturas_json son las ordenes de despacho del camion
        // (asi las llama la pantalla), no facturas de venta.
        header: "Orden(es) de despacho",
        key: "facturas_json",
        width: 22,
        valor: (f) => {
          const lista = parsearLista(f.facturas_json);
          return (lista.length ? lista : [f.factura_numero].filter(Boolean)).join(", ");
        },
      },
      // Factura de venta traida de Odoo al registrar el egreso (#298). Sin la
      // migracion sql/egreso_facturas_venta.sql la columna no existe y sale vacia.
      {
        header: "Factura de venta",
        key: "facturas_venta_json",
        width: 22,
        valor: (f) => parsearLista(f.facturas_venta_json).join(", "),
      },
      {
        header: "Fecha de factura",
        key: "factura_venta_fecha",
        width: 14,
        valor: (f) => fechaExcel(f.factura_venta_fecha),
      },
      { header: "Tipo de entrega", key: "tipo_entrega", width: 18, valor: (f) => (esTipoEntrega(f.tipo_entrega) ? etiqueta("entrega", f.tipo_entrega) : "") },
      { header: "Chofer", key: "chofer_nombre", width: 24 },
      { header: "Placa", key: "placa_vehiculo", width: 14 },
      { header: "Almacenista del armado", key: "almacenista_armado", width: 24 },
      { header: "Almacenista de despacho", key: "almacenista_despacho", width: 24 },
      { header: "Etapa", key: "etapa", width: 20, valor: (f) => (esEtapa(f.etapa) ? etiqueta("etapa", f.etapa) : "") },
      { header: "Resultado", key: "aprobado", width: 30, valor: (f) => etiqueta("resultado", resultadoEgreso(f)) },
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
