// GET /api/adminleads/compras-mes/export?desde=YYYY-MM&hasta=YYYY-MM&sede= (o ?mes= para uno)
//
// Clientes del período en Excel: resumen por mes y sede, un renglón por
// cliente, una por factura y una hoja por mes con el detalle de cada factura
// (producto por producto). Mismas sedes que la pantalla (AdminLeads solo la suya).

import { comprasDelPeriodo, periodoPedido, SEDES_COMPRAS, sedesDelUsuario } from "@/lib/adminleads/comprasMes";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const AZUL = "FF2563EB";
const USD = '"$"#,##0.00';
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDelUsuario(auth.payload, sp);
  if (!sedes) return respuestaSedeNoPermitida();

  try {
    const { desde, hasta } = periodoPedido(sp);
    const data = await comprasDelPeriodo(desde, hasta, sedes);

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
    const periodo = desde === hasta ? nombreMes(desde) : `${nombreMes(desde)} a ${nombreMes(hasta)}`;

    // --- Resumen: totales del período y un renglón por mes y sede ---
    const r = data.resumen;
    const wsR = wb.addWorksheet("Resumen");
    encabezar(wsR, ["Mes", "Sede", "Clientes que compraron", "Facturas", "Notas de crédito", "Sin IVA (USD)", "IVA (USD)", "Total (USD)"],
      [14, 12, 14, 11, 12, 16, 14, 16], [6, 7, 8]);
    for (const m of data.porMes) wsR.addRow([nombreMes(m.mes), sede(m.sede), m.clientes, m.facturas, m.nc, m.subtotal, m.iva, m.total]);
    const total = wsR.addRow([periodo, data.sedes.map(sede).join(", "), r.clientes, r.facturas, null, r.subtotal, null, r.total]);
    total.font = { bold: true };
    wsR.addRow([]);
    const nota = wsR.addRow([
      "Facturas de cliente publicadas en Odoo por fecha de factura, sin empresas del grupo. Las notas de crédito restan. " +
        "Un cliente cuenta si tuvo al menos una factura (el mismo cliente en dos sedes cuenta en cada una); en la fila del período " +
        "cada cliente cuenta una vez aunque haya comprado varios meses. Montos en USD. En las hojas de cada mes, IVA y total de la " +
        "factura van solo en su primer renglón.",
    ]);
    wsR.mergeCells(nota.number, 1, nota.number, 8);
    nota.getCell(1).alignment = { wrapText: true, vertical: "top" };
    nota.getCell(1).font = { italic: true, color: { argb: "FF71717A" } };
    nota.height = 60;

    // --- Clientes del período ---
    const wsC = wb.addWorksheet("Clientes");
    encabezar(wsC, ["Cliente", "RIF", "Sede", "Facturas", "Notas de crédito", "Sin IVA (USD)", "IVA (USD)", "Total (USD)"],
      [42, 16, 11, 10, 12, 15, 13, 15], [6, 7, 8]);
    for (const c of data.clientes) {
      const nc = c.facturas.filter((f) => f.nc).length;
      wsC.addRow([c.cliente, c.rif, sede(c.sede), c.facturas.length - nc, nc, c.subtotal, c.iva, c.total]);
    }

    // --- Facturas ---
    const wsF = wb.addWorksheet("Facturas");
    encabezar(wsF, ["Mes", "Cliente", "RIF", "Sede", "Documento", "Tipo", "Fecha", "Vendedor", "Origen / referencia", "Sin IVA (USD)", "IVA (USD)", "Total (USD)"],
      [11, 42, 16, 11, 20, 15, 12, 24, 28, 15, 13, 15], [10, 11, 12]);
    for (const c of data.clientes) {
      for (const f of c.facturas) {
        wsF.addRow([nombreMes(f.fecha.slice(0, 7)), c.cliente, c.rif, sede(c.sede), f.numero, tipo(f.nc), f.fecha, f.vendedor, f.referencia, f.subtotal, f.iva, f.total]);
      }
    }

    // --- Detalle: una hoja por mes ---
    for (const mes of data.meses) {
      const ws = wb.addWorksheet(nombreMes(mes));
      encabezar(ws, ["Cliente", "RIF", "Sede", "Documento", "Tipo", "Fecha", "Vendedor", "Origen / referencia", "Producto", "Descripción",
        "Cantidad", "Precio unit. (USD)", "Descuento %", "Subtotal sin IVA (USD)", "IVA factura (USD)", "Total factura (USD)"],
      [40, 15, 10, 20, 14, 11, 24, 26, 40, 40, 10, 14, 10, 15, 14, 15], [12, 14, 15, 16]);
      ws.getColumn(13).numFmt = "0.##%";
      for (const c of data.clientes) {
        for (const f of c.facturas) {
          if (!f.fecha.startsWith(mes)) continue;
          const base = [c.cliente, c.rif, sede(c.sede), f.numero, tipo(f.nc), f.fecha, f.vendedor, f.referencia];
          if (!f.lineas.length) ws.addRow([...base, "", "", null, null, null, f.subtotal, f.iva, f.total]);
          // IVA y total de la factura solo en su primer renglón, para que sumar la columna no los repita.
          f.lineas.forEach((l, i) =>
            ws.addRow([...base, l.producto, l.descripcion, l.cantidad, l.precio, l.descuento / 100, l.subtotal,
              i === 0 ? f.iva : null, i === 0 ? f.total : null]),
          );
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    const sufijo = data.sedes.length === 1 ? `_${sede(data.sedes[0]).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}` : "";
    const nombre = desde === hasta ? desde : `${desde}_a_${hasta}`;
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clientes_${nombre}${sufijo}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/compras-mes/export error:", error?.message);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
