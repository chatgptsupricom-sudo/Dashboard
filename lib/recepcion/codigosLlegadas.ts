import { callOdooRPC } from "@/lib/odoo";

/**
 * Codigo (default_code de Odoo) para los renglones de packing list que se
 * cargaron sin codigo, para que en el calendario de Llegadas no se confundan
 * productos de nombre parecido.
 *
 * 1. Si el renglon tiene `odoo_product_id`, el codigo de ese producto.
 * 2. Si no, por nombre: el packing list trae el nombre cortado o escrito
 *    distinto que Odoo ("DELL PRO KM3322W - TECLADO Y MOUSE INALAM." /
 *    "...INALAMBRICO, ESPAÑOL"; "APC BACK UPS PRO BX1000M" / "APC UPS BACK PRO
 *    BX1000M"). Vale el producto que tiene ese nombre o lo contiene, y si no,
 *    el que tiene todos los modelos del nombre (palabras con letras y numeros:
 *    BX1000M, KM3322W). Solo si sale un unico codigo.
 * Si es ambiguo o no aparece, queda sin codigo. Si Odoo falla, tambien: la
 * pantalla funciona igual.
 */

type Renglon = { codigo: string | null; producto: string; odoo_product_id?: unknown };
type ProductoOdoo = { codigo: string; nombre: string; texto: string };

const TTL_MS = 60 * 60 * 1000;
const POR_CONSULTA = 40;
// nombre normalizado -> codigo ("" = no se encontro uno solo)
const cache = new Map<string, { codigo: string; hasta: number }>();

/** Minusculas, sin acentos ni signos, espacios simples. */
const normalizar = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Palabras que parecen modelo: letras y numeros, 4+ caracteres. */
const modelos = (nombre: string) =>
  [...new Set(nombre.split(" "))].filter((w) => w.length >= 4 && /[a-z]/.test(w) && /\d/.test(w));

/** El nombre como viene, sin signos al final ("INALAM." -> "INALAM"), para el ilike de Odoo. */
const paraBuscar = (s: string) => s.replace(/\s+/g, " ").replace(/[\s.,;:\-]+$/, "").trim();

async function codigosPorId(ids: number[]): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  if (!ids.length) return mapa;
  const r = await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", ids]]], {
    fields: ["default_code"],
    context: { active_test: false },
  });
  for (const p of r || []) if (p.default_code) mapa.set(p.id, String(p.default_code).trim());
  return mapa;
}

const unico = (ps: ProductoOdoo[]) => {
  const codigos = new Set(ps.map((p) => p.codigo));
  return codigos.size === 1 ? [...codigos][0] : "";
};

/** Un codigo para el nombre (normalizado), o "" si no hay uno solo. */
function elegir(nombre: string, productos: ProductoOdoo[]): string {
  const exacto = unico(productos.filter((p) => p.nombre === nombre));
  if (exacto) return exacto;
  const contiene = unico(productos.filter((p) => p.nombre.includes(nombre)));
  if (contiene) return contiene;
  const ms = modelos(nombre);
  if (!ms.length) return "";
  // Cada modelo como inicio de palabra del nombre o del codigo (AC70P -> AC70P-EX).
  return unico(productos.filter((p) => ms.every((m) => p.texto.includes(` ${m}`))));
}

/** `nombres`: nombre normalizado -> como viene en el packing list. */
async function codigosPorNombre(nombres: Map<string, string>): Promise<Map<string, string>> {
  const ahora = Date.now();
  const mapa = new Map<string, string>();
  const faltan: string[] = [];
  for (const n of nombres.keys()) {
    const c = cache.get(n);
    if (c && c.hasta > ahora) mapa.set(n, c.codigo);
    else faltan.push(n);
  }
  if (!faltan.length) return mapa;

  // Una sola bolsa de candidatos: por el nombre (ilike no ignora acentos, va
  // el original) y por cada modelo, en el nombre o en el codigo.
  const condiciones = new Map<string, any[]>();
  for (const n of faltan) {
    const original = paraBuscar(nombres.get(n) || "");
    if (original) condiciones.set(`n:${original.toLowerCase()}`, ["name", "ilike", original]);
    for (const m of modelos(n)) {
      condiciones.set(`m:${m}`, ["name", "ilike", m]);
      condiciones.set(`c:${m}`, ["default_code", "ilike", m]);
    }
  }
  const todas = [...condiciones.values()];
  const grupos: any[][] = [];
  for (let i = 0; i < todas.length; i += POR_CONSULTA) grupos.push(todas.slice(i, i + POR_CONSULTA));

  const productos = new Map<number, ProductoOdoo>();
  let fallo = false;
  await Promise.all(
    grupos.map(async (grupo) => {
      const dominio = [...Array(grupo.length - 1).fill("|"), ...grupo];
      const r = await callOdooRPC<any[]>("product.product", "search_read", [dominio], {
        fields: ["default_code", "name"],
        limit: 2000,
      });
      if (!r) {
        fallo = true;
        return;
      }
      for (const p of r) {
        if (!p.default_code) continue;
        const codigo = String(p.default_code).trim();
        const nombre = normalizar(p.name);
        productos.set(p.id, { codigo, nombre, texto: ` ${nombre} ${normalizar(codigo)} ` });
      }
    }),
  );

  const pool = [...productos.values()];
  for (const n of faltan) {
    const codigo = elegir(n, pool);
    mapa.set(n, codigo);
    // Si Odoo fallo, no se guarda: se reintenta la proxima vez.
    if (!fallo) cache.set(n, { codigo, hasta: ahora + TTL_MS });
  }
  return mapa;
}

/** Llena `codigo` en los renglones que no lo traen (modifica el arreglo). */
export async function completarCodigos(renglones: Renglon[]): Promise<void> {
  const sinCodigo = renglones.filter((r) => !String(r.codigo || "").trim());
  if (!sinCodigo.length) return;
  try {
    const ids = [...new Set(sinCodigo.map((r) => Number(r.odoo_product_id)).filter((id) => id > 0))];
    const porId = await codigosPorId(ids);
    for (const r of sinCodigo) {
      const c = porId.get(Number(r.odoo_product_id));
      if (c) r.codigo = c;
    }

    const nombres = new Map<string, string>();
    for (const r of sinCodigo) {
      const n = normalizar(r.producto);
      if (!r.codigo && n) nombres.set(n, String(r.producto));
    }
    const porNombre = await codigosPorNombre(nombres);
    for (const r of sinCodigo) {
      if (!r.codigo) r.codigo = porNombre.get(normalizar(r.producto)) || null;
    }
  } catch (e: any) {
    console.error("[llegadas] no se pudieron completar los codigos:", e?.message);
  }
}
