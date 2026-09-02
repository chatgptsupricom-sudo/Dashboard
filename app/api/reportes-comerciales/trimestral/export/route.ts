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

    const encabezar = (ws: any) => {
      ws.getRow(1).eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    // Hoja 1: detalle linea a linea (equivale a "Ventas - Devoluciones")
    const wsDet = wb.addWorksheet("Ventas - Devoluciones");
    wsDet.columns = [
      { key: "fecha", header: "Fecha", width: 12 },
      { key: "numero", header: "Numero", width: 18 },
      { key: "cliente", header: "Cliente", width: 42 },
      { key: "producto", header: "Producto", width: 55 },
      { key: "vendedor", header: "Vendedor", width: 24 },
      { key: "departamento", header: "Departamento", width: 20 },
      { key: "unidades", header: "Unidades", width: 12 },
      { key: "venta", header: "Venta", width: 14 },
    ];
    detalle.forEach((d) => wsDet.addRow(d));
    wsDet.getColumn("venta").numFmt = "#,##0.00";
    encabezar(wsDet);

    // Hoja 2: las 4 tablas (equivale a "VENTA TRIMESTRAL")
    const wsPiv = wb.addWorksheet("Venta Trimestral");
    const bloque = (titulo: string, cols: string[], filas: any[][]) => {
      wsPiv.addRow([titulo]);
      const hdr = wsPiv.addRow(cols);
      hdr.eachCell((c: any) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      });
      filas.forEach((f) => wsPiv.addRow(f));
      wsPiv.addRow([]);
    };
    wsPiv.columns = [{ width: 46 }, { width: 16 }, { width: 14 }];
    bloque(
      "Ranking de Clientes (por Venta)",
      ["Cliente", "Venta", "Unidades"],
      reporte.rankingClientes.map((f) => [f.nombre, f.venta, f.unidades]),
    );
    bloque(
      "Ranking de Productos (por Unidades)",
      ["Producto", "Unidades", "Venta"],
      reporte.rankingProductos.map((f) => [f.nombre, f.unidades, f.venta]),
    );
    bloque(
      "Venta por Departamento",
      ["Departamento", "Venta", "Unidades"],
      reporte.porDepartamento.map((f) => [f.nombre, f.venta, f.unidades]),
    );
    bloque(
      "Venta por Vendedor",
      ["Vendedor", "Venta", "Unidades"],
      reporte.porVendedor.map((f) => [f.nombre, f.venta, f.unidades]),
    );
    if (reporte.porMarca.length > 0) {
      bloque(
        "Venta por Marca",
        ["Marca", "Venta", "Unidades"],
        reporte.porMarca.map((f) => [f.nombre, f.venta, f.unidades]),
      );
    }

    // Hoja 3: EPP
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
