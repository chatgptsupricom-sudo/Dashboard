import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fechaInicio = searchParams.get("fechaInicio") || "";
  const fechaFin = searchParams.get("fechaFin") || "";
  const zonaFilter = searchParams.get("zona") || "";
  const productoFilter = searchParams.get("producto") || "";
  const pagoFilter = searchParams.get("pago") || "";

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
        fields: [
          "id",
          "name",
          "amount_total_signed",
          "partner_id",
          "invoice_date",
          "invoice_date_due",
          "invoice_user_id",
          "invoice_payment_term_id",
          "payment_state",
        ],
      },
    );

    const misFacturas = facturas.filter(
      (f) => f.invoice_user_id && f.invoice_user_id[1] === userName,
    );

    // --- Partners (traer credit + datos geográficos) ---
    const partnerIds = [
      ...new Set(misFacturas.map((f) => f.partner_id?.[0]).filter(Boolean)),
    ];
    let partnerDataMap: Record<number, any> = {};
    if (partnerIds.length > 0) {
      try {
        const partners = await callOdooRPC<any[]>(
          "res.partner",
          "read",
          [partnerIds],
          { fields: ["id", "name", "state_id", "city", "credit_limit", "credit", "property_payment_term_id"] },
        );
        partners.forEach((p) => {
          partnerDataMap[p.id] = p;
        });
      } catch (_) {}
    }

    // --- CALCULAR DEUDA ---
    const deudaPorCliente: Record<string, { adeudoTotal: number; totalAtrasado: number; fechaLimiteMasAntiguo: string }> = {};
    const hoy = new Date();
    const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

    // Adeudo total desde partner.credit
    misFacturas.forEach((f) => {
      const clienteNombre = f.partner_id?.[1] || "Sin Cliente";
      const partnerId = f.partner_id?.[0];
      const partner = partnerDataMap[partnerId];
      if (!deudaPorCliente[clienteNombre]) {
        deudaPorCliente[clienteNombre] = {
          adeudoTotal: partner?.credit || 0,
          totalAtrasado: 0,
          fechaLimiteMasAntiguo: "",
        };
      }
    });

    // Total atrasado: facturas impagas cuyo vencimiento ya pasó (sin filtro de fecha)
    const domainAtrasadas: any[] = [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["company_id", "=", userCompanyId],
      ["payment_state", "!=", "paid"],
      ["invoice_date_due", "<", hoyStr],
      ["invoice_user_id", "=", uid],
    ];
    try {
      const facturasAtrasadas = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [domainAtrasadas],
        {
          fields: ["id", "amount_residual", "partner_id", "invoice_date_due"],
        },
      );
      facturasAtrasadas.forEach((f) => {
        const clienteNombre = f.partner_id?.[1] || "Sin Cliente";
        if (deudaPorCliente[clienteNombre]) {
          deudaPorCliente[clienteNombre].totalAtrasado += Math.abs(f.amount_residual || 0);
          if (f.invoice_date_due && (!deudaPorCliente[clienteNombre].fechaLimiteMasAntiguo || f.invoice_date_due < deudaPorCliente[clienteNombre].fechaLimiteMasAntiguo)) {
            deudaPorCliente[clienteNombre].fechaLimiteMasAntiguo = f.invoice_date_due;
          }
        }
      });
    } catch (_) {}

    // --- FIN CALCULAR DEUDA ---

    // Líneas de factura
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

    // Productos (primero, para poder filtrar líneas)
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
          { fields: ["id", "name"] },
        );
        prods.forEach((p) => {
          productMap[p.id] = p;
        });
      } catch (_) {}
    }

    // Filtrar líneas que sean productos reales (excluir "Saldo Inicial" y similares)
    const nonProductPatterns = ["saldo inicial", "saldo a favor", "anticipo", "abono"];
    lineData = lineData.filter((line) => {
      const prodName = productMap[line.product_id?.[0]]?.name || "";
      const lower = prodName.toLowerCase().trim();
      if (!prodName) return false;
      if (nonProductPatterns.some((p) => lower.includes(p))) return false;
      return true;
    });

    const lineasPorFactura: Record<number, any[]> = {};
    lineData.forEach((line) => {
      const moveId = Array.isArray(line.move_id)
        ? line.move_id[0]
        : line.move_id;
      if (!lineasPorFactura[moveId]) lineasPorFactura[moveId] = [];
      lineasPorFactura[moveId].push(line);
    });

    // Payment terms (de facturas + default del partner)
    const invoicePtIds = misFacturas
      .map((f) => f.invoice_payment_term_id?.[0])
      .filter(Boolean);
    const partnerPtIds = partnerIds
      .map((pid) => partnerDataMap[pid]?.property_payment_term_id?.[0])
      .filter(Boolean);
    const ptIds = [...new Set([...invoicePtIds, ...partnerPtIds])];
    let ptMap: Record<number, string> = {};
    if (ptIds.length > 0) {
      try {
        const pts = await callOdooRPC<any[]>(
          "account.payment.term",
          "read",
          [ptIds],
          { fields: ["id", "name"] },
        );
        pts.forEach((pt) => {
          ptMap[pt.id] = pt.name;
        });
      } catch (_) {}
    }

    // Construir facturas enriquecidas + acumular datos por cliente
    interface ClienteData {
      monto: number;
      facturas: number;
      zona: string;
      tipoPago: string;
      diasPago: string;
      creditLimit: number;
      creditUsed: number;
      creditRemaining: number;
      diasCredito: number;
      productos: Record<string, { cantidad: number; monto: number }>;
    }

    const clientesMap: Record<string, ClienteData> = {};
    const allFilteredFacturas: any[] = [];

    misFacturas.forEach((f) => {
      const partner = partnerDataMap[f.partner_id?.[0]];
      const zona = partner?.state_id?.[1] || "Sin Zona";
      const ptName =
        ptMap[f.invoice_payment_term_id?.[0]] || "Pago Inmediato";
      const esCredito =
        ptName.toLowerCase().includes("crédito") ||
        ptName.toLowerCase().includes("credito") ||
        ptName.toLowerCase().includes("credit") ||
        ptName.toLowerCase().includes("30") ||
        ptName.toLowerCase().includes("60");
      const tipoPago = esCredito ? "Crédito" : "Contado";
      const lineas = lineasPorFactura[f.id] || [];
      const clienteNombre = f.partner_id?.[1] || "Sin Cliente";

      const diasMatch = ptName.match(/(\d+)/);
      const diasCredito = diasMatch ? parseInt(diasMatch[1]) : 0;

      const creditLimit = partner?.credit_limit || 0;
      const creditUsed = partner?.credit || 0;
      const creditRemaining = creditLimit - creditUsed;

      const enriched = {
        id: f.id,
        name: f.name,
        monto: f.amount_total_signed || 0,
        cliente: clienteNombre,
        fecha: f.invoice_date,
        zona,
        tipoPago,
        diasPago: ptName,
        productos: lineas.map((l) => ({
          id: l.product_id?.[0],
          nombre: productMap[l.product_id?.[0]]?.name || "Desconocido",
          cantidad: l.quantity || 0,
          subtotal: l.price_subtotal || 0,
        })),
      };
      allFilteredFacturas.push(enriched);

      if (!clientesMap[clienteNombre]) {
        clientesMap[clienteNombre] = {
          monto: 0,
          facturas: 0,
          zona,
          tipoPago,
          diasPago: ptName,
          creditLimit,
          creditUsed,
          creditRemaining,
          diasCredito,
          productos: {},
        };
      }
      const c = clientesMap[clienteNombre];
      c.monto += enriched.monto;
      c.facturas += 1;
      c.zona = zona;
      c.tipoPago = tipoPago;
      c.diasPago = ptName;
      c.creditLimit = creditLimit;
      c.creditUsed = creditUsed;
      c.creditRemaining = creditRemaining;
      c.diasCredito = diasCredito;

      enriched.productos.forEach((p) => {
        if (!c.productos[p.nombre])
          c.productos[p.nombre] = { cantidad: 0, monto: 0 };
        c.productos[p.nombre].cantidad += p.cantidad;
        c.productos[p.nombre].monto += p.subtotal;
      });
    });

    // Aplicar filtros post-acumulación
    let filtradas = allFilteredFacturas;
    if (zonaFilter) {
      filtradas = filtradas.filter((f) => f.zona === zonaFilter);
      Object.keys(clientesMap).forEach((k) => {
        if (clientesMap[k].zona !== zonaFilter) delete clientesMap[k];
      });
    }
    if (productoFilter) {
      filtradas = filtradas.filter((f) =>
        f.productos.some((p) => p.nombre === productoFilter),
      );
      Object.keys(clientesMap).forEach((k) => {
        const prods = clientesMap[k].productos;
        if (!prods[productoFilter]) delete clientesMap[k];
      });
    }
    if (pagoFilter) {
      filtradas = filtradas.filter((f) => f.tipoPago === pagoFilter);
      Object.keys(clientesMap).forEach((k) => {
        if (clientesMap[k].tipoPago !== pagoFilter) delete clientesMap[k];
      });
    }

    // Top Clientes con detalles
    const topClientes = Object.entries(clientesMap)
      .sort((a, b) => b[1].monto - a[1].monto)
      .slice(0, 20)
      .map(([nombre, data]) => {
        const prodsEntries = Object.entries(data.productos);
        const totalCantProds = prodsEntries.reduce(
          (acc, [, v]) => acc + v.cantidad,
          0,
        );

        const productosMasVendidos = prodsEntries
          .sort((a, b) => b[1].cantidad - a[1].cantidad)
          .slice(0, 5)
          .map(([nombre, v]) => ({
            nombre,
            cantidad: v.cantidad,
            monto: v.monto,
            porcentaje:
              totalCantProds > 0
                ? parseFloat(
                    ((v.cantidad / totalCantProds) * 100).toFixed(1),
                  )
                : 0,
          }));

        const productosMenosVendidos = prodsEntries
          .sort((a, b) => a[1].cantidad - b[1].cantidad)
          .slice(0, 5)
          .map(([nombre, v]) => ({
            nombre,
            cantidad: v.cantidad,
            monto: v.monto,
            porcentaje:
              totalCantProds > 0
                ? parseFloat(
                    ((v.cantidad / totalCantProds) * 100).toFixed(1),
                  )
                : 0,
          }));

        const deuda = deudaPorCliente[nombre] || { adeudoTotal: 0, totalAtrasado: 0, fechaLimiteMasAntiguo: "" };

        let diasLimite = 0;
        if (deuda.fechaLimiteMasAntiguo) {
          const fechaVenc = new Date(deuda.fechaLimiteMasAntiguo + "T00:00:00");
          const hoyMidnight = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
          const diffMs = fechaVenc.getTime() - hoyMidnight.getTime();
          diasLimite = Math.round(diffMs / (1000 * 60 * 60 * 24));
        }

        return {
          nombre,
          monto: data.monto,
          facturas: data.facturas,
          zona: data.zona,
          tipoPago: data.tipoPago,
          diasPago: data.diasPago,
          creditLimit: data.creditLimit,
          creditUsed: data.creditUsed,
          creditRemaining: data.creditRemaining,
          diasCredito: data.diasCredito,
          adeudoTotal: deuda.adeudoTotal,
          totalAtrasado: deuda.totalAtrasado,
          diasLimite,
          fechaLimite: deuda.fechaLimiteMasAntiguo,
          productosMasVendidos,
          productosMenosVendidos,
        };
      });

    // Top Productos globales
    const prodMapGlobal: Record<
      string,
      { cantidad: number; monto: number }
    > = {};
    filtradas.forEach((f) => {
      f.productos.forEach((p) => {
        if (!prodMapGlobal[p.nombre])
          prodMapGlobal[p.nombre] = { cantidad: 0, monto: 0 };
        prodMapGlobal[p.nombre].cantidad += p.cantidad;
        prodMapGlobal[p.nombre].monto += p.subtotal;
      });
    });

    const totalCantGlobal = Object.values(prodMapGlobal).reduce(
      (acc, p) => acc + p.cantidad,
      0,
    );

    const topMasVendidos = Object.entries(prodMapGlobal)
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .slice(0, 10)
      .map(([nombre, data]) => ({
        nombre,
        cantidad: data.cantidad,
        monto: data.monto,
        porcentaje:
          totalCantGlobal > 0
            ? parseFloat(((data.cantidad / totalCantGlobal) * 100).toFixed(1))
            : 0,
      }));

    const topMenosVendidos = Object.entries(prodMapGlobal)
      .sort((a, b) => a[1].cantidad - b[1].cantidad)
      .slice(0, 10)
      .map(([nombre, data]) => ({
        nombre,
        cantidad: data.cantidad,
        monto: data.monto,
        porcentaje:
          totalCantGlobal > 0
            ? parseFloat(((data.cantidad / totalCantGlobal) * 100).toFixed(1))
            : 0,
      }));

    const zonas = [...new Set(filtradas.map((f) => f.zona))].sort();
    const productos = [
      ...new Set(
        filtradas.map((f) => f.productos.map((p) => p.nombre)).flat(),
      ),
    ].sort();

    const totalMonto = filtradas.reduce((acc, f) => acc + f.monto, 0);
    const totalFacturas = filtradas.length;
    const totalContado = filtradas.filter(
      (f) => f.tipoPago === "Contado",
    ).length;
    const totalCredito = filtradas.filter(
      (f) => f.tipoPago === "Crédito",
    ).length;

    return NextResponse.json({
      topClientes,
      topMasVendidos,
      topMenosVendidos,
      zonas,
      productos,
      resumen: {
        totalMonto,
        totalFacturas,
        totalContado,
        totalCredito,
        totalClientes: Object.keys(clientesMap).length,
        totalProductos: Object.keys(prodMapGlobal).length,
      },
    });
  } catch (e: any) {
    console.error("Error API top-clientes:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
