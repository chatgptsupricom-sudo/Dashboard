import { leerMercado, listarCargas, nivelDeConfianza, type Carga } from "@/lib/inteligencia-negocio/precios/datos";
import { norm } from "@/lib/inteligencia-negocio/precios/leerLista";

/**
 * Catálogo de mercado para el tablero, con la forma que espera
 * (`{MKT: {d, r}, meta}`, la misma del archivo data/mercado.json del HTML).
 *
 * Regla del precio más bajo entre listas: si un mayorista mandó dos o más
 * listas en el mismo corte (general, VIP, contado…), de cada producto queda
 * solo el precio más bajo. Por carga se cuenta cuántos de sus productos
 * perdieron contra otra lista del mismo mayorista y corte; una lista que
 * los pierde todos queda «descartada por precios más altos».
 */

const skuKey = (s: string) => {
  let t = norm(s).trim();
  if (!t || t === "NONE" || t === "FALSE") return "";
  t = t.replace(/#\w+$/, "").replace(/-EX$/, "");
  return t.replace(/[^A-Z0-9]/g, "");
};

export interface ComparacionCarga {
  ganados: number;
  perdidos: number;
  descartada: boolean;
}

export async function consolidado(): Promise<{
  filas: Awaited<ReturnType<typeof leerMercado>>;
  porCarga: Map<number, ComparacionCarga>;
}> {
  const todas = await leerMercado();
  const mejor = new Map<string, (typeof todas)[number]>();
  const competidores = new Map<string, Set<number>>();
  for (const f of todas) {
    const k = `${f.mayorista}|${f.fecha}|${skuKey(f.codigo) || "D:" + f.clave}`;
    const m = mejor.get(k);
    if (!competidores.has(k)) competidores.set(k, new Set());
    competidores.get(k)!.add(f.carga_id);
    if (!m || f.pvp < m.pvp) mejor.set(k, f);
  }
  const porCarga = new Map<number, ComparacionCarga>();
  const cuenta = (id: number) => {
    if (!porCarga.has(id)) porCarga.set(id, { ganados: 0, perdidos: 0, descartada: false });
    return porCarga.get(id)!;
  };
  for (const [k, ids] of competidores) {
    const g = mejor.get(k)!;
    for (const id of ids) {
      if (id === g.carga_id) cuenta(id).ganados++;
      else cuenta(id).perdidos++;
    }
  }
  for (const c of porCarga.values()) c.descartada = c.ganados === 0 && c.perdidos > 0;
  return { filas: [...mejor.values()], porCarga };
}

export async function mercadoParaTablero() {
  const [{ filas }, cargas] = await Promise.all([consolidado(), listarCargas()]);
  const d: Record<"brand" | "cat" | "sub" | "may" | "niv" | "date", string[]> = { brand: [], cat: [], sub: [], may: [], niv: [], date: [] };
  const ix: Record<string, Map<string, number>> = {};
  (Object.keys(d) as (keyof typeof d)[]).forEach((k) => (ix[k] = new Map()));
  const I = (k: keyof typeof d, v: string) => {
    v = v ?? "";
    if (!ix[k].has(v)) {
      ix[k].set(v, d[k].length);
      d[k].push(v);
    }
    return ix[k].get(v)!;
  };
  const r = filas.map((f) => [
    f.codigo,
    I("brand", f.marca),
    I("cat", f.categoria),
    I("sub", f.subcategoria),
    f.confianza,
    I("niv", nivelDeConfianza(f.confianza)),
    f.observaciones,
    I("may", f.mayorista),
    I("date", f.fecha),
    f.pvp,
    f.descripcion,
  ]);
  const ultima = cargas.reduce<Carga | null>((a, c) => (!a || c.created_at > a.created_at ? c : a), null);
  return {
    MKT: { d, r },
    meta: {
      mktTs: ultima?.created_at || "",
      mktSource: ultima ? `${cargas.length} lista(s) cargadas en el panel` : "sin listas cargadas",
    },
  };
}
