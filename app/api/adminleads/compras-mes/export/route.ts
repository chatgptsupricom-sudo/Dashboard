// GET /api/adminleads/compras-mes/export?mes=YYYY-MM&sede=
//
// Clientes del mes en Excel: resumen, un renglón por cliente, una por factura
// y el detalle de cada factura (producto por producto). Mismas sedes que la
// pantalla (AdminLeads solo la suya).

import { comprasDelMes, mesPedido, SEDES_COMPRAS, sedesDelUsuario } from "@/lib/adminleads/comprasMes";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const AZUL = "FF2563EB";
const USD = '"$"#,##0.00';

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDelUsuario(auth.payload, sp);
  if (!sedes) return respuestaSedeNoPermitida();

  try {
    const data = await comprasDelMes(mesPedido(sp), sedes);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    const encabezar = (ws: any, headers: string[], anchos: number[], usd: number[]) => {
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
      for (const c of usd) ws.getColumn(c).numFmt = USD;
    };
    const sede = (n: number) => SEDES_COMPRAS[n] || "";
    const tipo = (nc: boolean) => (nc ? "Nota de crédito" : "Factura");

    // --- Resumen ---
    const r = data.resumen;
    const wsR = wb.addWorksheet("Resumen");
    wsR.columns = [{ width: 40 }, { width: 22 }];
    for (const fila of [
      ["Mes", data.mes],
      ["Sedes", data.sedes.map(sede).join(", ")],
      ["Clientes que compraron", r.clientes],
      ["Facturas", r.facturas],
      ["Monto sin IVA (USD, NC restan)", r.subtotal],
      ["Total con IVA (USD, NC restan)", r.total],
    ]) wsR.addRow(fila);
    wsR.getCell("B5").numFmt = USD;
    wsR.getCell("B6").numFmt = USD;
    wsR.addRow([]);
    const nota = wsR.addRow([
      "Facturas de cliente publicadas en Odoo, por fecha de factura, sin empresas del grupo. Las notas de crédito del mes " +
        "aparecen en la lista y restan. Montos en USD.",
    ]);
    wsR.mergeCells(nota.number, 1, nota.number, 2);
    nota.getCell(1).alignment = { wrapText: true, vertical: "top" };
    nota.getCell(1).font = { italic: true, color: { argb: "FF71717A" } };
    nota.height = 45;

    // --- Clientes ---
    const wsC = wb.addWorksheet("Clientes");
    encabezar(wsC, ["Cliente", "RIF", "Sede", "Facturas", "Notas de crédito", "Sin IVA (USD)", "IVA (USD)", "Total (USD)"],
      [42, 16, 11, 10, 12, 15, 13, 15], [6, 7, 8]);
    for (const c of data.clientes) {
      const nc = c.facturas.filter((f) => f.nc).length;
      wsC.addRow([c.cliente, c.rif, sede(c.sede), c.facturas.length - nc, nc, c.subtotal, c.iva, c.total]);
    }

    // --- Facturas ---
    const wsF = wb.addWorksheet("Facturas");
    encabezar(wsF, ["Cliente", "RIF", "Sede", "Documento", "Tipo", "Fecha", "Vendedor", "Origen / referencia", "Sin IVA (USD)", "IVA (USD)", "Total (USD)"],
      [42, 16, 11, 20, 15, 12, 24, 28, 15, 13, 15], [9, 10, 11]);
    for (const c of data.clientes) {
      for (const f of c.facturas) {
        wsF.addRow([c.cliente, c.rif, sede(c.sede), f.numero, tipo(f.nc), f.fecha, f.vendedor, f.referencia, f.subtotal, f.iva, f.total]);
      }
    }

    // --- Detalle ---
    const wsD = wb.addWorksheet("Detalle de facturas");
    encabezar(wsD, ["Cliente", "RIF", "Sede", "Documento", "Tipo", "Fecha", "Vendedor", "Producto", "Descripción", "Cantidad", "Precio unit. (USD)", "Descuento %", "Subtotal (USD)"],
      [42, 16, 11, 20, 15, 12, 24, 40, 40, 10, 15, 11, 15], [11, 13]);
    for (const c of data.clientes) {
      for (const f of c.facturas) {
        for (const l of f.lineas) {
          wsD.addRow([c.cliente, c.rif, sede(c.sede), f.numero, tipo(f.nc), f.fecha, f.vendedor, l.producto, l.descripcion,
            l.cantidad, l.precio, l.descuento / 100, l.subtotal]);
        }
      }
    }
    wsD.getColumn(12).numFmt = "0.##%";

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    const sufijo = data.sedes.length === 1 ? `_${sede(data.sedes[0]).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}` : "";
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clientes_${data.mes}${sufijo}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/compras-mes/export error:", error?.message);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
