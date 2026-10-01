import {
  calcularRotacion,
  resolverCompanies,
  type EstadoRotacion,
  type FilaRotacion,
} from "@/lib/adminleads/rotacion";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

const ESTADO_LABEL: Record<EstadoRotacion, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/**
 * GET /api/adminleads/rotacion/export?formato=xlsx|csv
 *   &categoria=&marca=&estado=&q=
 *
 * Exporta el reporte de rotación con las columnas del brief. Respeta los
 * mismos filtros que la tabla (se pasan por query). Solo cantidades físicas.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const companies = resolverCompanies(auth.payload!);
    if (!companies) {
      return NextResponse.json({ error: "Sin sucursal asignada" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const formato = searchParams.get("formato") === "csv" ? "csv" : "xlsx";
    const fCategoria = (searchParams.get("categoria") || "").trim();
    const fMarca = (searchParams.get("marca") || "").trim();
    const fEstado = (searchParams.get("estado") || "").trim().toLowerCase();
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const { filas } = await calcularRotacion(companies);

    const filtradas = filas.filter((f) => {
      if (fCategoria && f.categoria !== fCategoria) return false;
      if (fMarca && f.marca !== fMarca) return false;
      if (fEstado && f.estado !== fEstado) return false;
      if (q && !(`${f.sku} ${f.nombre} ${f.marca}`.toLowerCase().includes(q))) return false;
      return true;
    });

    const fecha = new Date().toISOString().slice(0, 10);
    const nombreBase = `rotacion_skus_${fecha}`;

    const columnas: { header: string; get: (f: FilaRotacion) => string | number }[] = [
      { header: "SKU", get: (f) => f.sku },
      { header: "Nombre del producto", get: (f) => f.nombre },
      { header: "Marca", get: (f) => f.marca },
      { header: "Categoría", get: (f) => f.categoria },
      { header: "Stock actual", get: (f) => f.stock },
      { header: "Unidades vendidas (30 días)", get: (f) => f.vendidas30 },
      { header: "Unidades vendidas (60 días)", get: (f) => f.vendidas60 },
      {
        header: "Días de inventario",
        get: (f) => (f.coberturaDias === null ? "" : f.coberturaDias),
      },
      { header: "Estado de rotación", get: (f) => ESTADO_LABEL[f.estado] },
      { header: "Ranking en su categoría", get: (f) => f.rankingCategoria },
    ];

    if (formato === "csv") {
      const esc = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lineas = [
        columnas.map((c) => c.header).join(";"),
        ...filtradas.map((f) => columnas.map((c) => esc(c.get(f))).join(";")),
      ];
      // BOM para que Excel abra los acentos bien.
      const bytes = new TextEncoder().encode("﻿" + lineas.join("\r\n"));
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombreBase}.csv"`,
        },
      });
    }

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rotación de SKUs");

    ws.columns = columnas.map((c, i) => ({
      key: String(i),
      width: [18, 46, 18, 24, 13, 16, 16, 16, 16, 14][i] ?? 18,
    }));
    const hdr = ws.addRow(columnas.map((c) => c.header));
    hdr.height = 22;
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.autoFilter = "A1:J1";
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const f of filtradas) {
      ws.addRow(columnas.map((c) => c.get(f)));
    }

    const buffer = await wb.xlsx.writeBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreBase}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/rotacion/export error:", error?.message);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
