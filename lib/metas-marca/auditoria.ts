import { callOdooRPC } from "@/lib/odoo";
import { claveMarca, esMarcaGenerica, parecenLaMisma, SIN_MARCA } from "./marcas";
import { dominioLineas, nombreSede, type VentasSede } from "./odoo";
import type { MetaEntrada } from "./calculo";

/**
 * Auditoría de los datos de Odoo que usa Metas por marca.
 *
 * Cada control compara lo que leyó el panel contra una segunda consulta hecha
 * de otra forma (conteos y sumas agrupadas en el servidor de Odoo, filtros por
 * marca en el dominio), o señala datos de Odoo que distorsionan la venta por
 * marca (productos sin marca, marcas repetidas, intercompañía). Es de solo
 * lectura: lo que haya que corregir se corrige en Odoo.
 */

export type EstadoControl = "ok" | "aviso" | "error" | "info";

export interface Control {
  id: string;
  titulo: string;
  estado: EstadoControl;
  resumen: string;
  explicacion: string;
  columnas?: { key: string; label: string; tipo?: "dinero" | "numero" | "texto" | "pct" }[];
  filas?: Record<string, string | number | null>[];
}

export interface AuditoriaSede {
  companyId: number;
  sede: string;
  desde: string;
  hasta: string;
  generado: string;
  controles: Control[];
  conteo: Record<EstadoControl, number>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctDe = (a: number, b: number) => (b !== 0 ? Math.round((a / b) * 1000) / 10 : 0);
const TOLERANCIA = 1; // $1 de redondeo

export async function auditarSede(v: VentasSede, metas: MetaEntrada[], hoy = new Date()): Promise<AuditoriaSede> {
  const controles: Control[] = [];
  const { companyId, desde, hasta, facturas, lineas } = v;
  const lineasSinIC = lineas.filter((l) => !l.intercompania);
  const totalLineas = lineas.reduce((s, l) => s + l.ingreso, 0);
  const totalSinIC = lineasSinIC.reduce((s, l) => s + l.ingreso, 0);

  // --- Consultas de verificación en el servidor ---------------------------
  const domFact = [
    ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"],
    ["company_id", "=", companyId], ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta],
  ];
  const domLin = dominioLineas(companyId, desde, hasta);
  const icIds = [...v.intercompania.keys()];
  const [nFact, nLin, grupoFact, grupoLin, grupoLinSinIC, marcasOdoo] = await Promise.all([
    callOdooRPC<number>("account.move", "search_count", [domFact]),
    callOdooRPC<number>("account.move.line", "search_count", [domLin]),
    callOdooRPC<any[]>("account.move", "read_group", [domFact, ["amount_untaxed_signed:sum"], ["move_type"]], { lazy: false }),
    callOdooRPC<any[]>("account.move.line", "read_group", [domLin, ["balance:sum", "price_subtotal:sum"], ["move_type"]], { lazy: false }),
    callOdooRPC<any[]>("account.move.line", "read_group", [[...domLin, ["move_id.commercial_partner_id", "not in", icIds]], ["balance:sum"], ["move_type"]], { lazy: false }),
    callOdooRPC<any[]>("spiff.brand", "search_read", [[]], { fields: ["id", "name"], limit: 0, context: { active_test: false } }),
  ]);

  // 1. Registros completos
  {
    const okF = nFact === facturas.length;
    const okL = nLin === lineas.length;
    controles.push({
      id: "conteo",
      titulo: "Se leyeron todos los registros",
      estado: okF && okL ? "ok" : "error",
      resumen: okF && okL
        ? `${facturas.length.toLocaleString("es-VE")} facturas/NC y ${lineas.length.toLocaleString("es-VE")} líneas de producto, igual que el conteo de Odoo.`
        : `Odoo cuenta ${nFact} facturas y ${nLin} líneas; el panel leyó ${facturas.length} y ${lineas.length}.`,
      explicacion: "Compara lo leído con search_count del mismo filtro. Si no coincide, la lectura se cortó (límite o paginación) y la venta queda subestimada.",
      columnas: [
        { key: "concepto", label: "Concepto" }, { key: "odoo", label: "Odoo", tipo: "numero" },
        { key: "panel", label: "Panel", tipo: "numero" },
      ],
      filas: [
        { concepto: "Facturas y notas de crédito publicadas", odoo: nFact ?? null, panel: facturas.length },
        { concepto: "Líneas de producto", odoo: nLin ?? null, panel: lineas.length },
      ],
    });
  }

  // 2. Cuadre cabecera vs líneas vs servidor
  {
    const baseServidor = (grupoFact || []).reduce((s, g) => s + (Number(g.amount_untaxed_signed) || 0), 0);
    const lineasServidor = -(grupoLin || []).reduce((s, g) => s + (Number(g.balance) || 0), 0);
    const baseLeida = facturas.reduce((s, f) => s + f.baseFirmada, 0);
    const difs = [Math.abs(baseServidor - baseLeida), Math.abs(baseServidor - lineasServidor), Math.abs(lineasServidor - totalLineas)];
    const ok = difs.every((d) => d <= TOLERANCIA);
    controles.push({
      id: "cuadre",
      titulo: "La venta por líneas cuadra con el total facturado",
      estado: ok ? "ok" : "error",
      resumen: ok
        ? `Total sin IVA ${usd(totalLineas)} (con intercompañía): cuadra la base imponible de las facturas, la suma de líneas y el agregado del servidor.`
        : `Hay diferencias de hasta ${usd(Math.max(...difs))} entre cabeceras y líneas.`,
      explicacion: "Base imponible de las cabeceras (amount_untaxed_signed) contra la suma de líneas de producto (−balance), ambas calculadas por Odoo con read_group y contra lo leído por el panel. Una diferencia indica líneas que no son de producto (anticipos, secciones con monto) o facturas mal contabilizadas.",
      columnas: [
        { key: "fuente", label: "Fuente" }, { key: "monto", label: "Monto sin IVA", tipo: "dinero" },
      ],
      filas: [
        { fuente: "Cabeceras — agregado en Odoo", monto: r2(baseServidor) },
        { fuente: "Cabeceras — leídas por el panel", monto: r2(baseLeida) },
        { fuente: "Líneas de producto — agregado en Odoo", monto: r2(lineasServidor) },
        { fuente: "Líneas de producto — leídas por el panel", monto: r2(totalLineas) },
      ],
    });
  }

  // 3. Filtro intercompañía verificado en el servidor
  {
    const servidor = -(grupoLinSinIC || []).reduce((s, g) => s + (Number(g.balance) || 0), 0);
    const ok = Math.abs(servidor - totalSinIC) <= TOLERANCIA;
    const porCliente = new Map<string, { monto: number; facturas: Set<number> }>();
    for (const l of lineas) {
      if (!l.intercompania) continue;
      const x = porCliente.get(l.cliente) ?? { monto: 0, facturas: new Set() };
      x.monto += l.ingreso;
      x.facturas.add(l.facturaId);
      porCliente.set(l.cliente, x);
    }
    const montoIC = totalLineas - totalSinIC;
    controles.push({
      id: "intercompania",
      titulo: "Ventas intercompañía excluidas",
      estado: !ok ? "error" : montoIC !== 0 ? "aviso" : "ok",
      resumen: montoIC !== 0
        ? `${usd(montoIC)} (${pctDe(montoIC, totalLineas)}% de lo facturado) son ventas a empresas del grupo y no cuentan para las metas. Venta real: ${usd(totalSinIC)}.`
        : "No hay ventas a empresas del grupo en el período.",
      explicacion: "Clientes del grupo detectados por nombre (Supricom, Office Solutions Center, Ofimaster) o RIF/RUC. El total sin intercompañía se recalcula en Odoo con el filtro en el dominio y debe coincidir con el del panel. Si un cliente de la lista NO es del grupo, avisar para sacarlo del filtro.",
      columnas: [
        { key: "cliente", label: "Cliente (grupo)" }, { key: "facturas", label: "Facturas", tipo: "numero" },
        { key: "monto", label: "Monto sin IVA", tipo: "dinero" },
      ],
      filas: [...porCliente.entries()]
        .sort((a, b) => b[1].monto - a[1].monto)
        .map(([cliente, x]) => ({ cliente, facturas: x.facturas.size, monto: r2(x.monto) })),
    });
  }

  // 4. Moneda
  {
    const difMoneda = lineas.reduce((s, l) => s + (l.ingreso - l.subtotalFirmado), 0);
    const otraMoneda = facturas.filter((f) => f.moneda && v.monedaEmpresa && f.moneda !== v.monedaEmpresa);
    controles.push({
      id: "moneda",
      titulo: "Moneda de las facturas",
      estado: otraMoneda.length ? "info" : "ok",
      resumen: otraMoneda.length
        ? `${otraMoneda.length} facturas en moneda distinta a ${v.monedaEmpresa}; se convierten con la tasa contable (diferencia ${usd(difMoneda)} vs el subtotal en su moneda).`
        : `Todas las facturas están en ${v.monedaEmpresa || "la moneda de la empresa"}.`,
      explicacion: "El panel usa el balance contable (moneda de la empresa) y no el subtotal en la moneda de la factura, para no mezclar bolívares con dólares.",
      filas: otraMoneda.slice(0, 20).map((f) => ({ factura: f.numero, fecha: f.fecha, moneda: f.moneda, base: r2(f.baseFirmada) })),
      columnas: otraMoneda.length ? [
        { key: "factura", label: "Factura" }, { key: "fecha", label: "Fecha" }, { key: "moneda", label: "Moneda" },
        { key: "base", label: "Base (USD)", tipo: "dinero" },
      ] : undefined,
    });
  }

  // 5. Productos sin marca
  {
    const sin = lineasSinIC.filter((l) => l.clave === SIN_MARCA);
    const monto = sin.reduce((s, l) => s + l.ingreso, 0);
    const porProd = new Map<string, { monto: number; lineas: number; unidades: number }>();
    for (const l of sin) {
      const k = l.codigo ? `[${l.codigo}] ${l.producto}` : l.producto;
      const x = porProd.get(k) ?? { monto: 0, lineas: 0, unidades: 0 };
      x.monto += l.ingreso; x.lineas++; x.unidades += l.cantidad;
      porProd.set(k, x);
    }
    const p = pctDe(monto, totalSinIC);
    controles.push({
      id: "sin_marca",
      titulo: "Productos vendidos sin marca en Odoo",
      estado: monto === 0 ? "ok" : p >= 5 ? "error" : "aviso",
      resumen: monto === 0
        ? "Todos los productos vendidos tienen marca (SPIFF)."
        : `${usd(monto)} (${p}% de la venta) en ${porProd.size} productos sin "Marca (SPIFF)". Esa venta no suma a ninguna marca.`,
      explicacion: "El campo Marca (SPIFF) de la plantilla de producto está vacío. Asignarle la marca en Odoo hace que la venta aparezca en su marca, también en meses pasados.",
      columnas: [
        { key: "producto", label: "Producto" }, { key: "lineas", label: "Líneas", tipo: "numero" },
        { key: "unidades", label: "Unidades", tipo: "numero" }, { key: "monto", label: "Monto", tipo: "dinero" },
      ],
      filas: [...porProd.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 30)
        .map(([producto, x]) => ({ producto, lineas: x.lineas, unidades: r2(x.unidades), monto: r2(x.monto) })),
    });
  }

  // 6. Marcas repetidas: fusionadas y sospechosas
  const nombresOdoo = (marcasOdoo || []).map((b: any) => ({ id: b.id as number, nombre: String(b.name || ""), clave: claveMarca(b.name) }));
  const ventaPorId = new Map<number, number>();
  for (const l of lineasSinIC) if (l.marcaId != null) ventaPorId.set(l.marcaId, (ventaPorId.get(l.marcaId) || 0) + l.ingreso);
  {
    const porClave = new Map<string, { id: number; nombre: string }[]>();
    for (const b of nombresOdoo) porClave.set(b.clave, [...(porClave.get(b.clave) || []), b]);
    const fusion = [...porClave.entries()].filter(([, xs]) => xs.length > 1);
    controles.push({
      id: "marcas_fusionadas",
      titulo: "Marcas repetidas en Odoo que el panel suma juntas",
      estado: fusion.length ? "info" : "ok",
      resumen: fusion.length
        ? `${fusion.length} marcas están creadas dos veces en Odoo solo con otra mayúscula o un espacio; el panel las suma como una.`
        : "No hay marcas repetidas por mayúsculas o espacios.",
      explicacion: "Ejemplo: \"SMARTBITT\" y \"SMARTBITT \" (con espacio). Se juntan por nombre normalizado. Conviene unificarlas en Odoo para que los otros reportes (Stoplight, SPIFF) también cuadren.",
      columnas: [
        { key: "marca", label: "Marca" }, { key: "variantes", label: "Variantes en Odoo (id)" },
        { key: "monto", label: "Venta del período", tipo: "dinero" },
      ],
      filas: fusion.map(([clave, xs]) => ({
        marca: clave,
        variantes: xs.map((x) => `"${x.nombre}" (${x.id})`).join(" · "),
        monto: r2(xs.reduce((s, x) => s + (ventaPorId.get(x.id) || 0), 0)),
      })),
    });

    const claves = [...porClave.keys()].filter((c) => c !== SIN_MARCA);
    const ventaClave = (c: string) => (porClave.get(c) || []).reduce((s, x) => s + (ventaPorId.get(x.id) || 0), 0);
    const pares: Record<string, string | number | null>[] = [];
    for (let i = 0; i < claves.length; i++) {
      for (let j = i + 1; j < claves.length; j++) {
        if (!parecenLaMisma(claves[i], claves[j])) continue;
        pares.push({ marcaA: claves[i], ventaA: r2(ventaClave(claves[i])), marcaB: claves[j], ventaB: r2(ventaClave(claves[j])) });
      }
    }
    controles.push({
      id: "marcas_parecidas",
      titulo: "Posibles marcas duplicadas con otro nombre",
      estado: pares.length ? "aviso" : "ok",
      resumen: pares.length
        ? `${pares.length} pares de marcas con nombres casi iguales (ej. ${pares[0].marcaA} / ${pares[0].marcaB}). Si son la misma, la venta está partida.`
        : "No se encontraron nombres de marca sospechosamente parecidos.",
      explicacion: "El panel NO las junta (podría ser otra marca). Si son la misma, mover los productos a una sola marca en Odoo y archivar la otra.",
      columnas: [
        { key: "marcaA", label: "Marca A" }, { key: "ventaA", label: "Venta A", tipo: "dinero" },
        { key: "marcaB", label: "Marca B" }, { key: "ventaB", label: "Venta B", tipo: "dinero" },
      ],
      filas: pares.sort((a, b) => (Number(b.ventaA) + Number(b.ventaB)) - (Number(a.ventaA) + Number(a.ventaB))),
    });
  }

  // 7. Marcas genéricas
  {
    const porClave = new Map<string, number>();
    for (const l of lineasSinIC) if (l.clave !== SIN_MARCA && esMarcaGenerica(l.clave)) porClave.set(l.clave, (porClave.get(l.clave) || 0) + l.ingreso);
    const monto = [...porClave.values()].reduce((s, x) => s + x, 0);
    controles.push({
      id: "marcas_genericas",
      titulo: "Venta en \"marcas\" que no son marcas",
      estado: monto !== 0 ? "aviso" : "ok",
      resumen: monto !== 0
        ? `${usd(monto)} (${pctDe(monto, totalSinIC)}%) está en marcas como "No Asignado", "GENERAL", "SERVICIOS" o tipos de producto.`
        : "No hay venta en marcas genéricas.",
      explicacion: "Son categorías, servicios o comodines cargados como marca. Cuentan en el total de la sede, pero no tiene sentido ponerles meta; lo ideal es reasignar esos productos a su marca real.",
      columnas: [{ key: "marca", label: "Marca" }, { key: "monto", label: "Venta", tipo: "dinero" }],
      filas: [...porClave.entries()].sort((a, b) => b[1] - a[1]).map(([marca, m]) => ({ marca, monto: r2(m) })),
    });
  }

  // 8. Verificación independiente por marca con meta
  {
    const conMeta = metas.filter((m) => m.meta > 0);
    const idsPorClave = new Map<string, number[]>();
    for (const b of nombresOdoo) idsPorClave.set(b.clave, [...(idsPorClave.get(b.clave) || []), b.id]);
    const filas: Record<string, string | number | null>[] = [];
    let fallas = 0;
    const resultados = await Promise.all(conMeta.map(async (m) => {
      const ids = idsPorClave.get(m.clave) || [];
      if (!ids.length) return { m, servidor: null as number | null };
      const g = await callOdooRPC<any[]>("account.move.line", "read_group", [
        [...domLin, ["move_id.commercial_partner_id", "not in", icIds], ["product_id.spiff_brand_id", "in", ids]],
        ["balance:sum"], ["move_type"],
      ], { lazy: false });
      return { m, servidor: Array.isArray(g) ? -g.reduce((s, x) => s + (Number(x.balance) || 0), 0) : null };
    }));
    for (const { m, servidor } of resultados) {
      const panel = lineasSinIC.filter((l) => l.clave === m.clave).reduce((s, l) => s + l.ingreso, 0);
      const dif = servidor == null ? null : r2(panel - servidor);
      if (dif == null || Math.abs(dif) > TOLERANCIA) fallas++;
      filas.push({ marca: m.marca, panel: r2(panel), odoo: servidor == null ? null : r2(servidor), diferencia: dif });
    }
    controles.push({
      id: "verificacion_marcas",
      titulo: "Venta de cada marca con meta, recalculada en Odoo",
      estado: conMeta.length === 0 ? "info" : fallas ? "error" : "ok",
      resumen: conMeta.length === 0
        ? "Todavía no hay metas cargadas para este mes."
        : fallas
          ? `${fallas} de ${conMeta.length} marcas no cuadran con el cálculo de Odoo.`
          : `Las ${conMeta.length} marcas con meta cuadran al centavo con Odoo.`,
      explicacion: "Para cada marca con meta, Odoo suma en el servidor las líneas filtrando por la marca del producto en el dominio (sin pasar por el panel). Una diferencia indica un producto con marca distinta en la variante y la plantilla, o una marca de la meta que ya no existe.",
      columnas: [
        { key: "marca", label: "Marca" }, { key: "panel", label: "Panel", tipo: "dinero" },
        { key: "odoo", label: "Odoo", tipo: "dinero" }, { key: "diferencia", label: "Diferencia", tipo: "dinero" },
      ],
      filas,
    });

    // 9. Metas sobre marcas que no existen o no vendieron
    const huerfanas = conMeta.filter((m) => !idsPorClave.has(m.clave));
    const sinVenta = conMeta.filter((m) => idsPorClave.has(m.clave) && !lineasSinIC.some((l) => l.clave === m.clave && l.ingreso !== 0));
    controles.push({
      id: "metas_huerfanas",
      titulo: "Metas sobre marcas sin datos",
      estado: huerfanas.length ? "error" : sinVenta.length ? "aviso" : "ok",
      resumen: huerfanas.length || sinVenta.length
        ? `${huerfanas.length} metas con una marca que ya no existe en Odoo y ${sinVenta.length} marcas con meta que no vendieron nada en el período.`
        : "Todas las metas apuntan a marcas existentes con venta.",
      explicacion: "Si la marca se renombró en Odoo, la meta queda con el nombre viejo: hay que volver a cargarla con el nombre nuevo.",
      columnas: [{ key: "marca", label: "Marca" }, { key: "motivo", label: "Motivo" }, { key: "meta", label: "Meta", tipo: "dinero" }],
      filas: [
        ...huerfanas.map((m) => ({ marca: m.marca, motivo: "No existe en Odoo", meta: m.meta })),
        ...sinVenta.map((m) => ({ marca: m.marca, motivo: "Sin venta en el período", meta: m.meta })),
      ],
    });
  }

  // 10. Facturas sin vendedor / notas de crédito / cero / archivados / fechas
  {
    const fSinVend = facturas.filter((f) => !f.intercompania && !f.vendedorId);
    const ncs = facturas.filter((f) => !f.intercompania && f.tipo === "out_refund");
    const montoNC = ncs.reduce((s, f) => s + f.baseFirmada, 0);
    const cero = lineasSinIC.filter((l) => l.ingreso === 0 && l.cantidad !== 0);
    const archivados = lineasSinIC.filter((l) => !l.productoActivo);
    const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const futuras = facturas.filter((f) => f.fecha > hoyIso);
    const montoSinVend = fSinVend.reduce((s, f) => s + f.baseFirmada, 0);
    controles.push({
      id: "otros",
      titulo: "Otros datos que conviene conocer",
      estado: futuras.length ? "aviso" : "info",
      resumen: `Notas de crédito: ${ncs.length} por ${usd(montoNC)} (ya restadas). Facturas sin vendedor: ${fSinVend.length} por ${usd(montoSinVend)} (sí cuentan).`,
      explicacion: "Notas de crédito restan de la marca del producto devuelto en el mes de la nota. Las facturas sin vendedor cuentan aquí pero NO en Cobertura de marcas del Stoplight. Líneas en $0 suelen ser obsequios o garantías. Productos archivados se incluyen (si no, su venta desaparecería).",
      columnas: [{ key: "concepto", label: "Concepto" }, { key: "cantidad", label: "Cantidad", tipo: "numero" }, { key: "monto", label: "Monto", tipo: "dinero" }],
      filas: [
        { concepto: "Notas de crédito (restan)", cantidad: ncs.length, monto: r2(montoNC) },
        { concepto: "Facturas sin vendedor asignado", cantidad: fSinVend.length, monto: r2(montoSinVend) },
        { concepto: "Líneas con monto $0 y unidades", cantidad: cero.length, monto: 0 },
        { concepto: "Líneas de productos archivados", cantidad: archivados.length, monto: r2(archivados.reduce((s, l) => s + l.ingreso, 0)) },
        { concepto: "Facturas con fecha futura", cantidad: futuras.length, monto: r2(futuras.reduce((s, f) => s + f.baseFirmada, 0)) },
      ],
    });
  }

  // 11. Diferencia con Cobertura de marcas del Stoplight
  {
    const stoplight = lineas.filter((l) => l.vendedorId).reduce((s, l) => s + l.ingreso, 0);
    const icConVend = lineas.filter((l) => l.intercompania && l.vendedorId).reduce((s, l) => s + l.ingreso, 0);
    const sinVend = lineasSinIC.filter((l) => !l.vendedorId).reduce((s, l) => s + l.ingreso, 0);
    controles.push({
      id: "vs_stoplight",
      titulo: "Por qué no coincide con Cobertura de marcas del Stoplight",
      estado: icConVend !== 0 ? "aviso" : "info",
      resumen: `Stoplight: ${usd(stoplight)} · Esta sección: ${usd(totalSinIC)}. Diferencia: ${usd(stoplight - totalSinIC)}.`,
      explicacion: "El Stoplight toma solo facturas con vendedor e incluye las ventas intercompañía (se facturan con el usuario \"Asistente de Ventas\"), lo que infla la venta por marca de la sede que le vende a otra. Esta sección hace lo contrario. Las metas también son independientes.",
      columnas: [{ key: "concepto", label: "Concepto" }, { key: "monto", label: "Monto", tipo: "dinero" }],
      filas: [
        { concepto: "Venta por marca de esta sección", monto: r2(totalSinIC) },
        { concepto: "+ Intercompañía con vendedor (el Stoplight la cuenta)", monto: r2(icConVend) },
        { concepto: "− Facturas sin vendedor (el Stoplight no las cuenta)", monto: r2(sinVend) },
        { concepto: "= Base del Stoplight", monto: r2(stoplight) },
      ],
    });
  }

  const conteo: Record<EstadoControl, number> = { ok: 0, aviso: 0, error: 0, info: 0 };
  for (const c of controles) conteo[c.estado]++;
  return { companyId, sede: nombreSede(companyId), desde, hasta, generado: new Date().toISOString(), controles, conteo };
}
