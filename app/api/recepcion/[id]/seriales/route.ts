import { query } from "@/lib/db";
import { normalizarCodigo } from "@/lib/escaneo/codigos";
import { MAX_CODIGO } from "@/lib/escaneo/procesar";
import { contenedorDeConteo, recontarSeriales } from "@/lib/recepcion/conteo";
import { abiertaParaSeriales, renglonesSinSeriales } from "@/lib/recepcion/serialesFaltantes";
import {
  cargarRecepcion,
  emitirRecepcion,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/recepcion/[id]/seriales
 *
 * Renglones de una recepcion cerrada que esperan seriales para cargarse en
 * Odoo (lib/recepcion/serialesFaltantes.ts), con cuantos faltan. Vacio si la
 * recepcion no esta en ese caso. Se pistolean por /escaneo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, renglones: await renglonesSinSeriales(datos) });
  } catch (e: any) {
    console.error("[recepcion] no se pudieron leer los seriales que faltan:", e?.message);
    return NextResponse.json(
      { error: "No se pudo consultar en Odoo que productos llevan serial: " + String(e?.message || e).slice(0, 300) },
      { status: 502 },
    );
  }
}

const MAX_SERIALES = 5000;
const DE_A = 500;

const enTrozos = <T,>(lista: T[]) =>
  Array.from({ length: Math.ceil(lista.length / DE_A) }, (_, n) => lista.slice(n * DE_A, (n + 1) * DE_A));

/**
 * POST /api/recepcion/[id]/seriales  { item_id, seriales: string[], contenedor_id? }
 *
 * Carga masiva de seriales de un renglon (los pega Almacen o sale de un
 * Excel/CSV), en vez de pistolearlos uno por uno. Las mismas reglas que la
 * pistola (/escaneo):
 *  - Contando (packing list descargando): van al contenedor de ese telefono y
 *    la cantidad del renglon pasa a ser la cantidad de seriales.
 *  - Recepcion cerrada que espera seriales para cargarse en Odoo: solo los
 *    renglones que los esperan y hasta lo recibido (lo que pase, sobra).
 *  - Un serial que ya esta en esta recepcion no se repite; si ya entro en otro
 *    packing list se avisa pero se carga.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "Los seriales los carga Almacen" }, { status: 403 });
    }
    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const item = (datos.items as any[]).find((i) => Number(i.id) === Number(body?.item_id));
    if (!item) return NextResponse.json({ error: "Ese renglon no es de esta recepcion" }, { status: 404 });

    // Limpios, sin repetir dentro de la misma lista.
    const crudos = Array.isArray(body?.seriales) ? body.seriales : [];
    if (crudos.length > MAX_SERIALES) {
      return NextResponse.json({ error: `Maximo ${MAX_SERIALES} seriales por carga` }, { status: 400 });
    }
    const vistos = new Set<string>();
    const repetidosEnLista: string[] = [];
    const lista: string[] = [];
    for (const c of crudos) {
      const s = normalizarCodigo(String(c ?? "").trim().slice(0, MAX_CODIGO));
      if (!s) continue;
      if (vistos.has(s)) {
        repetidosEnLista.push(s);
        continue;
      }
      vistos.add(s);
      lista.push(s);
    }
    if (lista.length === 0) return NextResponse.json({ error: "No hay seriales para cargar" }, { status: 400 });

    // Donde van y hasta cuantos.
    let contenedorId = 0;
    let tope: number | null = null;
    const cerrada = datos.recepcion.etapa === "cerrado";
    if (datos.recepcion.etapa === "descargando") {
      const cont = contenedorDeConteo(datos.contenedores, body?.contenedor_id);
      if ("error" in cont) return NextResponse.json({ error: cont.error }, { status: cont.status });
      contenedorId = cont.id;
    } else if (cerrada && abiertaParaSeriales(datos.recepcion)) {
      const renglon = (await renglonesSinSeriales(datos)).find((r) => r.item_id === Number(item.id));
      if (!renglon) {
        return NextResponse.json(
          { error: `${item.producto}: no espera seriales para cargarse en Odoo` },
          { status: 409 },
        );
      }
      tope = Math.max(0, renglon.faltan);
      const filas = (item.conteo || []).filter((f: any) => Number(f.cantidad_recibida) > 0);
      contenedorId = filas.length === 1 ? Number(filas[0].contenedor_id) || 0 : 0;
    } else {
      return NextResponse.json(
        { error: "Los seriales se cargan mientras se cuenta, o con la recepcion cerrada si Odoo los espera" },
        { status: 409 },
      );
    }

    // Los que ya estan en esta recepcion (en este renglon o en otro).
    const ya = new Map<string, number>();
    for (const trozo of enTrozos(lista)) {
      const r = await query(
        `SELECT serial, item_id FROM recepcion_packing_seriales
          WHERE recepcion_id = ? AND serial IN (${trozo.map(() => "?").join(", ")})`,
        [id, ...trozo],
      );
      for (const f of r.rows as any[]) ya.set(normalizarCodigo(f.serial), Number(f.item_id));
    }
    const repetidos = lista.filter((s) => ya.has(s));
    let nuevos = lista.filter((s) => !ya.has(s));
    let sobran: string[] = [];
    if (tope !== null && nuevos.length > tope) {
      sobran = nuevos.slice(tope);
      nuevos = nuevos.slice(0, tope);
    }

    // Aviso: ya entraron en otro packing list (no bloquea, como la pistola).
    const enOtro: Array<{ serial: string; referencia: string }> = [];
    for (const trozo of enTrozos(nuevos)) {
      const r = await query(
        `SELECT s.serial, MIN(r.referencia) AS referencia FROM recepcion_packing_seriales s
           JOIN recepcion_packing r ON r.id = s.recepcion_id
          WHERE s.recepcion_id <> ? AND s.serial IN (${trozo.map(() => "?").join(", ")})
          GROUP BY s.serial`,
        [id, ...trozo],
      );
      for (const f of r.rows as any[]) enOtro.push({ serial: String(f.serial), referencia: String(f.referencia || "") });
    }

    let agregados = 0;
    for (const trozo of enTrozos(nuevos)) {
      const r = await query(
        `INSERT IGNORE INTO recepcion_packing_seriales (recepcion_id, item_id, serial, escaneado_por, contenedor_id)
         VALUES ${trozo.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
        trozo.flatMap((s) => [id, item.id, s, sesion!.nombre, contenedorId]),
      );
      agregados += Number((r.rows as any)?.affectedRows || 0);
    }

    let cantidad: number | null = null;
    let enContenedor: number | null = null;
    if (agregados > 0) {
      // Desde aca el renglon se cuenta por serial (como con la pistola).
      await query("UPDATE recepcion_packing_items SET lleva_serial = 1 WHERE id = ? AND NOT (lleva_serial <=> 1)", [item.id]);
      if (!cerrada) {
        const c = await recontarSeriales(id, Number(item.id), contenedorId, sesion!.nombre);
        cantidad = Number(c.total || 0);
        enContenedor = c.contenedor;
      }
      emitirRecepcion({ accion: "conteo", id, cids: Number(datos.recepcion.cids) });
    }

    return NextResponse.json({
      success: true,
      agregados,
      repetidos,
      repetidos_en_lista: repetidosEnLista,
      sobran,
      en_otro: enOtro,
      cantidad,
      cantidad_contenedor: enContenedor ?? 0,
      contenedor_id: contenedorId,
    });
  } catch (e: any) {
    console.error("[recepcion] no se pudieron cargar los seriales:", e?.message);
    return NextResponse.json({ error: "No se pudieron cargar los seriales" }, { status: 500 });
  }
}
