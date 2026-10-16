// GET /api/adminleads/reporte-ventas-campanas/export?desde=&hasta=&sede=
//
// El mismo reporte en Excel, con dos hojas: el resumen por campaña y el detalle
// venta por venta. Usa resolverRango/resolverSede del lib para que el archivo
// coincida exactamente con lo que muestra la pantalla.

import {
  calcularVentasCampanas,
  resolverRango,
  resolverSede,
} from "@/lib/adminleads/ventasCampanas";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

const AZUL = "FF2563EB";
const USD = '"$"#,##0.00';

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const { desde, hasta } = resolverRango(searchParams);

    const data = await calcularVentasCampanas({
      userCids: (auth.payload!.cids as number) ?? null,
      sede: resolverSede(searchParams),
      desde,
      hasta,
    });

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    const encabezar = (ws: any, headers: string[], anchos: number[]) => {
      ws.columns = headers.map((_, i) => ({ key: String(i), width: anchos[i] ?? 18 }));
      const fila = ws.addRow(headers);
      fila.height = 22;
      fila.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    // --- Hoja 1: resumen por campaña ---
    const wsResumen = wb.addWorksheet("Resumen por campaña");
    encabezar(
      wsResumen,
      [
        "Campaña",
        "Canal",
        "Leads que entraron en el período",
        "De esos, vendidos",
        "% Conversión (vendidos ÷ entraron)",
        "Ventas cerradas en el período",
        "Monto cerrado en el período (USD)",
        "Ticket promedio (USD)",
      ],
      [42, 18, 18, 16, 18, 18, 20, 18],
    );
    wsResumen.getRow(1).height = 45; // encabezados largos, en dos o tres líneas
    for (const c of data.resumen) {
      wsResumen.addRow([
        c.campana,
        c.canal,
        c.leadsIngresados,
        c.leadsConvertidos,
        c.conversionPct === null ? "" : c.conversionPct / 100,
        c.ventasPeriodo,
        c.montoPeriodo,
        c.ticketPromedio ?? "",
      ]);
    }
    wsResumen.getColumn(5).numFmt = "0.0%";
    wsResumen.getColumn(7).numFmt = USD;
    wsResumen.getColumn(8).numFmt = USD;
    wsResumen.autoFilter = "A1:H1";

    const totales = wsResumen.addRow([
      "TOTAL",
      "",
      data.totales.leadsIngresados,
      data.totales.leadsConvertidos,
      data.totales.conversionPct === null ? "" : data.totales.conversionPct / 100,
      data.totales.ventas,
      data.totales.monto,
      data.totales.ticketPromedio ?? "",
    ]);
    totales.font = { bold: true };
    totales.eachCell((cell: any) => {
      cell.border = { top: { style: "double", color: { argb: AZUL } } };
    });
    // Pagina Web va aparte: se ve en el reporte pero no suma al TOTAL.
    if (data.totales.paginaWeb.ventas > 0) {
      const web = wsResumen.addRow([
        "Página Web (no suma al total)",
        "",
        "",
        "",
        "",
        data.totales.paginaWeb.ventas,
        data.totales.paginaWeb.monto,
        "",
      ]);
      web.font = { italic: true };
    }
    wsResumen.addRow([]);
    const nota = wsResumen.addRow([
      "Son dos grupos de leads distintos: las columnas C a E miran los leads que entraron en el período (y cuántos de esos ya se vendieron); las columnas F a H, las ventas cerradas en el período aunque el lead haya entrado antes. Por eso una campaña puede tener ventas con 0 leads que entraron.",
    ]);
    nota.font = { italic: true, color: { argb: "FF71717A" } };
    wsResumen.mergeCells(nota.number, 1, nota.number, 8);
    nota.getCell(1).alignment = { wrapText: true, vertical: "top" };
    nota.height = 45;

    // --- Hoja 2: detalle venta por venta ---
    const wsVentas = wb.addWorksheet("Ventas cerradas");
    encabezar(
      wsVentas,
      [
        "Fecha de cierre",
        "Cliente",
        "Empresa",
        "Vendedor",
        "Campaña de origen",
        "Canal",
        "Categoría de interés",
        "Nº Factura",
        "Monto (USD)",
      ],
      [15, 28, 30, 22, 42, 18, 24, 16, 16],
    );
    for (const v of data.ventas) {
      wsVentas.addRow([
        v.fecha,
        v.cliente,
        v.empresa,
        v.vendedor,
        v.campana,
        v.canal,
        v.categoria,
        v.factura,
        v.monto,
      ]);
    }
    wsVentas.getColumn(9).numFmt = USD;
    wsVentas.autoFilter = "A1:I1";

    const buffer = await wb.xlsx.writeBuffer();
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ventas_por_campana_${desde}_${hasta}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error(
      "GET /api/adminleads/reporte-ventas-campanas/export error:",
      error?.message,
    );
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
