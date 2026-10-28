import { catalogo, dominioVentas, hoyCaracas, sumarDias } from "@/lib/compras/datosOdoo";
import {
  crearTrabajo,
  guardarClienteIA,
  leerClasificacionClientes,
  leerClasificacionProductos,
} from "@/lib/inteligencia-negocio/clasificacion/datos";
import { pedirJSON } from "@/lib/inteligencia-negocio/clasificacion/ia";
import {
  ACTIVIDADES,
  nivelDeConfianza,
  type ClienteClasificado,
  type ParticipacionCompra,
} from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { MES_INICIAL, rangoDelMes } from "@/lib/inteligencia-negocio/reportes";
import { getIgAccounts, perfilPublicoInstagram, type PerfilPublicoIg } from "@/lib/instagram";
import { filterByCids, getAdAccounts } from "@/lib/meta";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Clasificación de clientes por actividad comercial: de qué vive cada
 * cliente, según lo que le compra a Supricom (la mezcla por categoría y
 * nombre corto de la Clasificación de productos) y lo que vende en su
 * Instagram (que anota BI: Odoo no guarda las redes de los clientes).
 * La venta es la de los Reportes (`dominioVentas`: sin IVA, NC restan, sin
 * servicios ni intercompañía).
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | null => (Array.isArray(v) ? v[0] : v) || null;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");

/** Venta por cliente y producto en los meses elegidos (o en todo el tramo si no se dan meses). */
export async function ventasClienteProducto(
  companyIds: number[],
  desde: string,
  hasta: string,
  meses?: Set<string>,
): Promise<{ ventas: Map<number, Map<number, number>>; nombres: Map<number, string> }> {
  const ventas = new Map<number, Map<number, number>>();
  const nombres = new Map<number, string>();
  await Promise.all(
    companyIds.map(async (cid) => {
      const grupos = await callOdooRPCEstricto<any[]>(
        "account.move.line",
        "read_group",
        [
          [...(await dominioVentas(cid)), ["invoice_date", ">=", desde], ["invoice_date", "<=", hasta]],
          ["balance:sum"],
          meses ? ["partner_id", "product_id", "invoice_date:month"] : ["partner_id", "product_id"],
        ],
        { lazy: false },
      );
      if (!Array.isArray(grupos)) throw new Error("Odoo no respondió las ventas por cliente");
      for (const g of grupos) {
        const cliente = idDe(g.partner_id);
        const producto = idDe(g.product_id);
        if (!cliente || !producto) continue;
        if (meses && !meses.has(String(g.__range?.["invoice_date:month"]?.from || "").slice(0, 7))) continue;
        let m = ventas.get(cliente);
        if (!m) ventas.set(cliente, (m = new Map()));
        m.set(producto, (m.get(producto) ?? 0) - (Number(g.balance) || 0));
        nombres.set(cliente, nombreDe(g.partner_id));
      }
    }),
  );
  return { ventas, nombres };
}

type Clasif = Awaited<ReturnType<typeof leerClasificacionProductos>>;
type Cat = Awaited<ReturnType<typeof catalogo>>;

/** Participación por categoría y por nombre corto de lo comprado (solo lo que suma, de mayor a menor). */
export function mezcla(porProducto: Map<number, number>, cat: Cat, clasif: Clasif, tope: number) {
  const total = [...porProducto.values()].reduce((s, v) => s + v, 0);
  const categorias = new Map<string, number>();
  const subcategorias = new Map<string, number>();
  for (const [id, venta] of porProducto) {
    const c = clasif.get(id);
    const categoria = c?.categoria ?? cat.get(id)?.categoria ?? "Sin categoría";
    categorias.set(categoria, (categorias.get(categoria) ?? 0) + venta);
    if (c) subcategorias.set(c.subcategoria, (subcategorias.get(c.subcategoria) ?? 0) + venta);
  }
  const top = (m: Map<string, number>): ParticipacionCompra[] =>
    total > 0
      ? [...m.entries()]
          // Menos de 0,5 % no dice nada de lo que compra.
          .filter(([, v]) => v / total >= 0.005)
          .sort((a, b) => b[1] - a[1])
          .slice(0, tope)
          .map(([nombre, v]) => ({ nombre, pct: r2((v / total) * 100) }))
      : [];
  return { total, categorias: top(categorias), subcategorias: top(subcategorias) };
}

export async function leerContactos(ids: number[]): Promise<Map<number, any>> {
  const mapa = new Map<number, any>();
  for (let i = 0; i < ids.length; i += 500) {
    const r = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "in", ids.slice(i, i + 500)]]], {
      fields: ["id", "name", "vat", "state_id", "city"],
      context: { active_test: false },
    });
    for (const p of r || []) mapa.set(p.id, p);
  }
  return mapa;
}

const zonaDe = (p: any) => nombreDe(p?.state_id).replace(/\s*\([A-Z]{2}\)$/, "") || "Sin zona";

export async function listarClientes(companyIds: number[], meses: string[]): Promise<ClienteClasificado[]> {
  const ordenados = [...new Set(meses)].sort();
  const desde = `${ordenados[0]}-01`;
  const { hasta } = rangoDelMes(ordenados[ordenados.length - 1]);
  const [{ ventas, nombres }, cat, clasifProductos, clasifClientes] = await Promise.all([
    ventasClienteProducto(companyIds, desde, hasta, new Set(ordenados)),
    catalogo(),
    leerClasificacionProductos(),
    leerClasificacionClientes(),
  ]);
  const contactos = await leerContactos([...ventas.keys()]);
  return [...ventas.entries()]
    .map(([id, porProducto]) => {
      const m = mezcla(porProducto, cat, clasifProductos, 4);
      const p = contactos.get(id);
      const c = clasifClientes.get(id);
      return {
        id,
        rif: String(p?.vat || ""),
        cliente: String(p?.name || nombres.get(id) || `Contacto ${id}`),
        zona: zonaDe(p),
        ventas: r2(m.total),
        categorias: m.categorias,
        subcategorias: m.subcategorias,
        instagram: c?.instagram ?? "",
        actividad: c?.actividad ?? null,
        detalle: c?.detalle ?? "",
        vendeEnRedes: c?.vendeEnRedes ?? "",
        confianza: c?.confianza ?? null,
        nivel: c?.confianza != null && c.actividad ? nivelDeConfianza(c.confianza) : null,
        origen: c?.actividad ? c.origen : null,
      };
    })
    .filter((c) => c.ventas !== 0)
    .sort((a, b) => b.ventas - a.ventas);
}

// ---------------------------------------------------------------------------
// IA
// ---------------------------------------------------------------------------

const SISTEMA = `Clasificas a los clientes de Supricom, un mayorista de tecnología de Venezuela, por su actividad comercial: de qué vive el cliente.
Por cada cliente recibes su razón social, su zona, lo que le compró a Supricom en los últimos 6 meses (monto en USD y participación por categoría y por tipo de producto) y, si lo tiene, su Instagram (biografía, web y textos de sus últimas publicaciones).
Devuelves:
- actividad: exactamente una de: ${ACTIVIDADES.map((a) => `"${a}"`).join(", ")}.
  El volumen pesa más que el nombre: quien compra decenas de miles de USD del mismo tipo de producto los revende (un "cyber café" que compra $400.000 en impresoras es un comercio de tecnología, no un centro de copiado); por encima de ~$200.000 en 6 meses suele ser distribuidor mayorista.
  Un cliente que compra para revender va en el tipo de comercio que es; "Empresa usuaria final" es quien compra para usarlo (pocas unidades variadas, razón social que no es de comercio de tecnología). Si el Instagram muestra que revende por redes, eso pesa más que la razón social.
- detalle: una frase con el porqué (qué compra y qué vende).
- vende_en_redes: qué vende en su Instagram (productos, marcas, tipo de cliente al que le vende) en una o dos frases; "" si no hay datos de Instagram.
- confianza: 1 si las compras y el Instagram coinciden claramente; entre 0.75 y 0.9 si solo las compras lo dejan claro; 0.65 o menos si hay pocos datos o se contradicen.
Devuelve exactamente un elemento por cliente recibido, con su mismo id.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["clientes"],
  properties: {
    clientes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "actividad", "detalle", "vende_en_redes", "confianza"],
        properties: {
          id: { type: "integer" },
          actividad: { type: "string", enum: [...ACTIVIDADES] },
          detalle: { type: "string" },
          vende_en_redes: { type: "string" },
          confianza: { type: "number" },
        },
      },
    },
  },
};

export interface PendienteCliente {
  id: number;
  cliente: string;
  zona: string;
  instagram: string;
}

/** Lo que la IA recibe de cada cliente. */
export function entradaCliente(c: PendienteCliente, m: ReturnType<typeof mezcla>, perfil: PerfilPublicoIg | null) {
  return {
    id: c.id,
    razon_social: c.cliente,
    zona: c.zona,
    compras_6_meses_usd: Math.round(m.total),
    por_categoria: m.categorias.map((x) => `${x.nombre} ${x.pct}%`),
    por_tipo_de_producto: m.subcategorias.map((x) => `${x.nombre} ${x.pct}%`),
    instagram: perfil
      ? {
          usuario: perfil.usuario,
          nombre: perfil.nombre,
          biografia: perfil.biografia,
          web: perfil.web,
          seguidores: perfil.seguidores,
          ultimas_publicaciones: perfil.textos.slice(0, 10).map((t) => t.slice(0, 300)),
        }
      : null,
  };
}

/** Lo que propone la IA para un lote (sin guardar). */
export async function pedirClasificacionClientes(entrada: ReturnType<typeof entradaCliente>[]) {
  const r = await pedirJSON<{ clientes: any[] }>(SISTEMA, JSON.stringify(entrada), ESQUEMA, 350 * entrada.length + 500);
  const ids = new Set(entrada.map((e) => e.id));
  return (r.clientes || [])
    .filter((x) => ids.has(Number(x.id)))
    .map((x) => ({
      id: Number(x.id),
      actividad: String(x.actividad),
      detalle: String(x.detalle || ""),
      vende_en_redes: String(x.vende_en_redes || ""),
      confianza: Number(x.confianza),
    }));
}

let cuentaIg: Promise<string | null> | null = null;
/** Nuestra cuenta de Instagram de Venezuela, desde la que se consultan las de los clientes. */
function cuentaIgPropia(): Promise<string | null> {
  cuentaIg ??= getIgAccounts(filterByCids(getAdAccounts(), 9))
    .then((c) => (c.find((x) => x.pais === "Venezuela") ?? c[0])?.ig_user_id ?? null)
    .catch(() => null);
  return cuentaIg;
}

const trabajo = crearTrabajo();
export const estadoClasificacionClientes = trabajo.estado;

/**
 * Empieza a clasificar en segundo plano a `ids` (los corregidos a mano
 * quedan como están). La mezcla de compras es la de los últimos 6 meses en
 * Valencia y Caracas. Devuelve cuántos van, o null si ya hay una corriendo.
 */
export async function clasificarClientes(ids: number[]): Promise<number | null> {
  if (trabajo.estado().corriendo) return null;
  const hoy = hoyCaracas();
  const desde6m = sumarDias(hoy, -183);
  const desde = desde6m > `${MES_INICIAL}-01` ? desde6m : `${MES_INICIAL}-01`;
  const [{ ventas }, cat, clasifProductos, clasifClientes] = await Promise.all([
    ventasClienteProducto([9, 10], desde, hoy),
    catalogo(),
    leerClasificacionProductos(),
    leerClasificacionClientes(),
  ]);
  const elegidos = ids.filter((id) => clasifClientes.get(id)?.origen !== "manual" || !clasifClientes.get(id)?.actividad);
  const contactos = await leerContactos(elegidos);
  const pendientes: PendienteCliente[] = elegidos.map((id) => ({
    id,
    cliente: String(contactos.get(id)?.name || `Contacto ${id}`),
    zona: zonaDe(contactos.get(id)),
    instagram: clasifClientes.get(id)?.instagram ?? "",
  }));

  const procesar = async (lote: PendienteCliente[]) => {
    const igPropia = lote.some((c) => c.instagram) ? await cuentaIgPropia() : null;
    const perfiles = new Map<number, { perfil: PerfilPublicoIg | null; motivo: string }>();
    for (const c of lote) {
      if (!c.instagram) continue;
      perfiles.set(
        c.id,
        igPropia
          ? await perfilPublicoInstagram(igPropia, c.instagram)
          : { perfil: null, motivo: "No hay cuenta de Instagram de Supricom configurada (META_ACCESS_TOKEN)" },
      );
    }
    const entrada = lote.map((c) => entradaCliente(c, mezcla(ventas.get(c.id) ?? new Map(), cat, clasifProductos, 8), perfiles.get(c.id)?.perfil ?? null));
    for (const x of await pedirClasificacionClientes(entrada)) {
      const id = x.id;
      const ig = perfiles.get(id);
      await guardarClienteIA(id, {
        actividad: String(x.actividad),
        detalle: String(x.detalle || ""),
        // Si el Instagram anotado no se pudo leer, que se vea por qué.
        vendeEnRedes: ig && !ig.perfil ? `No se pudo leer @${lote.find((c) => c.id === id)!.instagram}: ${ig.motivo}` : String(x.vende_en_redes || ""),
        confianza: Number(x.confianza),
      });
    }
  };

  return trabajo.iniciar(pendientes, 8, 3, procesar) ? pendientes.length : null;
}
