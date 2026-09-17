import { callOdooRPC } from "@/lib/odoo";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const cid = parseInt(searchParams.get("cid") || "9");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = (searchParams.get("search") || "").toLowerCase();
    const vendedor = searchParams.get("vendedor");
    // Por defecto solo banco/caja, igual que "Cobrado" de Contado/Credito, para
    // que el total de esta pantalla cuadre con esa. Con el toggle se suman las
    // retenciones y ajustes (lo que antes mostraba siempre).
    const incluirAjustes = searchParams.get("incluirAjustes") === "true";

    // Rango de fecha de abono (= confirmacion del pago). Obligatorio: sin rango
    // se toma el mes en curso, en vez de recorrer todo el historial.
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const startStr = (searchParams.get("fechaInicio") || "").split("T")[0] || inicioMes.toISOString().split("T")[0];
    const endStr = (searchParams.get("fechaFin") || "").split("T")[0] || hoy.toISOString().split("T")[0];

    // Fuente unica de cobros de CxC (lib/cxc/cobros.ts): filtra en Odoo por
    // fecha de confirmacion y diario, asi que solo viajan los abonos del rango.
    const [companies, cobros] = await Promise.all([
      callOdooRPC<any[]>("res.company", "search_read", [[["id", "in", [7, 9, 10]]]], {
        fields: ["id", "name"],
      }),
      obtenerCobros([cid], { desde: startStr, hasta: endStr, soloBanco: !incluirAjustes }),
    ]);

    const partnerIds = Array.from(new Set(cobros.map((c) => c.partnerId).filter(Boolean))) as number[];
    const partners = partnerIds.length
      ? (await callOdooRPC<any[]>("res.partner", "search_read", [[["id", "in", partnerIds]]], { fields: ["vat", "name"] })) || []
      : [];
    const partnerMap = Object.fromEntries(partners.map((p) => [p.id, p]));

    // Vendedores del dropdown: los que tienen abonos en el rango, antes de
    // aplicar el filtro de vendedor/busqueda.
    const vendedoresMap = new Map<number, string>();
    cobros.forEach((c) => { if (c.vendedorId) vendedoresMap.set(c.vendedorId, c.vendedorName); });

    let resultado = cobros.map((c) => {
      const partner = c.partnerId ? partnerMap[c.partnerId] : undefined;
      return {
        fecha_contable: c.conciliadoEl,
        doc_abono: c.pagoMoveName || "-",
        status: c.pagoEstado === "cancel" ? "Anulado" : "Vigente",
        valor_abono: c.monto,
        nit_cif_ruc: partner?.vat || "-",
        cliente: partner?.name || c.partnerName || "-",
        factura: c.facturaNombre || "-",
        fecha_factura: c.fechaFactura || "-",
        valor_pagado: c.monto,
        vendedor_id: c.vendedorId,
        vendedor: c.vendedorName,
        fecha_abono: c.fecha,
        banco: c.journalName,
        es_banco: c.esBanco,
      };
    });

    if (vendedor && vendedor !== "all") {
      resultado = resultado.filter((r) => r.vendedor_id === parseInt(vendedor));
    }
    if (search) {
      resultado = resultado.filter(
        (r) => r.cliente.toLowerCase().includes(search) || r.factura.toLowerCase().includes(search),
      );
    }

    resultado.sort((a, b) => b.fecha_abono.localeCompare(a.fecha_abono));
    const paginated = resultado.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      results: paginated,
      total_count: resultado.length,
      total_monto: Math.round(resultado.reduce((s, r) => s + r.valor_abono, 0) * 100) / 100,
      companies: (companies || []).map((c) => ({ cid: c.id.toString(), name: c.name })),
      vendedores: [...vendedoresMap.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ id: id.toString(), name })),
    });
  } catch (error: any) {
    console.error("Error API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
