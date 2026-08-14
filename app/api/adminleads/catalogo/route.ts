import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9, // Valencia
  10: 10, // Caracas
};

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Token inválido" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede") || "9";
    const companyId = parseInt(sedeParam);

    if (![9, 10].includes(companyId)) {
      return NextResponse.json({ error: "Sede no válida" }, { status: 400 });
    }

    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    let locationIds: number[] = [];

    if (warehouseId) {
      const warehouseData = await callOdooRPC<any[]>(
        "stock.warehouse",
        "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 1 },
      );
      const locId = warehouseData?.[0]?.lot_stock_id?.[0];
      if (locId) locationIds = [locId];
    }

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["sale_ok", "=", true],
          ["active", "=", true],
          ["type", "=", "product"],
        ],
      ],
      {
        fields: [
          "id",
          "display_name",
          "name",
          "product_tmpl_id",
          "default_code",
          "company_sale_price",
          "categ_id",
          "barcode",
          "image_128",
          "uom_id",
          "x_studio_marca",
        ],
        limit: 5000,
        order: "name asc",
        context: { allowed_company_ids: [companyId], lang: "es_VE" },
      },
    );

    if (!productos) {
      return NextResponse.json(
        { error: "No se pudo conectar con Odoo" },
        { status: 502 },
      );
    }

    const productIds = productos.map((p: any) => p.id);

    const stockDomain: any[] = [["product_id", "in", productIds]];
    if (locationIds.length > 0) {
      stockDomain.push(["location_id", "child_of", locationIds]);
    } else {
      stockDomain.push(["location_id.usage", "=", "internal"]);
      stockDomain.push(["company_id", "=", companyId]);
    }

    const stockData = await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
    );

    const stockMap: Record<number, number> = {};
    if (stockData) {
      stockData.forEach((s: any) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        stockMap[id] =
          (stockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    // Asegurar que display_name sea string (name_get devuelve [id, name])
    if (productos.length > 0) {
      const ids = productos.map((p: any) => p.id);
      const names = await callOdooRPC<[number, string][]>(
        "product.product",
        "name_get",
        [ids],
      );
      const nameMap = new Map(names);
      productos.forEach((p: any) => {
        p.display_name = nameMap.get(p.id) || p.name;
      });
    }

    const tmplIds = [
      ...new Set(
        productos
          .map((p: any) =>
            Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null,
          )
          .filter(Boolean),
      ),
    ];

    const templates = await callOdooRPC<any[]>(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      {
        fields: ["id", "name"],
        context: { lang: "es_VE", allowed_company_ids: [companyId] },
      },
    );

    const tmplNameMap = new Map(
      templates?.map((t: any) => [t.id, t.name]) ?? [],
    );

    const resultado = productos
      .map((p: any) => {
        const tmplId = Array.isArray(p.product_tmpl_id)
          ? p.product_tmpl_id[0]
          : null;
        if (tmplId) p.translated_name = tmplNameMap.get(tmplId) || null;
        const m = p.x_studio_marca;
        p.marca = Array.isArray(m) ? m[1] : m || "";
        p.qty_available = stockMap[p.id] ?? 0;
        p.default_code =
          typeof p.default_code === "string" ? p.default_code : "";
        p.barcode = typeof p.barcode === "string" ? p.barcode : "";
        return p;
      })
      .filter(
        (p: any) => p.qty_available > 0 && (p.company_sale_price ?? 0) > 1,
      );

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en API de catálogo adminLeads:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
