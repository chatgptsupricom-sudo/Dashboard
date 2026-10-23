// GET /api/adminleads/recompra/export?sede=&desde=&hasta=&origen=
//
// El reporte de recompra en Excel: resumen, un renglón por cliente, el detalle
// de cada compra posterior y los leads a los que no se les ubicó el RIF.

import { calcularRecompra, filtrosRecompra, SEDES } from "@/lib/adminleads/recompra";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 120;

const AZUL = "FF2563EB";
const USD = '"$"#,##0.00';

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    const filtros = filtrosRecompra(request.nextUrl.searchParams);
    const data = await calcularRecompra({ userCids: (auth.payload!.cids as number) ?? null, ...filtros });

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    const encabezar = (ws: any, headers: string[], anchos: number[]) => {
      ws.columns = headers.map((_, i) => ({ key: String(i), width: anchos[i] ?? 16 }));
      const fila = ws.addRow(headers);
      fila.height = 32;
      fila.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    };
    const sede = (n: number | null) => (n != null && SEDES[n]) || "";

    // --- Resumen ---
    const r = data.resumen;
    const wsR = wb.addWorksheet("Resumen");
    wsR.columns = [{ width: 46 }, { width: 18 }];
    const filas: [string, any][] = [
      ["Clientes que llegaron por un lead y compraron", r.clientes],
      ["Volvieron a comprar", r.conRecompra],
      ["% que volvió a comprar", r.pctRecompra == null ? "" : r.pctRecompra / 100],
      ["Compras después de la primera venta", r.comprasDespues],
      ["Monto de esas compras (USD)", r.montoDespues],
      ["Ya eran clientes antes del lead", r.yaEranClientes],
      ["Leads vendidos sin RIF ubicado (no entran)", data.sinRif.length],
      ["", ""],
      ["Compras después de la primera venta", "Clientes"],
      ...data.resumen.distribucion.map((d) => [d.rango, d.clientes] as [string, any]),
    ];
    for (const [k, v] of filas) wsR.addRow([k, v]);
    wsR.getCell("B3").numFmt = "0.0%";
    wsR.getCell("B5").numFmt = USD;
    wsR.getRow(9).font = { bold: true };
    wsR.addRow([]);
    const nota = wsR.addRow([
      `Filtros: sede ${sede(filtros.sede) || "todas"}, origen ${filtros.origen || "todos"}, primera venta ${filtros.desde || "…"} a ${filtros.hasta || "…"}. ` +
        `Las compras se buscan por RIF en todas las sedes: hasta el ${data.corte} en Smartbit, desde esa fecha en Odoo (facturas de cliente, sin notas de crédito). ` +
        `Las facturas de hasta ${data.ventana} días después de la primera venta se toman como parte de ella.`,
    ]);
    wsR.mergeCells(nota.number, 1, nota.number, 2);
    nota.getCell(1).alignment = { wrapText: true, vertical: "top" };
    nota.getCell(1).font = { italic: true, color: { argb: "FF71717A" } };
    nota.height = 75;

    // --- Clientes ---
    const wsC = wb.addWorksheet("Clientes");
    encabezar(
      wsC,
      [
        "Cliente", "RIF", "Sede", "Origen del lead", "Vendedor", "Campaña / red", "Entró el lead",
        "Primera venta", "Monto primera venta (USD)", "Compras antes del lead", "Sedes donde compraba antes", "Compras después",
        "Monto después (USD)", "Primera recompra", "Días hasta recomprar", "Última compra",
      ],
      [38, 14, 11, 12, 22, 26, 13, 13, 16, 13, 18, 12, 16, 14, 13, 13],
    );
    for (const c of data.clientes) {
      wsC.addRow([
        c.cliente, c.rif, sede(c.sede), c.origen, c.vendedor, c.campana, c.entrada, c.primeraVenta, c.montoPrimera,
        c.comprasAntes, c.sedesAntes.map(sede).join(", "), c.comprasDespues, c.montoDespues, c.primeraRecompra ?? "", c.diasHastaRecompra ?? "",
        c.ultimaCompra ?? "",
      ]);
    }
    wsC.getColumn(9).numFmt = USD;
    wsC.getColumn(13).numFmt = USD;

    // --- Compras posteriores ---
    const wsD = wb.addWorksheet("Compras después");
    encabezar(wsD, ["Cliente", "RIF", "Fecha", "Sede", "Documento", "Sistema", "Monto (USD)"], [38, 14, 12, 11, 18, 11, 14]);
    for (const c of data.clientes) {
      for (const d of c.despues) wsD.addRow([c.cliente, c.rif, d.fecha, sede(d.sede), d.documento, d.fuente, d.monto]);
    }
    wsD.getColumn(7).numFmt = USD;

    // --- Sin RIF ---
    const wsS = wb.addWorksheet("Sin RIF");
    encabezar(wsS, ["Origen", "Lead", "Fecha", "Sede", "Vendedor", "Factura / pedido"], [10, 40, 12, 11, 22, 30]);
    for (const s of data.sinRif) wsS.addRow([s.origen, s.nombre, s.fecha ?? "", sede(s.sede), s.vendedor, s.factura]);

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="recompra_clientes_leads.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/recompra/export error:", error?.message);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
