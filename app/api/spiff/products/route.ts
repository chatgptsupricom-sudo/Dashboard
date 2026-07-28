import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];
  if (!token)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    const userCids = payload.cids as number;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q") || "";
    const brand = searchParams.get("brand") || "";

    const domain: any[] = [
      ["sale_ok", "=", true],
      ["type", "=", "product"],
    ];
    if (brand) domain.push(["x_studio_marca", "=", brand]);
    if (search) domain.push(["name", "ilike", search]);

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [domain],
      {
        fields: ["id", "name", "x_studio_marca"],
        limit: 100,
        context: {
          allowed_company_ids: [userCids],
          lang: "es_VE",
        },
      },
    );

    const result = (products || []).map((p: any) => {
      const m = p.x_studio_marca;
      return {
        id: p.id,
        name: p.name,
        marca: Array.isArray(m) ? m[1] : m || "Sin marca",
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/spiff/products error:", error);
    return NextResponse.json([]);
  }
}
