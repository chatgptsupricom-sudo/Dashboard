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
        `Las compras se buscan por RIF en las sedes de la operación del lead (Valencia y Caracas juntas, Panamá aparte): hasta el ${data.corte} en Smartbit, desde esa fecha en Odoo (facturas de cliente, sin notas de crédito). ` +
        `La fecha de cierre del lead es la de su primera compra; las facturas de hasta ${data.ventana} días después se toman como parte de ella. ` +
        `"Compras después" son las de después de ese cierre, en cualquier sede de esa operación.`,
    ]);
    wsR.mergeCells(nota.number, 1, nota.number, 2);
    nota.getCell(1).alignment = { wrapText: true, vertical: "top" };
    nota.getCell(1).font = { italic: true, color: { argb: "FF71717A" } };
    nota.height = 75;

    // --- Clientes: una hoja por operación, con solo sus sedes ---
    // Lo de después del lead se abre por sede: un cliente que llegó por Valencia puede recomprar en Caracas.
    const operaciones = [
      { hoja: "Clientes Venezuela", sedes: [9, 10], clientes: data.clientes.filter((c) => c.sede !== 7) },
      { hoja: "Clientes Panamá", sedes: [7], clientes: data.clientes.filter((c) => c.sede === 7) },
    ];
    for (const { hoja, sedes, clientes } of operaciones) {
      // Panamá solo si tiene clientes; Venezuela siempre, salvo que todo sea de Panamá.
      if (!clientes.length && (hoja === "Clientes Panamá" || data.clientes.length)) continue;
      const wsC = wb.addWorksheet(hoja);
      encabezar(
        wsC,
        [
          "Cliente", "RIF", "Sede del lead", "Origen del lead", "Vendedor", "Campaña / red", "Entró el lead",
          "Cierre del lead (primera compra)", "Monto primera compra (USD)", "Compras antes del lead", "Sedes donde compraba antes",
          "Compras después del lead", "Monto después del lead (USD)",
          ...sedes.flatMap((s) => [`Compras después en ${SEDES[s]}`, `Monto después en ${SEDES[s]} (USD)`]),
          "Primera recompra", "Sede de la primera recompra", "Días del cierre a la primera recompra",
          "Última compra", "Sede de la última compra",
        ],
        [38, 14, 11, 12, 22, 26, 13, 16, 16, 13, 18, 13, 16, ...sedes.flatMap(() => [13, 16]), 14, 14, 15, 13, 14],
      );
      for (const c of clientes) {
        const ultima = c.despues[c.despues.length - 1];
        wsC.addRow([
          c.cliente, c.rif, sede(c.sede), c.origen, c.vendedor, c.campana, c.entrada, c.primeraVenta, c.montoPrimera,
          c.comprasAntes, c.sedesAntes.map(sede).join(", "), c.comprasDespues, c.montoDespues,
          ...sedes.flatMap((s) => {
            const en = c.despues.filter((d) => d.sede === s);
            return [en.length, Math.round(en.reduce((t, d) => t + d.monto, 0) * 100) / 100];
          }),
          c.primeraRecompra ?? "", sede(c.despues[0]?.sede ?? null), c.diasHastaRecompra ?? "",
          c.ultimaCompra ?? "", sede(ultima?.sede ?? null),
        ]);
      }
      for (const col of [9, 13, ...sedes.map((_, i) => 15 + i * 2)]) wsC.getColumn(col).numFmt = USD;
    }

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
