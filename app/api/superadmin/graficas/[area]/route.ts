import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaBI } from "@/lib/intercompania";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { AREAS, SEDES_GRAFICAS, liviano, nodoDetalle, type Area, type DatosArea } from "@/lib/graficas/tipos";
import { graficasVentas } from "@/lib/graficas/ventas";
import { graficasCobranza } from "@/lib/graficas/cobranza";
import { graficasInventario } from "@/lib/graficas/inventario";
import { graficasRma } from "@/lib/graficas/rma";
import { graficasRrhh } from "@/lib/graficas/rrhh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Lo armado de cada área queda 10 min en memoria (Cobranza tarda ~30 s en
 * frío): el detalle del clic sale de aquí sin volver a leer Odoo, y la
 * pantalla lo salta con `?refrescar=1`. Solo lo usa el SuperAdmin, así que no
 * hay datos de un usuario mezclados con los de otro.
 */
const MINUTOS_CACHE = 10;
const cache = new Map<string, { vence: number; valor: Promise<DatosArea> }>();

function leer(area: Area, cids: number[], sede: string, mes: string, payload: any, refrescar: boolean): Promise<DatosArea> {
  const llave = `${area}|${sede}|${mes}`;
  const ahora = Date.now();
  for (const [k, v] of cache) if (v.vence <= ahora) cache.delete(k);
  const hit = cache.get(llave);
  if (hit && !refrescar) return hit.valor;
  // Todo sin intercompañía: con el contexto de BI, lib/cxc y Días promedio
  // también dejan fuera a las empresas del grupo (lib/intercompania.ts).
  const valor = conSinIntercompaniaBI<DatosArea>(ROL_BI, () => {
    switch (area) {
      case "ventas": return graficasVentas(cids, sede, mes);
      case "cobranza": return graficasCobranza(cids, sede, mes);
      case "inventario": return graficasInventario(cids, sede, mes);
      case "rma": return graficasRma(cids, sede, mes);
      case "rrhh": return graficasRrhh(cids, sede, mes, payload);
    }
  });
  const entrada = { vence: ahora + MINUTOS_CACHE * 60_000, valor };
  cache.set(llave, entrada);
  valor.catch(() => { if (cache.get(llave) === entrada) cache.delete(llave); });
  return valor;
}

/**
 * GET /api/superadmin/graficas/<ventas|cobranza|inventario|rma|rrhh>?sede=todas|valencia|caracas|panama&mes=YYYY-MM[&refrescar=1]
 * Centro de gráficas del SuperAdmin (lib/graficas/). Solo SuperAdmin.
 * Con `&grafica=<id>&ruta=<JSON de etiquetas>[&medida=alterna]` devuelve solo
 * ese nivel del detalle (lo que se abre al hacer clic en una barra).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ area: string }> }) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const { area } = await params;
  if (!AREAS.includes(area as Area)) return NextResponse.json({ error: "Área inválida" }, { status: 404 });
  const sp = request.nextUrl.searchParams;
  const sede = (sp.get("sede") || "todas").toLowerCase();
  const cids = Object.hasOwn(SEDES_GRAFICAS, sede) ? SEDES_GRAFICAS[sede] : undefined;
  if (!cids) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const hoy = hoyCaracas().slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("mes") || "") ? sp.get("mes")! : hoy;
  if (mes > hoy) return NextResponse.json({ error: "El mes no puede ser futuro" }, { status: 400 });

  let ruta: string[] | null = null;
  if (sp.get("grafica")) {
    try {
      const r = JSON.parse(sp.get("ruta") || "[]");
      if (Array.isArray(r) && r.length > 0 && r.length <= 5 && r.every((x) => typeof x === "string")) ruta = r;
    } catch {
      /* ruta inválida: se responde abajo */
    }
    if (!ruta) return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
  }

  try {
    const data = await leer(area as Area, cids, sede, mes, auth.payload, sp.get("refrescar") === "1");
    if (ruta) {
      const nodo = nodoDetalle(data, sp.get("grafica")!, sp.get("medida") === "alterna", ruta);
      if (!nodo) return NextResponse.json({ error: "Sin detalle para esa barra" }, { status: 404 });
      return NextResponse.json({ success: true, data: nodo });
    }
    return NextResponse.json({ success: true, data: liviano(data) });
  } catch (e: any) {
    console.error(`[graficas/${area}]`, e?.message || e);
    return NextResponse.json({ error: "No se pudieron leer los datos. Intenta de nuevo." }, { status: 502 });
  }
}
