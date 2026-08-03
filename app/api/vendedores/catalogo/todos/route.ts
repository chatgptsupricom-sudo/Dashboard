import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

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
    if (!payload || !payload.cids) {
      return NextResponse.json(
        { error: "Empresa no definida" },
        { status: 403 },
      );
    }
    const userCompanyId = parseInt(payload.cids as string);

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["sale_ok", "=", true],
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
          "categ_id",
          "x_studio_marca",
        ],
        limit: 5000,
        order: "name asc",
        context: {
          allowed_company_ids: [userCompanyId],
          lang: "es_VE",
        },
      },
    );

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
      if (tmplId) p.translated_name = tmplNameMap.get(tmplId) || null;
      const m = p.x_studio_marca;
      p.marca = Array.isArray(m) ? m[1] : m || "";
    });

    return NextResponse.json(productos);
  } catch (error: any) {
    console.error("Error en API de catalogo/todos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
