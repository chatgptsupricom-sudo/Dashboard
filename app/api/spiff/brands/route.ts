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
    const uid = parseInt(payload.uid as string);
    const userCids = payload.cids as number;

    const products = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["sale_ok", "=", true],
          ["type", "=", "product"],
        ],
      ],
      {
        fields: ["x_studio_marca"],
        limit: 5000,
        context: {
          allowed_company_ids: [userCids],
          lang: "es_VE",
        },
      },
    );

    const brandSet = new Set<string>();
    (products || []).forEach((p: any) => {
      const m = p.x_studio_marca;
      const name = Array.isArray(m) ? m[1] : m;
      if (name && typeof name === "string" && name.trim()) {
        brandSet.add(name.trim());
      }
    });

    const brands = Array.from(brandSet).sort();
    return NextResponse.json(brands);
  } catch (error) {
    console.error("GET /api/spiff/brands error:", error);
    return NextResponse.json([]);
  }
}
