import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fechaInicio = searchParams.get("fechaInicio") || "";
  const fechaFin = searchParams.get("fechaFin") || "";

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

    const [user] = await callOdooRPC<any[]>("res.users", "read", [[uid]], {
      fields: ["name", "company_id"],
    });
    const userName = user.name;
    const userCompanyId = user.company_id[0];

    const domain: any[] = [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["company_id", "=", userCompanyId],
    ];
    if (fechaInicio) domain.push(["invoice_date", ">=", fechaInicio]);
    if (fechaFin) domain.push(["invoice_date", "<=", fechaFin]);

    const facturas = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      {
        fields: ["id", "amount_total_signed", "invoice_user_id"],
      },
    );

    const misFacturas = facturas.filter(
      (f) => f.invoice_user_id && f.invoice_user_id[1] === userName,
    );

    const facturaIds = misFacturas.map((f) => f.id);

    let lineData: any[] = [];
    if (facturaIds.length > 0) {
      try {
        lineData = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", facturaIds],
              ["display_type", "=", "product"],
              ["product_id", "!=", false],
            ],
          ],
          {
            fields: ["move_id", "product_id", "quantity", "price_subtotal"],
          },
        );
      } catch (_) {}
    }

    const allProductIds = [
      ...new Set(lineData.map((l) => l.product_id?.[0]).filter(Boolean)),
    ];
    let productMap: Record<number, any> = {};
    if (allProductIds.length > 0) {
      try {
        const prods = await callOdooRPC<any[]>(
          "product.product",
          "read",
          [allProductIds],
          { fields: ["id", "name", "x_studio_marca"] },
        );
        prods.forEach((p) => {
          const m = p.x_studio_marca;
          p.marca = Array.isArray(m) ? m[1] : m || "Sin marca";
          productMap[p.id] = p;
        });
      } catch (_) {}
    }

    const brandMap: Record<string, { monto: number; cantidad: number; productos: Record<string, { cantidad: number; monto: number }> }> = {};

    lineData.forEach((line) => {
      const prodId = line.product_id?.[0];
      const prod = productMap[prodId];
      if (!prod) return;

      const marca = prod.marca || "Sin marca";
      const monto = line.price_subtotal || 0;
      const cantidad = line.quantity || 0;
      const prodName = prod.name || "Desconocido";

      if (!brandMap[marca]) {
        brandMap[marca] = { monto: 0, cantidad: 0, productos: {} };
      }
      brandMap[marca].monto += monto;
      brandMap[marca].cantidad += cantidad;

      if (!brandMap[marca].productos[prodName]) {
        brandMap[marca].productos[prodName] = { cantidad: 0, monto: 0 };
      }
      brandMap[marca].productos[prodName].cantidad += cantidad;
      brandMap[marca].productos[prodName].monto += monto;
    });

    const totalGeneral = Object.values(brandMap).reduce((acc, b) => acc + b.monto, 0);

    const rulesResult = await query("SELECT * FROM spiff_rules WHERE company_id = ? AND active = 1", [userCids]);
    const rules = rulesResult.rows;

    let totalSpiff = 0;
    const marcas = Object.entries(brandMap)
      .sort((a, b) => b[1].monto - a[1].monto)
      .filter(([nombre]) => rules.some((r: any) => r.brand_name.toLowerCase() === nombre.toLowerCase()))
      .map(([nombre, data]) => {
        const rule = rules.find((r: any) => r.brand_name.toLowerCase() === nombre.toLowerCase());
        const spiffMeta = rule.target_amount;
        const spiffPorMeta = rule.spiff_amount;
        const veces = Math.floor(data.monto / rule.target_amount);
        const spiffGanado = veces * rule.spiff_amount;
        totalSpiff += spiffGanado;
        return {
          nombre,
          monto: data.monto,
          cantidad: data.cantidad,
          porcentaje: totalGeneral > 0 ? parseFloat(((data.monto / totalGeneral) * 100).toFixed(1)) : 0,
          spiffMeta,
          spiffPorMeta,
          spiffGanado,
          tieneRegla: true,
          productos: Object.entries(data.productos)
            .sort((a, b) => b[1].monto - a[1].monto)
            .slice(0, 5)
            .map(([nombre, v]) => ({
              nombre,
              cantidad: v.cantidad,
              monto: v.monto,
              porcentaje: data.monto > 0 ? parseFloat(((v.monto / data.monto) * 100).toFixed(1)) : 0,
            })),
        };
      });

    const marcasPorSpiff = [...marcas].sort((a, b) => b.spiffGanado - a.spiffGanado);

    const sellerMap: Record<string, { nombre: string; totalSpiff: number; totalFacturado: number; marcas: Record<string, number> }> = {};
    facturas.forEach((f) => {
      const sellerName = f.invoice_user_id?.[1];
      if (sellerName && !sellerMap[sellerName]) {
        sellerMap[sellerName] = { nombre: sellerName, totalSpiff: 0, totalFacturado: 0, marcas: {} };
      }
      if (sellerName) {
        sellerMap[sellerName].totalFacturado += f.amount_total_signed || 0;
      }
    });

    const allSellerNames = Object.keys(sellerMap);
    if (allSellerNames.length > 0) {
      try {
        const allSellerLines = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", facturas.map(f => f.id)],
              ["display_type", "=", "product"],
              ["product_id", "!=", false],
            ],
          ],
          {
            fields: ["move_id", "product_id", "quantity", "price_subtotal"],
          },
        );

        const sellerInvoiceMap: Record<number, string> = {};
        facturas.forEach(f => {
          if (f.invoice_user_id?.[1]) sellerInvoiceMap[f.id] = f.invoice_user_id[1];
        });

        allSellerLines.forEach((line) => {
          const sellerName = sellerInvoiceMap[line.move_id?.[0]];
          if (!sellerName || !sellerMap[sellerName]) return;
          const prodId = line.product_id?.[0];
          const prod = productMap[prodId];
          if (!prod) return;
          const marca = prod.marca || "Sin marca";
          sellerMap[sellerName].marcas[marca] = (sellerMap[sellerName].marcas[marca] || 0) + (line.price_subtotal || 0);
        });

        Object.values(sellerMap).forEach((seller) => {
          let spiffTotal = 0;
          Object.entries(seller.marcas).forEach(([marca, monto]) => {
            const rule = rules.find((r: any) => r.brand_name.toLowerCase() === marca.toLowerCase());
            if (rule) {
              spiffTotal += Math.floor(monto / rule.target_amount) * rule.spiff_amount;
            }
          });
          seller.totalSpiff = spiffTotal;
        });
      } catch (_) {}
    }

    const rankingVendedores = Object.values(sellerMap)
      .sort((a, b) => b.totalSpiff - a.totalSpiff)
      .map((s, i) => ({
        posicion: i + 1,
        nombre: s.nombre,
        totalSpiff: s.totalSpiff,
        totalFacturado: s.totalFacturado,
      }));

    const miPosicion = rankingVendedores.find(r => r.nombre === userName);

    return NextResponse.json({
      marcas,
      totalGeneral,
      totalSpiff,
      totalFacturas: misFacturas.length,
      totalProductos: lineData.length,
      reglasActivas: rules.length,
      marcasPorSpiff,
      rankingVendedores,
      miPosicion: miPosicion || { posicion: 0, nombre: userName, totalSpiff: 0, totalFacturado: 0 },
    });
  } catch (e: any) {
    console.error("Error API spiff:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
