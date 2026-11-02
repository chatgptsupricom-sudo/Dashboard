import { almacenSede, cachear, catalogo, costos, diaCaracas, hoyCaracas, inicioDiaUtc, leerTodo } from "@/lib/compras/datosOdoo";
import { FIN_CARGA_INICIAL } from "@/lib/gerente-marca/tipos";
import { partnersIntercompania } from "@/lib/intercompania";
import { callOdooRPC } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";
import {
  COLOR_SEDE, ESTADO, NOMBRE_SEDE, PALETA, agregarRuta, bloque, detalleDe, etiquetaMes, finDeMes, mesesHasta, r2, topConOtros,
  type Arbol, type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Inventario › «Histórico y movimientos» (`?vista=historia`): el stock al
 * cierre de cada mes y lo que entró y salió del almacén principal en el mes
 * elegido, por tipo de movimiento, producto y documento. Solo almacenables,
 * como `historialStock` de Compras: el cierre de un mes = stock de hoy menos
 * lo que entró y salió después. Valorado al costo de hoy de la sede (Odoo no
 * guarda el costo de cada movimiento). Odoo arranca en abril 2026.
 */

const MESES_HISTORIA = 12;

/** Tipos de movimiento: el sentido decide el color y si suma o resta. */
const TIPOS = [
  { id: "compra", etiqueta: "Compras a proveedores", entra: true },
  { id: "grupo_in", etiqueta: "Llegó de otra sede del grupo", entra: true },
  { id: "devol_cliente", etiqueta: "Devoluciones de clientes", entra: true },
  { id: "carga", etiqueta: "Carga inicial de Odoo", entra: true },
  { id: "ajuste_mas", etiqueta: "Ajustes que suman", entra: true },
  { id: "traslado_in", etiqueta: "Traslados desde otra ubicación", entra: true },
  { id: "venta", etiqueta: "Ventas a clientes", entra: false },
  { id: "grupo_out", etiqueta: "Enviado a otra sede del grupo", entra: false },
  { id: "devol_prov", etiqueta: "Devoluciones a proveedores", entra: false },
  { id: "ajuste_menos", etiqueta: "Ajustes que restan", entra: false },
  { id: "traslado_out", etiqueta: "Traslados a otra ubicación", entra: false },
  { id: "otro_in", etiqueta: "Otras entradas", entra: true },
  { id: "otro_out", etiqueta: "Otras salidas", entra: false },
] as const;
type TipoMov = (typeof TIPOS)[number]["id"];

function tipoDe(entra: boolean, uso: string, delGrupo: boolean, dia: string): TipoMov {
  if (entra) {
    if (uso === "supplier" || uso === "transit") return delGrupo ? "grupo_in" : "compra";
    if (uso === "customer") return delGrupo ? "grupo_in" : "devol_cliente";
    if (uso === "inventory") return dia < FIN_CARGA_INICIAL ? "carga" : "ajuste_mas";
    if (uso === "internal") return "traslado_in";
    return "otro_in";
  }
  if (uso === "customer") return delGrupo ? "grupo_out" : "venta";
  if (uso === "supplier") return delGrupo ? "grupo_out" : "devol_prov";
  if (uso === "transit") return "grupo_out";
  if (uso === "inventory") return "ajuste_menos";
  if (uso === "internal") return "traslado_out";
  return "otro_out";
}

/** Neto (entró − salió) por producto y mes "YYYY-MM" desde el corte, del almacén principal. */
function netoPorMes(cid: number): Promise<Map<number, Map<string, number>>> {
  return cachear(`graf|invhist|${cid}|${hoyCaracas()}`, async () => {
    const { ubicaciones: W } = await almacenSede(cid);
    const desde = inicioDiaUtc(CORTE_ODOO);
    const base = [["state", "=", "done"], ["date", ">=", desde], ["company_id", "=", cid]];
    // read_group por mes en hora de Caracas: ~50 mil movimientos por sede no se traen uno por uno.
    const grupo = (dominio: any[]) =>
      callOdooRPC<any[]>("stock.move", "read_group", [[...base, ...dominio], ["quantity:sum"], ["product_id", "date:month"]], {
        lazy: false, context: { tz: "America/Caracas" },
      });
    const [entradas, salidas] = await Promise.all([
      grupo([["location_dest_id", "in", W], ["location_id", "not in", W]]),
      grupo([["location_id", "in", W], ["location_dest_id", "not in", W]]),
    ]);
    if (!Array.isArray(entradas) || !Array.isArray(salidas)) throw new Error("Odoo no respondió los movimientos");
    const out = new Map<number, Map<string, number>>();
    const sumar = (filas: any[], signo: number) => {
      for (const f of filas) {
        const id = f.product_id?.[0];
        const desdeMes = f.__range?.["date:month"]?.from;
        if (!id || !desdeMes) continue;
        // __range viene en UTC: el inicio del mes de Caracas es el día 1 a las 04:00.
        const m = diaCaracas(String(desdeMes)).slice(0, 7);
        const porMes = out.get(id) ?? new Map<string, number>();
        porMes.set(m, (porMes.get(m) || 0) + signo * (Number(f.quantity) || 0));
        out.set(id, porMes);
      }
    };
    sumar(entradas, 1);
    sumar(salidas, -1);
    return out;
  });
}

type Movimiento = { producto: number; unidades: number; dia: string; tipo: TipoMov; documento: string };

/** Cada movimiento del mes que entró o salió del almacén principal, con su tipo. */
function movimientosDelMes(cid: number, mes: string): Promise<Movimiento[]> {
  return cachear(`graf|invmov|${cid}|${mes}|${hoyCaracas()}`, async () => {
    const { ubicaciones: W } = await almacenSede(cid);
    const enW = new Set(W);
    const desdeMes = `${mes}-01`;
    const hastaMes = finDeMes(mes);
    const siguiente = new Date(Date.parse(`${hastaMes}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const moves = await leerTodo(
      "stock.move",
      [
        ["state", "=", "done"], ["company_id", "=", cid],
        ["date", ">=", inicioDiaUtc(desdeMes)], ["date", "<", inicioDiaUtc(siguiente)],
        "|", ["location_id", "in", W], ["location_dest_id", "in", W],
      ],
      ["product_id", "quantity", "date", "location_id", "location_dest_id", "picking_id", "reference"],
    );
    const utiles = moves.filter((m) => enW.has(m.location_id?.[0]) !== enW.has(m.location_dest_id?.[0]));
    const otras = [...new Set(utiles.map((m) => (enW.has(m.location_dest_id?.[0]) ? m.location_id : m.location_dest_id)?.[0]).filter(Boolean))];
    const pickings = [...new Set(utiles.map((m) => m.picking_id?.[0]).filter(Boolean))];
    const [ubic, pick, grupo] = await Promise.all([
      otras.length ? leerTodo("stock.location", [["id", "in", otras]], ["usage"]) : Promise.resolve([]),
      pickings.length ? leerTodo("stock.picking", [["id", "in", pickings]], ["partner_id"]) : Promise.resolve([]),
      partnersIntercompania(),
    ]);
    const uso = new Map<number, string>(ubic.map((l: any) => [l.id, String(l.usage)]));
    const socio = new Map<number, number | undefined>(pick.map((p: any) => [p.id, p.partner_id?.[0]]));
    return utiles.map((m): Movimiento => {
      const entra = enW.has(m.location_dest_id?.[0]);
      const otra = (entra ? m.location_id : m.location_dest_id)?.[0];
      const partner = socio.get(m.picking_id?.[0]);
      const dia = diaCaracas(m.date);
      return {
        producto: m.product_id?.[0],
        unidades: Number(m.quantity) || 0,
        dia,
        tipo: tipoDe(entra, uso.get(otra) || "", partner != null && grupo.has(partner), dia),
        documento: `${m.picking_id?.[1] || m.reference || "Sin documento"} · ${dia.slice(8)}/${dia.slice(5, 7)}`,
      };
    });
  });
}

export async function graficasInventarioHistoria(cids: number[], sede: string, mes: string): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];
  const hoy = hoyCaracas();

  if (finDeMes(mes) < CORTE_ODOO) {
    avisos.push("El inventario se lee de Odoo, que arranca en abril 2026.");
    return { area: "inventario", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
  }
  const meses = mesesHasta(mes, MESES_HISTORIA).filter((m) => m >= CORTE_ODOO.slice(0, 7));

  const porSede = await Promise.all(cids.map((cid) =>
    bloque(avisos, `los movimientos de ${NOMBRE_SEDE[cid]}`, async () => {
      const [cat, almacen, costo, neto, movs] = await Promise.all([
        catalogo(), almacenSede(cid), costos(cid), netoPorMes(cid), movimientosDelMes(cid, mes),
      ]);
      return { cid, cat, almacen, costo, neto, movs };
    }),
  ));
  const listos = porSede.filter((x): x is NonNullable<typeof x> => !!x);
  if (!listos.length) return { area: "inventario", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
  const nombreProd = (cat: Map<number, any>, id: number) => {
    const p = cat.get(id);
    return p ? `${p.codigo} · ${p.nombre}` : `Producto ${id}`;
  };

  // Cierre de cada mes por sede: stock de hoy − lo que entró y salió después (por producto, sin bajar de 0).
  const cierres = meses.map((m) => ({ etiqueta: etiquetaMes(m), mes: m, v: {} as Record<number, number>, u: {} as Record<number, number> }));
  for (const { cid, cat, almacen, costo, neto } of listos) {
    const ids = new Set<number>([...almacen.stock.keys(), ...neto.keys()]);
    for (const c of cierres) {
      let v = 0;
      let u = 0;
      for (const id of ids) {
        if (cat.get(id)?.tipo !== "product") continue;
        const actual = almacen.stock.get(id)?.fisico ?? 0;
        let despues = 0;
        if (c.mes < hoy.slice(0, 7)) for (const [m, q] of neto.get(id) ?? []) if (m > c.mes) despues += q;
        const q = Math.max(0, actual - despues);
        u += q;
        v += q * (costo.get(id) || 0);
      }
      c.v[cid] = r2(v);
      c.u[cid] = Math.round(u);
    }
  }
  const fila = (k: "v" | "u") => cierres.map((c) => ({ etiqueta: c.etiqueta, ...Object.fromEntries(listos.map(({ cid }) => [String(cid), c[k][cid]])) }));
  const seriesSede = listos.map(({ cid }) => ({ clave: String(cid), etiqueta: NOMBRE_SEDE[cid], color: COLOR_SEDE[cid] }));
  const ultimo = cierres[cierres.length - 1];
  const enCurso = mes === hoy.slice(0, 7);
  kpis.push({
    id: "cierre", etiqueta: enCurso ? "Inventario hoy" : `Inventario al cierre de ${etiquetaMes(mes)}`,
    valor: r2(listos.reduce((s, { cid }) => s + ultimo.v[cid], 0)), formato: "usd",
    nota: `${listos.reduce((s, { cid }) => s + ultimo.u[cid], 0).toLocaleString("en-US")} unidades · al costo de hoy`,
  });
  graficas.push({
    id: "hist_cierre",
    titulo: "Inventario al cierre de cada mes",
    descripcion: "Almacén principal de cada sede, al costo de hoy. Abril 2026 incluye la carga inicial de Odoo.",
    tipo: "apiladas",
    formato: "usd",
    ancho: 2,
    datos: fila("v"),
    series: seriesSede,
    alterna: { etiqueta: "Unidades", formato: "num", datos: fila("u") },
  });

  // Movimientos del mes: por tipo → producto → documento, en monto y unidades.
  const arbol = { v: new Map() as Arbol, u: new Map() as Arbol };
  const porTipo = new Map<TipoMov, { v: number; u: number }>();
  const porDia = new Map<string, { entra: number; sale: number; entraU: number; saleU: number }>();
  const salidasProd = { v: new Map() as Arbol, u: new Map() as Arbol };
  let documentos = 0;
  const vistos = new Set<string>();
  for (const { cat, costo, movs } of listos) {
    for (const m of movs) {
      if (!m.producto || cat.get(m.producto)?.tipo !== "product") continue;
      const t = TIPOS.find((x) => x.id === m.tipo)!;
      const v = m.unidades * (costo.get(m.producto) || 0);
      const nombre = nombreProd(cat, m.producto);
      const x = porTipo.get(m.tipo) ?? { v: 0, u: 0 };
      x.v += v;
      x.u += m.unidades;
      porTipo.set(m.tipo, x);
      agregarRuta(arbol.v, [t.etiqueta, nombre, m.documento], v);
      agregarRuta(arbol.u, [t.etiqueta, nombre, m.documento], m.unidades);
      const d = porDia.get(m.dia) ?? { entra: 0, sale: 0, entraU: 0, saleU: 0 };
      if (t.entra) { d.entra += v; d.entraU += m.unidades; } else { d.sale += v; d.saleU += m.unidades; }
      porDia.set(m.dia, d);
      if (!t.entra && m.tipo !== "traslado_out") {
        agregarRuta(salidasProd.v, [nombre, `${t.etiqueta}: ${m.documento}`], v);
        agregarRuta(salidasProd.u, [nombre, `${t.etiqueta}: ${m.documento}`], m.unidades);
      }
      if (!vistos.has(m.documento)) { vistos.add(m.documento); documentos++; }
    }
  }
  const tot = (entra: boolean) => [...porTipo].filter(([id]) => TIPOS.find((t) => t.id === id)!.entra === entra)
    .reduce((s, [, x]) => ({ v: s.v + x.v, u: s.u + x.u }), { v: 0, u: 0 });
  const entro = tot(true);
  const salio = tot(false);
  const ajuste = (porTipo.get("ajuste_mas")?.v || 0) - (porTipo.get("ajuste_menos")?.v || 0);
  kpis.push({ id: "entro", etiqueta: "Entró en el mes", valor: r2(entro.v), formato: "usd", nota: `${Math.round(entro.u).toLocaleString("en-US")} unidades` });
  kpis.push({ id: "salio", etiqueta: "Salió en el mes", valor: r2(salio.v), formato: "usd", nota: `${Math.round(salio.u).toLocaleString("en-US")} unidades` });
  kpis.push({ id: "ajustes", etiqueta: "Ajustes netos", valor: r2(ajuste), formato: "usd", nota: "suman − restan, al costo" });
  kpis.push({ id: "documentos", etiqueta: "Documentos con movimiento", valor: documentos, formato: "num", nota: "recepciones, entregas, ajustes…" });

  const tipos = TIPOS.filter((t) => porTipo.get(t.id)?.u);
  const filasTipo = (k: "v" | "u") => tipos.map((t) => ({ etiqueta: t.etiqueta, valor: k === "u" ? Math.round(porTipo.get(t.id)!.u) : r2(porTipo.get(t.id)!.v) }));
  const niveles = [{ que: "Productos", max: 30 }, { que: "Documentos", max: 30 }];
  graficas.push({
    id: "hist_tipos",
    titulo: `Entradas y salidas de ${etiquetaMes(mes)}`,
    descripcion: "En verde lo que entró al almacén y en rojo lo que salió. Clic para ver los productos y, en cada uno, sus documentos.",
    tipo: "barras_h",
    formato: "usd",
    ancho: 2,
    datos: filasTipo("v"),
    series: [{ clave: "valor", etiqueta: "Al costo", color: PALETA[0] }],
    colorPorFila: tipos.map((t) => (t.entra ? ESTADO.bien : ESTADO.critico)),
    detalle: detalleDe(filasTipo("v"), arbol.v, niveles),
    alterna: { etiqueta: "Unidades", formato: "num", datos: filasTipo("u"), detalle: detalleDe(filasTipo("u"), arbol.u, niveles, undefined, Math.round) },
    vacio: "No hubo movimientos en el almacén este mes.",
  });

  const dias = [...porDia.keys()].sort();
  const filaDia = (u: boolean) => dias.map((d) => {
    const x = porDia.get(d)!;
    return { etiqueta: d.slice(8), entra: u ? Math.round(x.entraU) : r2(x.entra), sale: u ? Math.round(x.saleU) : r2(x.sale) };
  });
  graficas.push({
    id: "hist_dias",
    titulo: "Movimiento día a día",
    tipo: "barras",
    formato: "usd",
    datos: filaDia(false),
    series: [
      { clave: "entra", etiqueta: "Entró", color: ESTADO.bien },
      { clave: "sale", etiqueta: "Salió", color: ESTADO.critico },
    ],
    alterna: { etiqueta: "Unidades", formato: "num", datos: filaDia(true) },
    vacio: "No hubo movimientos en el almacén este mes.",
  });

  const filasProd = (k: "v" | "u") => topConOtros([...salidasProd[k]].map(([etiqueta, n]) => ({ etiqueta, valor: k === "u" ? Math.round(n.valor) : n.valor })), 15, "Otros productos");
  const nivelesProd = [{ que: "Documentos", max: 30 }];
  graficas.push({
    id: "hist_salidas",
    titulo: "Productos con más salidas",
    descripcion: "Ventas, envíos a otras sedes, devoluciones a proveedores y ajustes que restan. Clic para ver cada documento.",
    tipo: "barras_h",
    formato: "usd",
    datos: filasProd("v"),
    series: [{ clave: "valor", etiqueta: "Salió", color: ESTADO.critico }],
    detalle: detalleDe(filasProd("v"), salidasProd.v, nivelesProd, "Productos"),
    alterna: { etiqueta: "Unidades", formato: "num", datos: filasProd("u"), detalle: detalleDe(filasProd("u"), salidasProd.u, nivelesProd, "Productos", Math.round) },
    vacio: "No salió nada del almacén este mes.",
  });

  avisos.push("Valorado al costo de hoy de cada producto: Odoo no guarda el costo de cada movimiento.");
  return { area: "inventario", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
