import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sede = searchParams.get("sede") || "9";
    const categoria = searchParams.get("categoria") || "todas";
    const unaHoja = searchParams.get("unaHoja") === "1";
    const cols = {
      referencia: searchParams.get("referencia") !== "0",
      nombre: searchParams.get("nombre") !== "0",
      marca: searchParams.get("marca") !== "0",
      stock: searchParams.get("stock") !== "0",
      precio: searchParams.get("precio") !== "0",
      imagen: searchParams.get("imagen") !== "0",
    };

    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split("; ")
      .find((row) => row.startsWith("token="))
      ?.split("=")[1];

    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Token inválido" }, { status: 403 });
    }

    const companyId = parseInt(sede);
    if (![9, 10].includes(companyId)) {
      return NextResponse.json({ error: "Sede no válida" }, { status: 400 });
    }

    const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = { 9: 9, 10: 10 };
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

    const domain: any[] = [
      ["sale_ok", "=", true],
      ["active", "=", true],
      ["type", "=", "product"],
    ];
    if (categoria !== "todas") domain.push(["categ_id.name", "=", categoria]);

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: [
          "id", "display_name", "name", "product_tmpl_id", "default_code",
          "company_sale_price", "categ_id", "barcode", "image_128",
          "uom_id", "x_studio_marca",
        ],
        limit: 5000,
        order: "name asc",
        context: { allowed_company_ids: [companyId], lang: "es_VE" },
      },
    );

    if (!productos) {
      return NextResponse.json({ error: "No se pudo conectar con Odoo" }, { status: 502 });
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
        stockMap[id] = (stockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    if (productos.length > 0) {
      const ids = productos.map((p: any) => p.id);
      const names = await callOdooRPC<[number, string][]>("product.product", "name_get", [ids]);
      const nameMap = new Map(names);
      productos.forEach((p: any) => { p.display_name = nameMap.get(p.id) || p.name; });
    }

    const tmplIds = [...new Set(productos.map((p: any) => Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null).filter(Boolean))];
    const templates = await callOdooRPC<any[]>(
      "product.template", "search_read", [[["id", "in", tmplIds]]],
      { fields: ["id", "name"], context: { lang: "es_VE", allowed_company_ids: [companyId] } },
    );
    const tmplNameMap = new Map(templates?.map((t: any) => [t.id, t.name]) ?? []);

    const resolved = productos.map((p: any) => {
      const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null;
      if (tmplId) p.translated_name = tmplNameMap.get(tmplId) || null;
      const m = p.x_studio_marca;
      p.marca = Array.isArray(m) ? m[1] : m || "";
      p.qty_available = stockMap[p.id] ?? 0;
      p.default_code = typeof p.default_code === "string" ? p.default_code : "";
      return p;
    }).filter((p: any) => p.qty_available > 0 && (p.company_sale_price ?? 0) > 1);

    const getNombre = (p: any) => p.translated_name || p.display_name?.replace(/\[.*?\]/g, "").trim() || p.name || "";
    const getCategoria = (p: any) => Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría";

    const grupos: Record<string, any[]> = {};
    resolved.forEach((p: any) => {
      const cat = getCategoria(p);
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    });

    const incluirColumnaCategoria = unaHoja && categoria === "todas";
    const hojas: [string, any[]][] = unaHoja
      ? [[categoria !== "todas" ? categoria : "Catálogo", resolved]]
      : categoria !== "todas"
        ? [[categoria, resolved]]
        : Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheetNamesUsadas = new Set<string>();

    for (const [cat, prods] of hojas) {
      let sheetName = cat.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31);
      if (sheetNamesUsadas.has(sheetName)) sheetName = `${sheetName.slice(0, 28)}(${sheetNamesUsadas.size})`;
      sheetNamesUsadas.add(sheetName);
      const ws = wb.addWorksheet(sheetName);

      const colDefs: { header: string; width: number; key: string }[] = [];
      if (cols.referencia) colDefs.push({ header: "Referencia", key: "referencia", width: 16 });
      if (cols.nombre) colDefs.push({ header: "Nombre en pantalla", key: "nombre", width: 50 });
      if (incluirColumnaCategoria) colDefs.push({ header: "Categoría", key: "categoria", width: 24 });
      if (cols.marca) colDefs.push({ header: "Marca", key: "marca", width: 20 });
      if (cols.stock) colDefs.push({ header: "Cantidad Disponible", key: "stock", width: 20 });
      if (cols.precio) colDefs.push({ header: "Precio", key: "precio", width: 14 });
      if (cols.imagen) colDefs.push({ header: "Imagen", key: "imagen", width: 19 });

      ws.columns = colDefs.map(({ width, key }) => ({ key, width }));
      const hdr = ws.addRow(colDefs.map((c) => c.header));
      hdr.height = 22;
      hdr.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      ws.autoFilter = `A1:${String.fromCharCode(64 + colDefs.length)}1`;

      const imgColIndex = colDefs.findIndex((c) => c.key === "imagen");
      const hasImg = cols.imagen && imgColIndex !== -1;

      for (let i = 0; i < prods.length; i++) {
        const p = prods[i];
        const rowData: any = {};
        if (cols.referencia) rowData.referencia = p.default_code || "";
        if (cols.nombre) rowData.nombre = getNombre(p);
        if (incluirColumnaCategoria) rowData.categoria = getCategoria(p);
        if (cols.marca) rowData.marca = p.marca || "";
        if (cols.stock) rowData.stock = p.qty_available ?? 0;
        if (cols.precio) rowData.precio = p.company_sale_price ?? 0;
        if (cols.imagen) rowData.imagen = "";

        const row = ws.addRow(rowData);
        row.height = hasImg ? 100 : 20;
        row.alignment = { vertical: "middle" };
        if (cols.precio) row.getCell("precio").numFmt = "#,##0.00";

        if (hasImg && p.image_128) {
          const imageId = wb.addImage({ buffer: Buffer.from(p.image_128, "base64") as any, extension: "png" });
          ws.addImage(imageId, { tl: { col: imgColIndex, row: row.number - 1 }, ext: { width: 120, height: 105 } } as any);
        }
      }
    }

    const rawBuffer = await wb.xlsx.writeBuffer();
    const bytes = rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer as ArrayBuffer);
    const fecha = new Date().toISOString().slice(0, 10);
    const sedeLabel = companyId === 9 ? "valencia" : "caracas";
    const catSlug = categoria.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_").replace(/_+/g, "_");
    const filename = categoria !== "todas"
      ? `catalogo_${sedeLabel}_${catSlug}_${fecha}.xlsx`
      : `catalogo_${sedeLabel}_${fecha}.xlsx`;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error exportando catálogo adminleads:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
