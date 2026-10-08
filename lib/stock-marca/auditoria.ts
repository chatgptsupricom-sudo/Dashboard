import { callOdooRPC } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";
import { partnersIntercompania } from "@/lib/intercompania";
import { esMarcaGenerica, parecenLaMisma, SIN_MARCA } from "@/lib/metas-marca/marcas";
import type { AuditoriaSede, Control, EstadoControl } from "@/lib/metas-marca/auditoria";
import { calcularStockMarca } from "./calculo";
import { almacenPrincipal, dominioVentas, finDiaUtc, idsAlmacenables, infoProductos, quantsHoy, reconstruccion, stockAlCorte } from "./odoo";
import { finDeMes } from "./periodo";
import type { Periodo } from "./periodo";
import { datosSede, nombreSede } from "./servicio";

/**
 * Auditoría de Stock por marca. Cada control vuelve a preguntarle a Odoo de
 * otra forma (sumas en el servidor sin agrupar por producto, el stock
 * histórico nativo contra la reconstrucción por movimientos, filtros en el
 * dominio en vez de en el panel) y lo compara con lo que muestra la sección;
 * o señala datos de Odoo que distorsionan el stock por marca. Solo lectura.
 * Falla cerrado: si Odoo no contesta una verificación, no hay auditoría.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TOL_U = 0.01;
const TOL_USD = 1;

async function agrupar(model: string, domain: any[], fields: string[], groupby: string[], context?: Record<string, any>): Promise<any[]> {
  const r = await callOdooRPC<any[]>(model, "read_group", [domain, fields, groupby], { lazy: false, ...(context ? { context } : {}) });
  if (!Array.isArray(r)) throw new Error(`Odoo no respondió una verificación (${model})`);
  return r;
}

/** `incluirIC`: la misma opción que tiene la pantalla, para auditar exactamente lo que se ve. */
export async function auditarSede(companyId: number, periodo: Periodo, incluirIC = false): Promise<AuditoriaSede> {
  const controles: Control[] = [];
  const sede = nombreSede(companyId);
  // Datos del panel releídos de Odoo (sin caché), para no comparar caché contra vivo.
  await partnersIntercompania(true);
  const datos = await datosSede(companyId, periodo, incluirIC, true);
  const r = calcularStockMarca(periodo, [datos], incluirIC);
  const alm = await almacenPrincipal(companyId);
  const ic = [...(await partnersIntercompania()).keys()];
  const esHoy = !datos.reservado ? false : true;

  // --- 1. Stock al cierre -------------------------------------------------
  {
    const panel = r.totales.stock;
    if (esHoy) {
      const [quants, nativo, q] = await Promise.all([
        agrupar("stock.quant", [["location_id", "child_of", alm.vista], ["location_id.usage", "=", "internal"], ["company_id", "=", companyId], ["product_id.type", "=", "product"]], ["quantity:sum"], []),
        (async () => {
          const ids = await idsAlmacenables();
          let t = 0;
          for (let i = 0; i < ids.length; i += 1000) {
            const x = await callOdooRPC<any[]>("product.product", "read", [ids.slice(i, i + 1000), ["qty_available"]], {
              context: { location: alm.vista, allowed_company_ids: [companyId], active_test: false },
            });
            if (!Array.isArray(x)) throw new Error("Odoo no respondió una verificación (qty_available)");
            for (const p of x) t += Math.max(0, Number(p.qty_available) || 0);
          }
          return t;
        })(),
        quantsHoy(companyId),
      ]);
      const sumaQuants = Number(quants[0]?.quantity) || 0;
      const negativos = [...q.negativos.values()].reduce((s, x) => s + x, 0);
      const esperado = sumaQuants - negativos; // el panel toma los negativos como 0
      const ok = Math.abs(esperado - panel) <= 1 && Math.abs(nativo - panel) <= 1;
      controles.push({
        id: "stock_hoy",
        titulo: "El stock de hoy cuadra con Odoo",
        estado: ok ? "ok" : "error",
        resumen: ok
          ? `${num(panel)} unidades en ${alm.nombre}, igual a la suma de los quants y al "a mano" de Odoo.`
          : `El panel suma ${num(panel)} unidades; los quants dan ${num(esperado)} y el "a mano" de Odoo ${num(nativo)}.`,
        explicacion: `Se suma el stock de todas las ubicaciones internas del almacén principal (${alm.nombre}, con Entrada) de tres formas: producto por producto como lo muestra el panel, sumando los quants en el servidor de Odoo sin agrupar, y con la cantidad "a mano" de cada producto en el almacén (el mismo número que muestra la ficha del producto en Odoo). Las cantidades negativas se toman como 0.`,
        columnas: [{ key: "fuente", label: "Fuente" }, { key: "unidades", label: "Unidades", tipo: "numero" }],
        filas: [
          { fuente: "Panel (por producto)", unidades: r2(panel) },
          { fuente: "Quants de Odoo (suma en el servidor, sin negativos)", unidades: r2(esperado) },
          { fuente: "Cantidad a mano de Odoo", unidades: r2(nativo) },
        ],
      });
    } else {
      const recons = await reconstruccion(companyId, CORTE_ODOO);
      const ids = await idsAlmacenables();
      let total = 0;
      const difs: { id: number; odoo: number; mov: number }[] = [];
      for (const id of ids) {
        const odoo = datos.stock.get(id) ?? 0;
        const mov = recons.stockAlCierre(id, periodo.corte);
        total += mov;
        if (Math.abs(odoo - mov) > TOL_U) difs.push({ id, odoo, mov });
      }
      const info = await infoProductos(difs.slice(0, 30).map((d) => d.id));
      controles.push({
        id: "stock_historico",
        titulo: `El stock al ${periodo.corte} cuadra con los movimientos`,
        estado: difs.length === 0 ? "ok" : "error",
        resumen: difs.length === 0
          ? `${num(r.totales.stock)} unidades según el histórico de Odoo, igual producto por producto a la reconstrucción por movimientos.`
          : `${difs.length} productos no cuadran: histórico de Odoo ${num(r.totales.stock)} contra ${num(total)} por movimientos.`,
        explicacion: "El stock de un día pasado sale del histórico de Odoo (la cantidad a mano a esa fecha, como el informe de inventario a una fecha). Aquí se recalcula de otra forma: el stock de hoy menos lo que entró y más lo que salió del almacén después de ese día, producto por producto.",
        columnas: [{ key: "producto", label: "Producto" }, { key: "odoo", label: "Histórico Odoo", tipo: "numero" }, { key: "mov", label: "Por movimientos", tipo: "numero" }, { key: "diferencia", label: "Diferencia", tipo: "numero" }],
        filas: difs.slice(0, 30).map((d) => ({ producto: info.get(d.id)?.nombre || `#${d.id}`, odoo: d.odoo, mov: d.mov, diferencia: r2(d.odoo - d.mov) })),
      });
    }
  }

  // --- 2. Ventas ------------------------------------------------------------
  {
    const dom = [...dominioVentas(companyId, periodo.desde, periodo.corte), ["product_id.type", "=", "product"], ...(incluirIC ? [] : [["move_id.commercial_partner_id", "not in", ic]])];
    const [grupos, nLineas] = await Promise.all([
      agrupar("account.move.line", dom, ["quantity:sum", "balance:sum"], ["move_type"]),
      callOdooRPC<number>("account.move.line", "search_count", [dom]),
    ]);
    if (typeof nLineas !== "number") throw new Error("Odoo no respondió una verificación (conteo de líneas)");
    let u = 0, d = 0;
    for (const g of grupos) {
      u += (g.move_type === "out_refund" ? -1 : 1) * (Number(g.quantity) || 0);
      d += -(Number(g.balance) || 0);
    }
    const okU = Math.abs(u - r.totales.vendido) <= TOL_U;
    const okD = Math.abs(d - r.totales.ventaUsd) <= TOL_USD;
    controles.push({
      id: "ventas",
      titulo: "Las unidades vendidas cuadran con Odoo",
      estado: okU && okD ? "ok" : "error",
      resumen: okU && okD
        ? `${num(r.totales.vendido)} unidades y ${usd(r.totales.ventaUsd)} sin IVA en ${num(nLineas)} líneas de factura, igual a la suma de Odoo.`
        : `El panel suma ${num(r.totales.vendido)} u / ${usd(r.totales.ventaUsd)}; Odoo da ${num(u)} u / ${usd(d)}.`,
      explicacion: `Vendido = líneas de producto de facturas, recibos y notas de crédito de cliente publicadas entre las dos fechas (por fecha de factura), solo de productos almacenables${incluirIC ? " e incluyendo las ventas a empresas del grupo (filtro activo)" : " y sin ventas a empresas del grupo"}; las notas de crédito restan. Aquí Odoo suma todo en el servidor con esos filtros puestos en la consulta, sin pasar por el panel.`,
      columnas: [{ key: "fuente", label: "Fuente" }, { key: "unidades", label: "Unidades", tipo: "numero" }, { key: "usd", label: "Venta sin IVA", tipo: "dinero" }],
      filas: [
        { fuente: "Panel (por producto)", unidades: r.totales.vendido, usd: r.totales.ventaUsd },
        { fuente: "Odoo (suma en el servidor)", unidades: r2(u), usd: r2(d) },
      ],
    });
  }

  // --- 3. Serie mensual: histórico de Odoo vs movimientos --------------------
  {
    const recons = await reconstruccion(companyId, CORTE_ODOO);
    const ids = await idsAlmacenables();
    // Los últimos 3 cierres: con todas las sedes, revisar 12 meses de cada una pasaba del tiempo límite.
    const cierres = r.serie.map((p) => finDeMes(p.mes)).filter((d) => d < periodo.corte).slice(-3);
    const filas = await Promise.all(cierres.map(async (dia) => {
      const nat = await stockAlCorte(companyId, dia, true);
      let odoo = 0, mov = 0, distintos = 0;
      for (const id of ids) {
        const a = nat.fisico.get(id) ?? 0;
        const b = recons.stockAlCierre(id, dia);
        odoo += a; mov += b;
        if (Math.abs(a - b) > TOL_U) distintos++;
      }
      return { cierre: dia, odoo: r2(odoo), mov: r2(mov), distintos };
    }));
    const malos = filas.filter((f) => f.distintos > 0);
    controles.push({
      id: "serie",
      titulo: "El stock de cada cierre de mes cuadra con Odoo",
      estado: !filas.length ? "info" : malos.length ? "error" : "ok",
      resumen: !filas.length
        ? "No hay cierres de mes anteriores al período para comparar."
        : malos.length
          ? `${malos.length} de ${filas.length} cierres no cuadran producto por producto.`
          : `${filas.length} cierres de mes: el histórico de Odoo y la reconstrucción por movimientos dan lo mismo producto por producto.`,
      explicacion: "El gráfico mensual usa el stock al cierre de cada mes reconstruido por movimientos (es rápido para muchos días). Aquí se comparan los últimos tres cierres, producto por producto, con el histórico nativo de Odoo.",
      columnas: [{ key: "cierre", label: "Cierre" }, { key: "odoo", label: "Histórico Odoo", tipo: "numero" }, { key: "mov", label: "Por movimientos", tipo: "numero" }, { key: "distintos", label: "Productos distintos", tipo: "numero" }],
      filas,
    });
  }

  // --- 4. Venta que queda fuera ---------------------------------------------
  {
    const e = r.totales.excluido;
    controles.push({
      id: "excluido",
      titulo: "Venta que no entra en el % vendido",
      estado: "info",
      resumen: `Intercompañía ${num(e.icUnidades)} u (${usd(e.icUsd)}), servicios ${usd(e.serviciosUsd)}, consumibles ${num(e.consumiblesUnidades)} u (${usd(e.consumiblesUsd)}).`,
      explicacion: "Las ventas a empresas del grupo (Valencia → Caracas, etc.) no son venta al cliente final: sin excluirlas, la mercancía se contaría vendida en la sede que la pasa y otra vez en la que la vende. Los servicios y los consumibles no llevan stock en Odoo, así que no tienen un \"del 100%\" contra el cual medirse. Con una sola sede elegida, el filtro \"Incluir intercompañía\" las suma.",
    });
  }

  // --- 5. Stock fuera del almacén principal -----------------------------------
  {
    const grupos = await agrupar("stock.quant", [["company_id", "=", companyId], ["location_id.usage", "=", "internal"], ["location_id", "not in", alm.ubicaciones], ["product_id.type", "=", "product"]], ["quantity:sum"], ["location_id"]);
    const filas = grupos.map((g) => ({ ubicacion: g.location_id?.[1] || "?", unidades: r2(Number(g.quantity) || 0) })).filter((f) => f.unidades !== 0).sort((a, b) => b.unidades - a.unidades);
    const total = filas.reduce((s, f) => s + f.unidades, 0);
    controles.push({
      id: "fuera",
      titulo: "Stock fuera del almacén principal",
      estado: "info",
      resumen: filas.length ? `${num(total)} unidades en ${filas.length} ubicaciones que no cuentan (exhibición, mal estado, consumo interno…).` : "Todo el stock de la sede está en el almacén principal.",
      explicacion: `El stock que se mide es el del almacén principal (${alm.nombre}), el mismo de Compras. Lo de exhibición, mal estado, demo, garantía o consumo interno no está para la venta y no entra.`,
      columnas: [{ key: "ubicacion", label: "Ubicación" }, { key: "unidades", label: "Unidades", tipo: "numero" }],
      filas,
    });
  }

  // --- 6. Cantidades negativas ------------------------------------------------
  {
    const q = esHoy ? (await quantsHoy(companyId)).negativos : (await stockAlCorte(companyId, periodo.corte)).negativos;
    const info = await infoProductos([...q.keys()]);
    const filas = [...q.entries()].map(([id, cant]) => ({ codigo: info.get(id)?.codigo || "", producto: info.get(id)?.nombre || `#${id}`, cantidad: cant })).sort((a, b) => a.cantidad - b.cantidad);
    controles.push({
      id: "negativos",
      titulo: "Productos con stock negativo en Odoo",
      estado: filas.length ? "aviso" : "ok",
      resumen: filas.length ? `${filas.length} productos con cantidad negativa al corte: se tomaron como 0.` : "Ningún producto con cantidad negativa.",
      explicacion: "Una cantidad negativa es un error de inventario en Odoo (se despachó algo que no estaba registrado como recibido). El panel la toma como 0; hay que corregirla con un ajuste de inventario.",
      columnas: [{ key: "codigo", label: "Código" }, { key: "producto", label: "Producto" }, { key: "cantidad", label: "Cantidad", tipo: "numero" }],
      filas,
    });
  }

  // --- 7. Productos sin marca --------------------------------------------------
  {
    const sin = r.productos.filter((p) => p.clave === SIN_MARCA).sort((a, b) => b.stock - a.stock || b.vendido - a.vendido);
    const stock = sin.reduce((s, p) => s + p.stock, 0);
    controles.push({
      id: "sin_marca",
      titulo: "Productos sin marca en Odoo",
      estado: sin.length ? "aviso" : "ok",
      resumen: sin.length ? `${sin.length} productos con stock o venta no tienen marca: ${num(stock)} unidades quedan en "Sin marca".` : "Todos los productos con stock o venta tienen marca.",
      explicacion: "La marca sale del campo Marca (spiff) del producto en Odoo. Sin marca, el producto se cuenta en la fila \"Sin marca\" y no en la de su marca real. Se corrige asignándole la marca en Odoo.",
      columnas: [{ key: "codigo", label: "Código" }, { key: "producto", label: "Producto" }, { key: "stock", label: "Stock", tipo: "numero" }, { key: "vendido", label: "Vendido", tipo: "numero" }],
      filas: sin.slice(0, 100).map((p) => ({ codigo: p.codigo, producto: p.nombre, stock: p.stock, vendido: p.vendido })),
    });
  }

  // --- 8. Marcas genéricas o repetidas --------------------------------------------
  {
    const claves = r.marcas.map((m) => m.clave).filter((c) => c !== SIN_MARCA);
    const genericas = r.marcas.filter((m) => m.clave !== SIN_MARCA && esMarcaGenerica(m.clave));
    const pares: { a: string; b: string }[] = [];
    for (let i = 0; i < claves.length; i++) for (let j = i + 1; j < claves.length; j++) if (parecenLaMisma(claves[i], claves[j])) pares.push({ a: claves[i], b: claves[j] });
    const filas = [
      ...genericas.map((m) => ({ marca: m.marca, problema: "No parece una marca (tipo de producto, comodín o código)", stock: m.stock })),
      ...pares.map((p) => ({ marca: `${p.a} / ${p.b}`, problema: "Posible marca repetida con otro nombre", stock: (r.marcas.find((m) => m.clave === p.a)?.stock ?? 0) + (r.marcas.find((m) => m.clave === p.b)?.stock ?? 0) })),
    ];
    controles.push({
      id: "marcas",
      titulo: "Marcas mal cargadas",
      estado: filas.length ? "aviso" : "ok",
      resumen: filas.length ? `${genericas.length} marcas genéricas y ${pares.length} posibles duplicados.` : "No se ven marcas genéricas ni repetidas.",
      explicacion: "Las variantes triviales (mayúsculas, espacios) ya se suman como una. Las que cambian letras (\"SMARTBIT\"/\"SMARTBITT\") podrían ser otra marca y no se juntan: si son la misma, hay que unificarlas en Odoo.",
      columnas: [{ key: "marca", label: "Marca" }, { key: "problema", label: "Problema" }, { key: "stock", label: "Stock", tipo: "numero" }],
      filas,
    });
  }

  // --- 9. Stock sin costo ---------------------------------------------------------
  {
    const sinCosto = r.productos.filter((p) => p.stock > 0 && p.costo <= 0).sort((a, b) => b.stock - a.stock);
    controles.push({
      id: "costo",
      titulo: "Productos con stock y sin costo",
      estado: sinCosto.length ? "aviso" : "ok",
      resumen: sinCosto.length ? `${sinCosto.length} productos (${num(sinCosto.reduce((s, p) => s + p.stock, 0))} u) no tienen costo: su valor no suma.` : "Todos los productos con stock tienen costo.",
      explicacion: "El valor del stock es unidades × costo (costo de la sede en Odoo o, si está en 0, el precio del proveedor, como en Compras). Sin costo, el producto cuenta en unidades pero no en dólares.",
      columnas: [{ key: "codigo", label: "Código" }, { key: "producto", label: "Producto" }, { key: "marca", label: "Marca" }, { key: "stock", label: "Stock", tipo: "numero" }],
      filas: sinCosto.slice(0, 100).map((p) => ({ codigo: p.codigo, producto: p.nombre, marca: p.marcaOdoo || "Sin marca", stock: p.stock })),
    });
  }

  // --- 10. Archivados con stock --------------------------------------------------------
  {
    const arch = r.productos.filter((p) => !p.activo && p.stock > 0).sort((a, b) => b.stock - a.stock);
    controles.push({
      id: "archivados",
      titulo: "Productos archivados con stock",
      estado: arch.length ? "aviso" : "ok",
      resumen: arch.length ? `${arch.length} productos archivados tienen ${num(arch.reduce((s, p) => s + p.stock, 0))} unidades en el almacén.` : "Ningún producto archivado tiene stock.",
      explicacion: "Un producto archivado no aparece en las búsquedas de Odoo ni se puede vender, pero su stock sigue en el almacén. Aquí cuenta (es mercancía real); hay que desarchivarlo o darle salida.",
      columnas: [{ key: "codigo", label: "Código" }, { key: "producto", label: "Producto" }, { key: "marca", label: "Marca" }, { key: "stock", label: "Stock", tipo: "numero" }],
      filas: arch.slice(0, 100).map((p) => ({ codigo: p.codigo, producto: p.nombre, marca: p.marcaOdoo || "Sin marca", stock: p.stock })),
    });
  }

  // --- 11. Facturado vs despachado ---------------------------------------------------------
  {
    const desdeUtc = `${periodo.desde} 04:00:00`;
    const hastaUtc = finDiaUtc(periodo.corte);
    const [salen, vuelven] = await Promise.all([
      agrupar("stock.move", [["state", "=", "done"], ["company_id", "=", companyId], ["date", ">=", desdeUtc], ["date", "<=", hastaUtc], ["location_id", "in", alm.ubicaciones], ["location_dest_id.usage", "=", "customer"], ...(incluirIC ? [] : [["picking_id.partner_id.commercial_partner_id", "not in", ic]])], ["quantity:sum"], ["product_id"]),
      agrupar("stock.move", [["state", "=", "done"], ["company_id", "=", companyId], ["date", ">=", desdeUtc], ["date", "<=", hastaUtc], ["location_dest_id", "in", alm.ubicaciones], ["location_id.usage", "=", "customer"], ...(incluirIC ? [] : [["picking_id.partner_id.commercial_partner_id", "not in", ic]])], ["quantity:sum"], ["product_id"]),
    ]);
    const desp = new Map<number, number>();
    for (const g of salen) if (g.product_id) desp.set(g.product_id[0], (desp.get(g.product_id[0]) ?? 0) + (Number(g.quantity) || 0));
    for (const g of vuelven) if (g.product_id) desp.set(g.product_id[0], (desp.get(g.product_id[0]) ?? 0) - (Number(g.quantity) || 0));
    const info = await infoProductos([...desp.keys()]);
    const porMarca = new Map<string, { marca: string; facturado: number; despachado: number }>();
    for (const m of r.marcas) porMarca.set(m.clave, { marca: m.marca, facturado: m.vendido, despachado: 0 });
    for (const [id, q] of desp) {
      const p = info.get(id);
      if (!p || p.tipo !== "product") continue;
      const x = porMarca.get(p.clave) ?? { marca: p.marcaOdoo || "Sin marca", facturado: 0, despachado: 0 };
      x.despachado += q;
      porMarca.set(p.clave, x);
    }
    const filas = [...porMarca.values()].map((x) => ({ ...x, despachado: r2(x.despachado), diferencia: r2(x.facturado - x.despachado) }))
      .filter((x) => Math.abs(x.diferencia) > TOL_U).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
    const fac = r.totales.vendido;
    const des = [...porMarca.values()].reduce((s, x) => s + x.despachado, 0);
    controles.push({
      id: "despachado",
      titulo: "Facturado contra despachado",
      estado: "info",
      resumen: `Facturado ${num(fac)} u, despachado al cliente ${num(r2(des))} u en el período (${filas.length} marcas con diferencia).`,
      explicacion: "El % vendido usa lo facturado. Lo despachado son las salidas del almacén a clientes menos sus devoluciones, sin empresas del grupo. Una diferencia es normal en los bordes del período (se factura un día y se despacha al siguiente, o se vende sin despachar todavía); una diferencia grande y sostenida es mercancía facturada que sigue en el almacén o despachada sin factura.",
      columnas: [{ key: "marca", label: "Marca" }, { key: "facturado", label: "Facturado", tipo: "numero" }, { key: "despachado", label: "Despachado", tipo: "numero" }, { key: "diferencia", label: "Diferencia", tipo: "numero" }],
      filas: filas.slice(0, 60),
    });
  }

  const conteo: Record<EstadoControl, number> = { ok: 0, aviso: 0, error: 0, info: 0 };
  for (const c of controles) conteo[c.estado]++;
  return { companyId, sede, desde: periodo.desde, hasta: periodo.corte, generado: new Date().toISOString(), controles, conteo };
}
