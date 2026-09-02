import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { query } from "@/lib/db";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import {
  calcularEpp,
  COMPANY_ID_PANAMA,
  construirReporteCompleto,
} from "@/lib/reportes-comerciales/reporteTrimestral";
import { ensureTablasReportesComerciales } from "@/lib/reportes-comerciales/tablas";

export const runtime = "nodejs";
export const maxDuration = 120;

const JWT_SECRET = jwtSecretBytes();
const AZUL = "FF1E40AF";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTablasReportesComerciales();
    const { searchParams } = new URL(request.url);
    const trimestre = searchParams.get("trimestre") || "";
    const marca = (searchParams.get("marca") || "EZVIZ").trim();
    if (!trimestre) return NextResponse.json({ error: "Falta 'trimestre'" }, { status: 400 });

    const { reporte, detalle } = await construirReporteCompleto({ trimestre, marca });
    const anio = parseInt(reporte.periodo.trimestre.slice(0, 4), 10);
    const { rows: filasEpp } = await query(
      `SELECT id, cliente_nombre, odoo_partner_id, meta_anual
         FROM epp_clientes
        WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
        ORDER BY meta_anual DESC`,
      [COMPANY_ID_PANAMA, anio, reporte.periodo.marca],
    );
    const epp = calcularEpp(reporte.rankingClientes, filasEpp as any);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const HEADER = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: AZUL } } };
    const q = reporte.periodo.trimestre.split("-Q")[1] || "";
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    const encabezar = (ws: any) => {
      ws.getRow(1).eachCell((cell: any) => {
        Object.assign(cell, HEADER);
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    // ── Hoja 1: "VENTA TRIMESTRAL Qn" — las 4 tablas, una al lado de la otra ──
    const wsPiv = wb.addWorksheet(`VENTA TRIMESTRAL Q${q}`.trim());
    wsPiv.columns = [
      { width: 46 }, { width: 15 }, { width: 3 },
      { width: 60 }, { width: 16 }, { width: 3 },
      { width: 20 }, { width: 15 },
    ];
    // coloca una sub-tabla en (fila, col) con encabezado; devuelve la fila libre siguiente
    const bloque = (fila: number, col: number, headers: string[], filas: any[][]) => {
      headers.forEach((h, i) => Object.assign(wsPiv.getCell(fila, col + i), { value: h }, HEADER));
      filas.forEach((f, r) =>
        f.forEach((v, i) => (wsPiv.getCell(fila + 1 + r, col + i).value = v)),
      );
      return fila + 1 + filas.length;
    };
    const totVta = (fs: { venta: number }[]) => round2(fs.reduce((s, f) => s + f.venta, 0));

    bloque(1, 1, ["Cliente", "Suma de Venta"], reporte.rankingClientes.map((f) => [f.nombre, f.venta]));
    bloque(1, 4, ["Producto", "Suma de Unidades"], reporte.rankingProductos.map((f) => [f.nombre, f.unidades]));
    const finDepto = bloque(1, 7, ["Departamento", "Suma de Venta"], [
      ...reporte.porDepartamento.map((f) => [f.nombre, f.venta]),
      ["Total general", totVta(reporte.porDepartamento)],
    ]);
    const finVend = bloque(finDepto + 2, 7, ["Vendedor", "Suma de Venta"], [
      ...reporte.porVendedor.map((f) => [f.nombre, f.venta]),
      ["Total general", totVta(reporte.porVendedor)],
    ]);
    if (reporte.porMarca.length > 0) {
      bloque(finVend + 2, 7, ["Marca", "Suma de Venta"], reporte.porMarca.map((f) => [f.nombre, f.venta]));
    }
    wsPiv.getColumn(2).numFmt = "#,##0.00";
    wsPiv.getColumn(8).numFmt = "#,##0.00";
    wsPiv.views = [{ state: "frozen", ySplit: 1 }];

    // ── Hoja 2: EPP ──
    const wsEpp = wb.addWorksheet("EPP");
    wsEpp.columns = [
      { key: "cliente", header: "Cliente", width: 46 },
      { key: "meta_anual", header: "Meta Anual", width: 16 },
      { key: "meta_trim", header: "Meta Trimestre", width: 16 },
      { key: "real", header: "Real del Trimestre", width: 18 },
      { key: "cumplimiento", header: "Cumplimiento", width: 14 },
    ];
    epp.forEach((c) =>
      wsEpp.addRow({
        cliente: c.clienteNombre,
        meta_anual: c.metaAnual,
        meta_trim: c.metaTrimestre,
        real: c.realTrimestre,
        cumplimiento: c.cumplimiento,
      }),
    );
    ["meta_anual", "meta_trim", "real"].forEach((k) => (wsEpp.getColumn(k).numFmt = "#,##0.00"));
    wsEpp.getColumn("cumplimiento").numFmt = "0.0%";
    encabezar(wsEpp);

    // ── Hoja 3: "Ventas - Devoluciones" — detalle linea a linea ──
    const wsDet = wb.addWorksheet("Ventas - Devoluciones");
    wsDet.columns = [
      { key: "fecha", header: "Fecha", width: 12 },
      { key: "numero", header: "Numero", width: 18 },
      { key: "cuenta", header: "Cuenta", width: 10 },
      { key: "cliente", header: "Cliente", width: 42 },
      { key: "linea", header: "Linea", width: 14 },
      { key: "articulo", header: "Articulo", width: 60 },
      { key: "vendedor", header: "Vendedor", width: 22 },
      { key: "departamento", header: "Departamento", width: 16 },
      { key: "unidades", header: "Unidades", width: 10 },
      { key: "venta", header: "Venta", width: 12 },
    ];
    detalle.forEach((d) => wsDet.addRow(d));
    wsDet.getColumn("venta").numFmt = "#,##0.00";
    encabezar(wsDet);

    const buffer = await wb.xlsx.writeBuffer();
    const hoy = new Date().toISOString().slice(0, 10);
    const filename = `reporte_ventas_panama_${reporte.periodo.marca}_${reporte.periodo.trimestre}_${hoy}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error export reporte trimestral:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
