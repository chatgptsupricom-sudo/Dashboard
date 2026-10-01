// ============================================================
// PLAN DE CONTENIDO — Helper para export Excel
// ============================================================

import ExcelJS from "exceljs";
import type { CPM, CalendarPiece, CPMPlan } from "./types";

/**
 * Genera Excel con inventario de CPMs
 */
export async function exportInventoryExcel(
  plan: CPMPlan,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Inventario
  const invSheet = workbook.addWorksheet("Inventario");
  invSheet.columns = [
    { header: "CPM", key: "cpm", width: 20 },
    { header: "Tipo", key: "type", width: 14 },
    { header: "Stock Total", key: "stockTotal", width: 14 },
    { header: "SKU", key: "sku", width: 20 },
    { header: "Producto", key: "product", width: 45 },
    { header: "Stock", key: "stock", width: 10 },
    { header: "Precio", key: "price", width: 12 },
  ];

  // Style header
  invSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  invSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1565C0" },
  };

  // Add data
  if (plan.cpms) {
    for (const cpm of plan.cpms) {
      if (cpm.type === "empresa") {
        invSheet.addRow({
          cpm: cpm.name,
          type: "empresa",
          stockTotal: 0,
          sku: "-",
          product: "Contenido corporativo de marca",
          stock: 0,
          price: 0,
        });
      } else if (cpm.products) {
        for (const prod of cpm.products) {
          invSheet.addRow({
            cpm: cpm.name,
            type: cpm.type,
            stockTotal: cpm.stockTotal,
            sku: prod.sku,
            product: prod.productName,
            stock: prod.stock,
            price: prod.price,
          });
        }
      }
    }
  }

  // Sheet 2: Resumen
  const resSheet = workbook.addWorksheet("Resumen");
  resSheet.columns = [
    { header: "CPM", key: "cpm", width: 20 },
    { header: "Tipo", key: "type", width: 14 },
    { header: "Stock Total", key: "stockTotal", width: 14 },
    { header: "Productos", key: "products", width: 12 },
    { header: "Supri", key: "supri", width: 8 },
    { header: "Persona", key: "persona", width: 10 },
    { header: "Carrusel", key: "carrusel", width: 10 },
    { header: "Post", key: "post", width: 8 },
    { header: "Total Piezas", key: "total", width: 14 },
  ];

  resSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  resSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1565C0" },
  };

  if (plan.cpms) {
    for (const cpm of plan.cpms) {
      const total = cpm.supriCount + cpm.personaCount + cpm.carruselCount + cpm.postCount;
      resSheet.addRow({
        cpm: cpm.name,
        type: cpm.type,
        stockTotal: cpm.stockTotal,
        products: cpm.products?.length || 0,
        supri: cpm.supriCount,
        persona: cpm.personaCount,
        carrusel: cpm.carruselCount,
        post: cpm.postCount,
        total: total,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}

/**
 * Genera Excel con calendario distribuido
 */
export async function exportCalendarExcel(
  plan: CPMPlan,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Calendario");

  sheet.columns = [
    { header: "Pieza", key: "piece", width: 8 },
    { header: "Día", key: "day", width: 10 },
    { header: "Fecha", key: "date", width: 14 },
    { header: "CPM", key: "cpm", width: 20 },
    { header: "Formato", key: "format", width: 16 },
    { header: "Tipo CPM", key: "type", width: 14 },
    { header: "Tema", key: "topic", width: 55 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1565C0" },
  };

  const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const FORMAT_LABELS: Record<string, string> = {
    supri: "Video Supri",
    persona: "Video Persona",
    carrusel: "Carrusel",
    post: "Post",
  };

  if (plan.calendar) {
    for (const cal of plan.calendar) {
      const date = new Date(cal.dateKey);
      const dayName = DAY_NAMES[date.getDay()];
      const cpm = plan.cpms?.find((c) => c.name === cal.cpmName);

      sheet.addRow({
        piece: cal.pieceNumber,
        day: dayName,
        date: cal.dateKey,
        cpm: cal.cpmName,
        format: cal.isSaved ? "Guardado" : (FORMAT_LABELS[cal.format] || cal.format),
        type: cpm?.type || "-",
        topic: cal.topic || "",
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}
