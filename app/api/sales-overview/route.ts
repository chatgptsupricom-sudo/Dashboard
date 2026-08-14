import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BLACKLIST = [
  "SALDO", "INICIAL", "FLETE", "SERVICIO", "AJUSTE", "IVA",
  "COBRO", "POLO", "GORRAS", "INSTALACION", "ENVOPLAST", "VARIOS", "PROMO",
];

export async function GET() {
  try {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    const filters = [
      ["move_id.move_type", "=", "out_invoice"],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
      ["company_id", "in", [9, 10, 7]],
      ["date", ">=", firstDayOfMonth],
    ];

    const linesData =
      (await callOdooRPC<any[]>("account.move.line", "read_group", [
        filters,
        ["price_subtotal", "quantity", "product_id"],
        ["product_id"],
        0, 0, "price_subtotal desc",
      ])) || [];

    const brandMap: Record<string, { revenue: number; cantidad: number }> = {};

    const products = linesData
      .filter((p) => !BLACKLIST.some((w) => p.product_id[1].toUpperCase().includes(w)))
      .map((p) => {
        const rawName = p.product_id[1]
          .replace(/\[.*?\]/g, "")
          .replace(/^\d+-\S+\s+/, "")
          .trim();
        const brandName = rawName.split(" ")[0].toUpperCase();
        const revenue = p.price_subtotal || 0;
        const cantidad = p.quantity || 0;

        if (brandName.length > 2 && !/^\d+$/.test(brandName) && !BLACKLIST.includes(brandName)) {
          if (!brandMap[brandName]) brandMap[brandName] = { revenue: 0, cantidad: 0 };
          brandMap[brandName].revenue += revenue;
          brandMap[brandName].cantidad += cantidad;
        }

        return { name: rawName, brand: brandName, revenue, cantidad };
      });

    const brands = Object.entries(brandMap)
      .map(([name, d]) => ({ name, revenue: d.revenue, cantidad: d.cantidad }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return NextResponse.json({
      brands,
      products: products.slice(0, 8),
      month: firstDayOfMonth.substring(0, 7),
    });
  } catch (error: any) {
    console.error("sales-overview error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
