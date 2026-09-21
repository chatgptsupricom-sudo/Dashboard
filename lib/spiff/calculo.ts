import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { esVendedorExcluido } from "@/lib/cxc/vendedoresExcluidos";

/**
 * SPIFF ganado por cada vendedor de una sede en un mes, a partir de las reglas
 * de `spiff_rules` (las que configura Gerencia de Ventas en /spiff).
 *
 * Reglas:
 *  - tipo "marca": suma lo vendido de TODOS los productos de esa marca.
 *  - tipo "producto": suma solo ese producto (`product_id`; si la regla vieja
 *    no lo tiene, por nombre). La vista del vendedor hoy aplica estas reglas a
 *    cada producto de la marca; acá se respeta el producto elegido.
 *  - modo "monto" (venta sin IVA) o "cantidad" (unidades). Se gana
 *    `spiff_amount` por cada `target_amount` completo: floor(vendido / meta).
 *  - Solo cuentan las facturas dentro de las fechas de la regla.
 *  - Las notas de crédito restan (un producto devuelto no paga spiff).
 *  - La marca sale de `x_studio_marca`, igual que el administrador de reglas.
 */

export interface ReglaSpiff {
  id: number;
  brand_name: string;
  tipo: string;
  product_name: string | null;
  product_id: number | null;
  target_amount: number;
  spiff_amount: number;
  modo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface DetalleSpiff {
  reglaId: number;
  tipo: "marca" | "producto";
  marca: string;
  producto: string | null;
  modo: "monto" | "cantidad";
  meta: number;
  spiffPorMeta: number;
  vendido: number;
  metasCumplidas: number;
  spiff: number;
  /** Venta sin IVA y unidades que cuentan para la regla (el modo usa uno). */
  monto: number;
  cantidad: number;
  /** Productos que suman a la regla, de mayor a menor venta. */
  productos: { nombre: string; monto: number; cantidad: number }[];
}

export interface SpiffVendedor {
  userId: number;
  nombre: string;
  totalSpiff: number;
  facturado: number;
  /** Facturas (sin notas de crédito) del mes. */
  facturas: number;
  /** Asistente / cuenta interna según `esVendedorExcluido` (la UI lo oculta
   *  por defecto, como el check de Cuentas por Cobrar). */
  excluido: boolean;
  detalle: DetalleSpiff[];
}

export interface ResumenSpiff {
  mes: string;
  reglas: number;
  totalSpiff: number;
  vendedores: SpiffVendedor[];
}

const normalizar = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const fechaISO = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
};

/**
 * `incluirReglaId`: además de las reglas activas y vigentes en el mes, incluye
 * esa regla aunque esté inactiva o fuera de fecha (el ranking de una regla en
 * el administrador la necesita siempre; sus fechas se siguen aplicando a las
 * facturas).
 */
export async function calcularSpiffDelMes(
  companyId: number, anio: number, mes: number, opciones: { incluirReglaId?: number } = {},
): Promise<ResumenSpiff> {
  const mm = String(mes).padStart(2, "0");
  const inicio = `${anio}-${mm}-01`;
  const fin = `${anio}-${mm}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;

  const reglasRes = await query(
    `SELECT id, brand_name, tipo, product_name, product_id, target_amount, spiff_amount, modo, fecha_inicio, fecha_fin
       FROM spiff_rules
      WHERE company_id = ? AND (
        (active = 1 AND (fecha_inicio IS NULL OR fecha_inicio <= ?) AND (fecha_fin IS NULL OR fecha_fin >= ?))
        OR id = ?
      )`,
    [companyId, fin, inicio, opciones.incluirReglaId ?? -1],
  );
  const reglas: ReglaSpiff[] = (reglasRes.rows as any[]).map((r) => ({
    ...r,
    target_amount: Number(r.target_amount) || 0,
    spiff_amount: Number(r.spiff_amount) || 0,
    product_id: r.product_id != null ? Number(r.product_id) : null,
    fecha_inicio: fechaISO(r.fecha_inicio),
    fecha_fin: fechaISO(r.fecha_fin),
  })).filter((r) => r.target_amount > 0);

  const vendedoresRes = await query("SELECT name, user_id FROM sellers WHERE cids = ?", [companyId]);
  return calcularSpiff(companyId, anio, mes, reglas, vendedoresRes.rows as any[]);
}

/** Cálculo con las reglas y vendedores ya leídos de MySQL (solo lee Odoo). */
export async function calcularSpiff(
  companyId: number,
  anio: number,
  mes: number,
  reglas: ReglaSpiff[],
  sellers: { name: string; user_id: number | null }[],
): Promise<ResumenSpiff> {
  const mm = String(mes).padStart(2, "0");
  const inicio = `${anio}-${mm}-01`;
  const fin = `${anio}-${mm}-${String(new Date(anio, mes, 0).getDate()).padStart(2, "0")}`;
  const vendedorPorId = new Map<number, string>();
  const vendedorPorNombre = new Map<string, { userId: number; nombre: string }>();
  sellers.forEach((s) => {
    if (s.user_id) vendedorPorId.set(Number(s.user_id), s.name);
    vendedorPorNombre.set(normalizar(s.name), { userId: Number(s.user_id) || 0, nombre: s.name });
  });

  const resultadoVacio: ResumenSpiff = { mes: `${anio}-${mm}`, reglas: reglas.length, totalSpiff: 0, vendedores: [] };

  const facturas = (await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
      ["invoice_date", ">=", inicio],
      ["invoice_date", "<=", fin],
      ["invoice_user_id", "!=", false],
    ]],
    { fields: ["id", "invoice_user_id", "invoice_date", "move_type", "amount_untaxed_signed"], limit: 20000 },
  )) || [];
  if (facturas.length === 0) return resultadoVacio;

  // Vendedor de la sede de cada factura (por id de usuario; si `sellers` no
  // tiene el user_id cargado, por nombre).
  const vendedorDe = (inv: any): { userId: number; nombre: string } | null => {
    const uid = inv.invoice_user_id?.[0];
    if (uid && vendedorPorId.has(uid)) return { userId: uid, nombre: vendedorPorId.get(uid)! };
    const porNombre = vendedorPorNombre.get(normalizar(inv.invoice_user_id?.[1] || ""));
    return porNombre ? { userId: porNombre.userId || uid, nombre: porNombre.nombre } : null;
  };

  const facturaPorId = new Map<number, any>(facturas.map((f: any) => [f.id, f]));
  const acumulado = new Map<string, SpiffVendedor>();
  const vendedor = (v: { userId: number; nombre: string }) => {
    if (!acumulado.has(v.nombre)) acumulado.set(v.nombre, { userId: v.userId, nombre: v.nombre, totalSpiff: 0, facturado: 0, facturas: 0, excluido: esVendedorExcluido(v.nombre, companyId), detalle: [] });
    return acumulado.get(v.nombre)!;
  };
  facturas.forEach((f: any) => {
    const v = vendedorDe(f);
    if (!v) return;
    vendedor(v).facturado += Number(f.amount_untaxed_signed) || 0;
    if (f.move_type === "out_invoice") vendedor(v).facturas += 1;
  });

  if (reglas.length === 0) {
    return { ...resultadoVacio, vendedores: [...acumulado.values()].map((v) => ({ ...v, facturado: Math.round(v.facturado * 100) / 100 })) };
  }

  const lineas = (await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [[
      ["move_id", "in", facturas.map((f: any) => f.id)],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
    ]],
    { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 100000 },
  )) || [];

  const productIds = [...new Set(lineas.map((l: any) => l.product_id?.[0]).filter(Boolean))];
  const productos = productIds.length
    ? ((await callOdooRPC<any[]>(
        "product.product",
        "read",
        [productIds],
        { fields: ["id", "name", "x_studio_marca"], context: { active_test: false } },
      )) || [])
    : [];
  const infoProducto = new Map<number, { nombre: string; marca: string }>();
  productos.forEach((p: any) => {
    const m = p.x_studio_marca;
    infoProducto.set(p.id, { nombre: p.name || "", marca: (Array.isArray(m) ? m[1] : m) || "" });
  });

  // vendido[vendedor][regla] = monto y cantidad
  type Acc = { monto: number; cantidad: number; productos: Map<string, { monto: number; cantidad: number }> };
  const vendido = new Map<string, Map<number, Acc>>();
  for (const l of lineas) {
    const f = facturaPorId.get(l.move_id?.[0]);
    if (!f) continue;
    const v = vendedorDe(f);
    if (!v) continue;
    const pid = l.product_id?.[0];
    const prod = infoProducto.get(pid);
    if (!prod) continue;
    const signo = f.move_type === "out_refund" ? -1 : 1;
    const fecha = String(f.invoice_date).slice(0, 10);

    for (const r of reglas) {
      if (r.fecha_inicio && fecha < r.fecha_inicio) continue;
      if (r.fecha_fin && fecha > r.fecha_fin) continue;
      if (normalizar(prod.marca) !== normalizar(r.brand_name)) continue;
      if (r.tipo === "producto") {
        const coincide = r.product_id ? r.product_id === pid : normalizar(prod.nombre) === normalizar(r.product_name || "");
        if (!coincide) continue;
      }
      if (!vendido.has(v.nombre)) vendido.set(v.nombre, new Map());
      const porRegla = vendido.get(v.nombre)!;
      const acc = porRegla.get(r.id) ?? { monto: 0, cantidad: 0, productos: new Map() };
      const monto = signo * (Number(l.price_subtotal) || 0);
      const cantidad = signo * (Number(l.quantity) || 0);
      acc.monto += monto;
      acc.cantidad += cantidad;
      const pr = acc.productos.get(prod.nombre) ?? { monto: 0, cantidad: 0 };
      pr.monto += monto;
      pr.cantidad += cantidad;
      acc.productos.set(prod.nombre, pr);
      porRegla.set(r.id, acc);
      vendedor(v);
    }
  }

  for (const [nombre, porRegla] of vendido) {
    const sv = acumulado.get(nombre)!;
    for (const r of reglas) {
      const acc = porRegla.get(r.id);
      if (!acc) continue;
      const modo = r.modo === "cantidad" ? "cantidad" : "monto";
      const cantidadVendida = modo === "cantidad" ? acc.cantidad : acc.monto;
      const metas = Math.max(0, Math.floor(cantidadVendida / r.target_amount));
      const spiff = metas * r.spiff_amount;
      sv.detalle.push({
        reglaId: r.id,
        tipo: r.tipo === "producto" ? "producto" : "marca",
        marca: r.brand_name,
        producto: r.tipo === "producto" ? r.product_name : null,
        modo,
        meta: r.target_amount,
        spiffPorMeta: r.spiff_amount,
        vendido: Math.round(cantidadVendida * 100) / 100,
        metasCumplidas: metas,
        spiff,
        monto: Math.round(acc.monto * 100) / 100,
        cantidad: Math.round(acc.cantidad * 100) / 100,
        productos: [...acc.productos.entries()]
          .map(([nombre, x]) => ({ nombre, monto: Math.round(x.monto * 100) / 100, cantidad: Math.round(x.cantidad * 100) / 100 }))
          .sort((a, b) => b.monto - a.monto),
      });
      sv.totalSpiff += spiff;
    }
    sv.detalle.sort((a, b) => b.spiff - a.spiff || b.vendido - a.vendido);
  }

  const vendedores = [...acumulado.values()]
    .map((v) => ({ ...v, facturado: Math.round(v.facturado * 100) / 100 }))
    .sort((a, b) => b.totalSpiff - a.totalSpiff || b.facturado - a.facturado);

  return {
    mes: `${anio}-${mm}`,
    reglas: reglas.length,
    totalSpiff: vendedores.filter((v) => !v.excluido).reduce((s, v) => s + v.totalSpiff, 0),
    vendedores,
  };
}
