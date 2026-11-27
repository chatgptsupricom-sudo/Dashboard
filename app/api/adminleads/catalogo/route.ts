import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { almacenSede } from "@/lib/compras/datosOdoo";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    const payload = auth.payload!;
    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede") || "9";
    const companyId = parseInt(sedeParam);

    if (![9, 10].includes(companyId)) {
      return NextResponse.json({ error: "Sede no válida" }, { status: 400 });
    }

    // Existencia y reservado del almacén principal de la sede (Existencias +
    // Entrada), el mismo número que el resto del panel.
    const { stock } = await almacenSede(companyId);
    const conExistencia = [...stock]
      .filter(([, s]) => s.fisico > 0)
      .map(([id]) => id);

    const productos = !conExistencia.length ? [] : await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["id", "in", conExistencia],
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
        const s = stock.get(p.id);
        p.existencia = s?.fisico ?? 0;
        p.reservado = s?.reservado ?? 0;
        // Compatibilidad: qty_available = existencia del almacén principal.
        p.qty_available = p.existencia;
        p.default_code =
          typeof p.default_code === "string" ? p.default_code : "";
        p.barcode = typeof p.barcode === "string" ? p.barcode : "";
        return p;
      })
      .filter(
        (p: any) => p.existencia > 0 && (p.company_sale_price ?? 0) > 1,
      );

    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en API de catálogo adminLeads:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
