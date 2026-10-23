import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import {
  conciliacionSemana,
  miniaturasDeComprobantes,
  rangoSemana,
  recortesDeMovimientos,
  sedeBinance,
  type PagoBinance,
} from "@/lib/administracion/binance";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { ETIQUETA_ESTADO } from "@/lib/administracion/binanceEstados";

// GET /api/administracion/binance/excel?semana=YYYY-MM-DD
// La conciliacion de la semana con la imagen de cada comprobante y el recorte
// de su linea en el estado de cuenta. Se arma aca porque el Excel del navegador
// (xlsx) no puede llevar imagenes.

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });

// Id del movimiento del estado de cuenta ("e12" -> 12); los de la API no tienen recorte.
const idMovimiento = (p: PagoBinance | null) => (p && /^e\d+$/.test(p.id) ? Number(p.id.slice(1)) : null);

// Ancho de columna de Excel (caracteres) para que entre una imagen de `px` pixeles.
const anchoPara = (px: number) => Math.ceil(px / 7) + 2;
const PX_A_PUNTOS = 0.75;

type Imagen = { datos: Buffer; ancho: number; alto: number };

function ponerImagen(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, img: Imagen, col: number, fila: ExcelJS.Row) {
  const id = wb.addImage({ buffer: img.datos as any, extension: "jpeg" });
  // Centrada en el alto de la fila (el offset de exceljs es fraccion de la fila).
  const altoFila = (fila.height || 15) / PX_A_PUNTOS;
  const margen = Math.max(0, (altoFila - img.alto) / 2 / altoFila);
  ws.addImage(id, { tl: { col: col + 0.05, row: fila.number - 1 + margen }, ext: { width: img.ancho, height: img.alto } } as any);
}

function cabecera(ws: ExcelJS.Worksheet) {
  const fila = ws.getRow(1);
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  fila.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const semana = request.nextUrl.searchParams.get("semana") || "";
  if (!rangoSemana(semana)) {
    return NextResponse.json({ error: "La semana debe ser un lunes (YYYY-MM-DD)" }, { status: 400 });
  }
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  try {
    const { comprobantes, sinComprobante } = await conciliacionSemana(semana, sede);
    const miniaturas = await miniaturasDeComprobantes(comprobantes.map((c) => c.id));
    const idsMov = [...comprobantes.map((c) => idMovimiento(c.binance)), ...sinComprobante.map(idMovimiento)];
    const recortes = await recortesDeMovimientos(idsMov.filter((n): n is number => n !== null));
    const anchoRecorte = Math.max(300, ...[...recortes.values()].map((r) => r.ancho));

    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet("Conciliación");
    ws.columns = [
      { header: "Fecha comprobante", key: "fecha", width: 18 },
      { header: "ID de orden", key: "orden", width: 22 },
      { header: "Monto", key: "monto", width: 12 },
      { header: "Moneda", key: "moneda", width: 9 },
      { header: "Estado", key: "estado", width: 30 },
      { header: "Pagador", key: "pagador", width: 22 },
      { header: "Fecha en Binance", key: "fechaBinance", width: 18 },
      { header: "Comprobante", key: "imagen", width: anchoPara(220) },
      { header: "Línea del estado de cuenta", key: "linea", width: anchoPara(anchoRecorte) },
    ];
    cabecera(ws);
    for (const c of comprobantes) {
      const fila = ws.addRow({
        fecha:
          c.fechaEstimada && !c.binance
            ? c.soloDia
              ? `${new Date(c.fecha).toLocaleDateString("es-VE", { timeZone: "America/Caracas", dateStyle: "short" })} (sin hora)`
              : "Sin fecha"
            : fechaHora(c.fecha),
        orden: c.orderId,
        monto: c.monto,
        moneda: c.moneda,
        estado: ETIQUETA_ESTADO[c.estado],
        pagador: c.binance?.pagador || "",
        fechaBinance: c.binance ? fechaHora(c.binance.fecha) : "",
      });
      fila.alignment = { vertical: "middle", wrapText: true };
      const mini = miniaturas.get(c.id);
      const recorte = recortes.get(idMovimiento(c.binance) ?? -1);
      fila.height = (Math.max(mini?.alto || 0, recorte?.alto || 0, 20) + 10) * PX_A_PUNTOS;
      if (mini) ponerImagen(wb, ws, mini, 7, fila);
      else fila.getCell("imagen").value = "(PDF, ver en el panel)";
      if (recorte) ponerImagen(wb, ws, recorte, 8, fila);
      else if (c.binance) fila.getCell("linea").value = "(sin recorte: estado de cuenta en PDF o anterior)";
    }
    ws.getColumn("monto").numFmt = "#,##0.00######";

    const ws2 = wb.addWorksheet("Sin comprobante");
    ws2.columns = [
      { header: "Fecha", key: "fecha", width: 18 },
      { header: "Monto", key: "monto", width: 12 },
      { header: "Moneda", key: "moneda", width: 9 },
      { header: "Pagador", key: "pagador", width: 22 },
      { header: "Línea del estado de cuenta", key: "linea", width: anchoPara(anchoRecorte) },
    ];
    cabecera(ws2);
    for (const p of sinComprobante) {
      const fila = ws2.addRow({ fecha: fechaHora(p.fecha), monto: p.monto, moneda: p.moneda, pagador: p.pagador });
      fila.alignment = { vertical: "middle" };
      const recorte = recortes.get(idMovimiento(p) ?? -1);
      fila.height = (Math.max(recorte?.alto || 0, 20) + 10) * PX_A_PUNTOS;
      if (recorte) ponerImagen(wb, ws2, recorte, 4, fila);
    }
    ws2.getColumn("monto").numFmt = "#,##0.00######";

    // Resumen por moneda: Binance recibe USDT, USDC... y no se mezclan.
    const suma = (items: { monto: number; moneda: string }[]) => {
      const m = new Map<string, number>();
      items.forEach((i) => m.set(i.moneda, (m.get(i.moneda) || 0) + i.monto));
      return [...m].map(([moneda, monto]) => `${monto.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${moneda}`).join(" · ") || "0";
    };
    const conciliados = comprobantes.filter((c) => c.estado === "conciliado" || c.estado === "manual");
    const pendientes = comprobantes.filter((c) => c.estado !== "conciliado" && c.estado !== "manual");
    const ws3 = wb.addWorksheet("Resumen");
    ws3.columns = [
      { header: "Concepto", key: "c", width: 36 },
      { header: "Cantidad", key: "n", width: 12 },
      { header: "Monto", key: "m", width: 30 },
    ];
    cabecera(ws3);
    ws3.addRow({ c: `Semana del ${semana}` });
    ws3.addRow({ c: "Comprobantes subidos", n: comprobantes.length, m: suma(comprobantes) });
    ws3.addRow({ c: "Conciliados", n: conciliados.length, m: suma(conciliados) });
    ws3.addRow({ c: "Con diferencia, por revisar o no encontrados", n: pendientes.length, m: suma(pendientes) });
    ws3.addRow({ c: "Pagos en Binance sin comprobante", n: sinComprobante.length, m: suma(sinComprobante) });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Conciliacion_Binance_${semana}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[binance] excel:", e?.message);
    return NextResponse.json({ error: "No se pudo armar el Excel" }, { status: 500 });
  }
}
