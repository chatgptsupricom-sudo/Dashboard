import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

interface SpiffRuleRow {
  id: number;
  company_id: number;
  brand_name: string;
  tipo: string;
  product_name: string | null;
  product_id: number | null;
  target_amount: number;
  spiff_amount: number;
  modo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  active: number;
}

function isInvoiceInRuleDateRange(invoiceDate: string | null, rule: SpiffRuleRow): boolean {
  if (!invoiceDate) return true;
  const d = invoiceDate.split("T")[0];
  if (rule.fecha_inicio && d < rule.fecha_inicio) return false;
  if (rule.fecha_fin && d > rule.fecha_fin) return false;
  return true;
}

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

    const [user] = await callOdooRPC<any[]>("res.users", "read", [[uid]], {
      fields: ["name", "company_id"],
    });
    const userName = user.name;
    const userCompanyId = user.company_id[0];

    let rulesCompanyId = userCids;
    if (!rulesCompanyId || rulesCompanyId === 0) {
      rulesCompanyId = userCompanyId;
    }

    const rulesResult = await query(
      "SELECT * FROM spiff_rules WHERE company_id = ? AND active = 1",
      [rulesCompanyId]
    );
    const allRules: SpiffRuleRow[] = rulesResult.rows;
    const rules = allRules;

    const marcaRules = rules.filter((r) => r.tipo === "marca");
    const productoRules = rules.filter((r) => r.tipo === "producto");

    let fechaInicioGlobal: string | null = null;
    let fechaFinGlobal: string | null = null;
    rules.forEach((r) => {
      if (r.fecha_inicio) {
        if (!fechaInicioGlobal || r.fecha_inicio < fechaInicioGlobal) {
          fechaInicioGlobal = r.fecha_inicio;
        }
      }
      if (r.fecha_fin) {
        if (!fechaFinGlobal || r.fecha_fin > fechaFinGlobal) {
          fechaFinGlobal = r.fecha_fin;
        }
      }
    });

    const domain: any[] = [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["company_id", "=", userCompanyId],
    ];
    if (fechaInicioGlobal) {
      domain.push(["invoice_date", ">=", fechaInicioGlobal]);
    }
    if (fechaFinGlobal) {
      domain.push(["invoice_date", "<=", fechaFinGlobal]);
    }

    const facturas = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      {
        fields: ["id", "name", "amount_total_signed", "invoice_user_id", "invoice_date"],
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

    const moveDateMap: Record<number, string> = {};
    misFacturas.forEach((f) => {
      moveDateMap[f.id] = (f.invoice_date || "").split("T")[0];
    });

    const allFacturaIds = facturas.map(f => f.id);
    let allSellerLines: any[] = [];
    if (allFacturaIds.length > 0) {
      try {
        allSellerLines = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", allFacturaIds],
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

    const allSellerProductIds = [
      ...new Set([...lineData, ...allSellerLines].map((l) => l.product_id?.[0]).filter(Boolean)),
    ];
    let productMap: Record<number, any> = {};
    if (allSellerProductIds.length > 0) {
      try {
        const prods = await callOdooRPC<any[]>(
          "product.product",
          "read",
          [allSellerProductIds],
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

      if (!brandMap[marca]) brandMap[marca] = { monto: 0, cantidad: 0, productos: {} };
      brandMap[marca].monto += monto;
      brandMap[marca].cantidad += cantidad;
      if (!brandMap[marca].productos[prodName]) brandMap[marca].productos[prodName] = { cantidad: 0, monto: 0 };
      brandMap[marca].productos[prodName].cantidad += cantidad;
      brandMap[marca].productos[prodName].monto += monto;
    });

    const totalGeneral = Object.values(brandMap).reduce((acc, b) => acc + b.monto, 0);

    let totalSpiff = 0;

    const marcas = Object.entries(brandMap)
      .sort((a, b) => b[1].monto - a[1].monto)
      .filter(([nombre]) => marcaRules.some((r) => r.brand_name.toLowerCase() === nombre.toLowerCase()))
      .map(([nombre, data]) => {
        const rule = marcaRules.find((r) => r.brand_name.toLowerCase() === nombre.toLowerCase());
        if (!rule) return null;

        let spiffGanado = 0;
        if (rule.modo === "cantidad") {
          spiffGanado = Math.floor(data.cantidad / rule.target_amount) * rule.spiff_amount;
        } else {
          spiffGanado = Math.floor(data.monto / rule.target_amount) * rule.spiff_amount;
        }
        totalSpiff += spiffGanado;

        return {
          nombre,
          monto: data.monto,
          cantidad: data.cantidad,
          porcentaje: totalGeneral > 0 ? parseFloat(((data.monto / totalGeneral) * 100).toFixed(1)) : 0,
          spiffMeta: rule.target_amount,
          spiffPorMeta: rule.spiff_amount,
          spiffGanado,
          tieneRegla: true,
          modo: rule.modo,
          fechaInicio: rule.fecha_inicio,
          fechaFin: rule.fecha_fin,
          productos: Object.entries(data.productos)
            .sort((a, b) => b[1].monto - a[1].monto)
            .slice(0, 5)
            .map(([prodName, v]) => ({
              nombre: prodName,
              cantidad: v.cantidad,
              monto: v.monto,
              porcentaje: data.monto > 0 ? parseFloat(((v.monto / data.monto) * 100).toFixed(1)) : 0,
            })),
        };
      })
      .filter(Boolean);

    const allProducts: { nombre: string; marca: string; monto: number; cantidad: number; spiffGanado: number; spiffMeta: number; spiffPorMeta: number; modo: string }[] = [];
    let totalSpiffProductos = 0;

    Object.entries(brandMap).forEach(([marca, data]) => {
      const rule = productoRules.find((r) => r.brand_name.toLowerCase() === marca.toLowerCase());
      if (!rule) return;

      Object.entries(data.productos).forEach(([prodName, v]) => {
        let spiffGanado = 0;
        if (rule.modo === "cantidad") {
          spiffGanado = Math.floor(v.cantidad / rule.target_amount) * rule.spiff_amount;
        } else {
          spiffGanado = Math.floor(v.monto / rule.target_amount) * rule.spiff_amount;
        }

        totalSpiffProductos += spiffGanado;
        allProducts.push({
          nombre: prodName,
          marca,
          monto: v.monto,
          cantidad: v.cantidad,
          spiffGanado,
          spiffMeta: rule.target_amount,
          spiffPorMeta: rule.spiff_amount,
          modo: rule.modo,
        });
      });
    });
    allProducts.sort((a, b) => b.spiffGanado - a.spiffGanado || b.monto - a.monto);

    const marcasPorSpiff = [...marcas].sort((a: any, b: any) => b.spiffGanado - a.spiffGanado);

    const sellerMap: Record<string, { nombre: string; totalSpiff: number; totalFacturado: number; marcas: Record<string, number>; cantidades: Record<string, number> }> = {};
    facturas.forEach((f) => {
      const sellerName = f.invoice_user_id?.[1];
      if (sellerName && !sellerMap[sellerName]) {
        sellerMap[sellerName] = { nombre: sellerName, totalSpiff: 0, totalFacturado: 0, marcas: {}, cantidades: {} };
      }
      if (sellerName) {
        sellerMap[sellerName].totalFacturado += f.amount_total_signed || 0;
      }
    });

    const allSellerNames = Object.keys(sellerMap);
    if (allSellerNames.length > 0 && allSellerLines.length > 0) {
      try {
        const sellerInvoiceMap: Record<number, { name: string; date: string }> = {};
        facturas.forEach(f => {
          if (f.invoice_user_id?.[1]) {
            sellerInvoiceMap[f.id] = { name: f.invoice_user_id[1], date: (f.invoice_date || "").split("T")[0] };
          }
        });

        allSellerLines.forEach((line) => {
          const invoiceInfo = sellerInvoiceMap[line.move_id?.[0]];
          if (!invoiceInfo || !sellerMap[invoiceInfo.name]) return;
          const prodId = line.product_id?.[0];
          const prod = productMap[prodId];
          if (!prod) return;
          const marca = prod.marca || "Sin marca";
          sellerMap[invoiceInfo.name].marcas[marca] = (sellerMap[invoiceInfo.name].marcas[marca] || 0) + (line.price_subtotal || 0);
          sellerMap[invoiceInfo.name].cantidades[marca] = (sellerMap[invoiceInfo.name].cantidades[marca] || 0) + (line.quantity || 0);
        });

        Object.values(sellerMap).forEach((seller) => {
          let spiffTotal = 0;
          Object.entries(seller.marcas).forEach(([marca, monto]) => {
            const rule = marcaRules.find((r) => r.brand_name.toLowerCase() === marca.toLowerCase());
            if (rule) {
              if (rule.modo === "cantidad") {
                const cant = seller.cantidades[marca] || 0;
                spiffTotal += Math.floor(cant / rule.target_amount) * rule.spiff_amount;
              } else {
                spiffTotal += Math.floor(monto / rule.target_amount) * rule.spiff_amount;
              }
            }
          });
          seller.totalSpiff = spiffTotal;
        });
      } catch (_) {}
    }

    const rankingVendedores = Object.values(sellerMap)
      .filter((s) => s.totalFacturado > 0)
      .sort((a, b) => b.totalSpiff - a.totalSpiff)
      .map((s, i) => ({
        posicion: i + 1,
        nombre: s.nombre,
        totalSpiff: s.totalSpiff,
        totalFacturado: s.totalFacturado,
      }));

    const miPosicion = rankingVendedores.find(r => r.nombre === userName);

    const sellerBrandData: Record<string, { marcas: Record<string, { monto: number; cantidad: number; spiff: number }> }> = {};
    Object.values(sellerMap).forEach((seller) => {
      sellerBrandData[seller.nombre] = { marcas: {} };
      Object.entries(seller.marcas).forEach(([marca, monto]) => {
        const cant = seller.cantidades[marca] || 0;
        let spiff = 0;
        const rule = marcaRules.find((r) => r.brand_name.toLowerCase() === marca.toLowerCase());
        if (rule) {
          if (rule.modo === "cantidad") {
            spiff = Math.floor(cant / rule.target_amount) * rule.spiff_amount;
          } else {
            spiff = Math.floor(monto / rule.target_amount) * rule.spiff_amount;
          }
        }
        sellerBrandData[seller.nombre].marcas[marca] = { monto, cantidad: cant, spiff };
      });
    });

    return NextResponse.json({
      marcas,
      totalGeneral,
      totalSpiff,
      totalFacturas: misFacturas.length,
      totalProductos: lineData.length,
      reglasActivas: rules.length,
      marcasPorSpiff,
      allProducts,
      totalSpiffProductos,
      rankingVendedores,
      miPosicion: miPosicion || { posicion: 0, nombre: userName, totalSpiff: 0, totalFacturado: 0 },
      fechaInicioGlobal,
      fechaFinGlobal,
      sellerBrandData,
    });
  } catch (e: any) {
    console.error("Error API spiff:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
