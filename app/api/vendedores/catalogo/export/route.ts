import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const CATEGORIAS_OCULTAS_LOWER = ["juguetes"];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
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
    if (!payload || !payload.cids)
      return NextResponse.json(
        { error: "Empresa no definida" },
        { status: 403 },
      );

    const userCompanyId = parseInt(payload.cids as string);

    const warehouses = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [
        [
          ["company_id", "=", userCompanyId],
          ["name", "in", ["Central", "Principal"]],
        ],
      ],
      { fields: ["id", "lot_stock_id"], limit: 1 },
    );
    const locationId = warehouses?.[0]?.lot_stock_id?.[0] ?? null;

    const domain: any[] = [
      ["sale_ok", "=", true],
      ["qty_available", ">", 0],
      ["type", "=", "product"],
    ];
    if (categoria !== "todas") domain.push(["categ_id.name", "=", categoria]);

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: [
          "id",
          "display_name",
          "name",
          "product_tmpl_id",
          "default_code",
          "company_sale_price",
          "qty_available",
          "categ_id",
          "image_128",
          "uom_id",
          "x_studio_marca",
        ],
        limit: 5000,
        order: "name asc",
        context: {
          allowed_company_ids: [userCompanyId],
          lang: "es_VE",
          ...(locationId ? { location: locationId } : {}),
        },
      },
    );

    // Translated names
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
        context: { lang: "es_VE", allowed_company_ids: [userCompanyId] },
      },
    );
    const tmplNameMap = new Map(templates.map((t: any) => [t.id, t.name]));

    productos.forEach((p: any) => {
      const tmplId = Array.isArray(p.product_tmpl_id)
        ? p.product_tmpl_id[0]
        : null;
      p.translated_name = tmplId ? tmplNameMap.get(tmplId) || null : null;
      const m = p.x_studio_marca;
      p.marca = Array.isArray(m) ? m[1] : m || "";
    });

    const getNombre = (p: any) =>
      p.translated_name ||
      p.display_name?.replace(/\[.*?\]/g, "").trim() ||
      p.name ||
      "";

    // Group by category
    const getCategoria = (p: any) =>
      Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría";

    const esCategoriaOculta = (cat: string) =>
      CATEGORIAS_OCULTAS_LOWER.includes(cat.toLowerCase());

    const grupos: Record<string, any[]> = {};
    productos.forEach((p: any) => {
      const cat = getCategoria(p);
      if (esCategoriaOculta(cat)) return;
      if (!grupos[cat]) grupos[cat] = [];
      grupos[cat].push(p);
    });

    const productosVisibles = productos.filter(
      (p: any) => !esCategoriaOculta(getCategoria(p)),
    );

    // Cuando se combina más de una categoría en una sola hoja, se agrega
    // una columna "Categoría" para no perder esa información.
    const incluirColumnaCategoria = unaHoja && categoria === "todas";

    // Orden prioritario de categorías (comparación case-insensitive)
    const ORDEN_CATEGORIAS_LOWER: string[] = ["impresora", "laptop"];
    const ordenCategoria = (cat: string) => {
      const idx = ORDEN_CATEGORIAS_LOWER.indexOf(cat.toLowerCase());
      return idx !== -1 ? idx : ORDEN_CATEGORIAS_LOWER.length;
    };

    // Cuando se exporta en una sola hoja, ordenar por categoría (prioridad + alfa) y luego por nombre
    const productosVisiblesOrdenados = unaHoja
      ? [...productosVisibles].sort((a, b) => {
          const catA = getCategoria(a);
          const catB = getCategoria(b);
          const priA = ordenCategoria(catA);
          const priB = ordenCategoria(catB);
          if (priA !== priB) return priA - priB;
          const catCmp = catA.localeCompare(catB);
          if (catCmp !== 0) return catCmp;
          return getNombre(a).localeCompare(getNombre(b));
        })
      : productosVisibles;

    const hojas: [string, any[]][] = unaHoja
      ? [[categoria !== "todas" ? categoria : "Catálogo", productosVisiblesOrdenados]]
      : categoria !== "todas"
        ? [[categoria, productosVisibles]]
        : Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b));

    // Build Excel
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    const sheetNamesUsadas = new Set<string>();

    for (const [cat, prods] of hojas) {
      let sheetName = cat.replace(/[*?:\\/\[\]]/g, "-").slice(0, 31);
      if (sheetNamesUsadas.has(sheetName)) {
        sheetName = `${sheetName.slice(0, 28)}(${sheetNamesUsadas.size})`;
      }
      sheetNamesUsadas.add(sheetName);
      const ws = wb.addWorksheet(sheetName);

      const colDefs: { header: string; width: number; key: string }[] = [];
      if (cols.referencia)
        colDefs.push({ header: "Referencia", key: "referencia", width: 16 });
      if (cols.nombre)
        colDefs.push({ header: "Nombre en pantalla", key: "nombre", width: 50 });
      if (incluirColumnaCategoria)
        colDefs.push({ header: "Categoría", key: "categoria", width: 24 });
      if (cols.marca)
        colDefs.push({ header: "Marca", key: "marca", width: 20 });
      if (cols.stock)
        colDefs.push({ header: "Cantidad Disponible", key: "stock", width: 20 });
      if (cols.precio)
        colDefs.push({ header: "Precio", key: "precio", width: 14 });
      if (cols.imagen)
        colDefs.push({ header: "Imagen", key: "imagen", width: 19 });

      ws.columns = colDefs.map(({ width, key }) => ({ key, width }));

      const hdr = ws.addRow(colDefs.map((c) => c.header));
      hdr.height = 22;
      hdr.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });

      // AutoFilter en encabezado para facilitar el filtrado
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
          const imageId = wb.addImage({
            buffer: Buffer.from(p.image_128, "base64") as any,
            extension: "png",
          });
          // oneCellAnchor (tl + ext): la imagen se ancla solo a la celda superior-
          // izquierda con tamaño fijo. Esto evita filas vacías entre productos y
          // hace que la imagen se oculte/muestre correctamente al filtrar.
          ws.addImage(imageId, {
            tl: { col: imgColIndex, row: row.number - 1 },
            ext: { width: 120, height: 105 },
          } as any);
        }
      }
    }

    const rawBuffer = await wb.xlsx.writeBuffer();
    // Convertir a Uint8Array para que NextResponse lo serialice correctamente
    const bytes = rawBuffer instanceof Uint8Array
      ? rawBuffer
      : new Uint8Array(rawBuffer as ArrayBuffer);

    const fecha = new Date().toISOString().slice(0, 10);
    const catSlug = categoria
      .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, "_")
      .replace(/_+/g, "_");
    const filename =
      categoria !== "todas"
        ? `catalogo_${catSlug}_${fecha}.xlsx`
        : `catalogo_${fecha}.xlsx`;

    return new NextResponse(bytes, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error exportando catálogo:", error);
    return NextResponse.json(
      {
        error: error?.message || String(error),
        stack: error?.stack?.split("\n")[0],
      },
      { status: 500 },
    );
  }
}
