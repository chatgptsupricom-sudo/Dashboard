import { query } from "@/lib/db";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";
import { emitirRecepcion, fueraDeAlcance, puedeComo, requireRecepcion, type Sesion } from "@/lib/recepcion/servidor";
import { puedeRepartirse } from "@/lib/recepcion/repartoSedes";
import {
  ErrorReparto,
  aplicarPorcentaje,
  calcularReparto,
  cambiarActivo,
  guardarManual,
  leerReparto,
  volverAutomatico,
  type Quien,
  type Reparto,
} from "@/lib/recepcion/repartoSedesDatos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Reparto entre sedes (Valencia / Caracas) de la mercancía de un packing list.
 *
 * GET  /api/recepcion/[id]/reparto-sedes  → { success, reparto, puedeEditar, repartible, cids }
 * POST /api/recepcion/[id]/reparto-sedes  { accion, version, ... } → lo mismo, ya recargado
 *
 * Ven Compras, SuperAdmin y Almacén de la sede del packing list; solo Compras
 * (y el SuperAdmin) lo cambian. No toca la recepción ni la carga en Odoo.
 * La Factura Especial de Caracas no entra al reparto (lo filtra el núcleo).
 */

type Cabecera = { id: number; cids: number; origen: string | null; descartado_at: unknown; referencia: string | null };

async function cabeceraDe(
  request: NextRequest,
  params: Promise<{ id: string }>,
): Promise<{ error: NextResponse } | { sesion: Sesion; rec: Cabecera }> {
  const { sesion, error } = await requireRecepcion(request);
  if (error) return { error };
  const crudo = (await params).id;
  const id = Number(crudo);
  if (!/^\d+$/.test(String(crudo)) || !Number.isSafeInteger(id) || id <= 0) {
    return { error: NextResponse.json({ error: "id invalido" }, { status: 400 }) };
  }
  // `origen` y `descartado_at` son columnas que se agregan solas.
  await asegurarColumnasOdoo();
  const r = await query(
    "SELECT id, cids, origen, descartado_at, referencia FROM recepcion_packing WHERE id = ?",
    [id],
  );
  const rec = (r.rows as any[])[0];
  if (!rec || fueraDeAlcance(sesion!, rec)) {
    return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  return {
    sesion: sesion!,
    rec: {
      id,
      cids: Number(rec.cids),
      origen: rec.origen ?? null,
      descartado_at: rec.descartado_at ?? null,
      referencia: rec.referencia ?? null,
    },
  };
}

/**
 * Almacén solo necesita saber cuánto va a cada sede: sin costos, sin los
 * montos de cuota en USD, sin correos ni el detalle de los cálculos del
 * historial (se queda con quién, cuándo, qué acción y el motivo).
 */
function paraSoloLectura(r: Reparto): Reparto {
  return {
    ...r,
    cabecera: r.cabecera ? { ...r.cabecera, cuotaValencia: null, cuotaCaracas: null } : null,
    lineas: r.lineas.map((l) => ({ ...l, costo: null })),
    resumen: { ...r.resumen, valorValencia: 0, valorCaracas: 0, pctValorCaracas: null },
    eventos: r.eventos.map((e) => ({
      ...e,
      email: null,
      detalle: e.detalle && typeof e.detalle === "object" ? { motivo: (e.detalle as any).motivo ?? null } : null,
    })),
  };
}

async function respuesta(sesion: Sesion, rec: Cabecera) {
  const completo = await leerReparto(rec.id);
  const puedeEditar = puedeComo(sesion, "compras");
  const reparto = puedeEditar ? completo : paraSoloLectura(completo);
  return {
    success: true as const,
    reparto,
    puedeEditar,
    repartible: puedeRepartirse(rec.cids, rec.origen),
    cids: rec.cids,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await cabeceraDe(request, params);
    if ("error" in c) return c.error;
    return NextResponse.json(await respuesta(c.sesion, c.rec));
  } catch (e: any) {
    if (e instanceof ErrorReparto) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Error leyendo el reparto entre sedes:", e);
    return NextResponse.json({ error: e?.message || "Error leyendo el reparto" }, { status: 500 });
  }
}

const ACCIONES = new Set(["activar", "calcular", "manual", "porcentaje", "automatico"]);

/** Parámetros del cálculo tal como vienen; el núcleo los normaliza. */
function parametrosDe(p: any): { pesoRotacion?: number; ventanaDias?: number } | undefined {
  if (!p || typeof p !== "object") return undefined;
  const out: { pesoRotacion?: number; ventanaDias?: number } = {};
  if (p.pesoRotacion != null && Number.isFinite(Number(p.pesoRotacion))) out.pesoRotacion = Number(p.pesoRotacion);
  if (p.ventanaDias != null && Number.isFinite(Number(p.ventanaDias))) out.ventanaDias = Number(p.ventanaDias);
  return Object.keys(out).length ? out : undefined;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx: { sesion: Sesion; rec: Cabecera } | null = null;
  try {
    const c = await cabeceraDe(request, params);
    if ("error" in c) return c.error;
    ctx = c;
    const { sesion, rec } = c;
    if (!puedeComo(sesion, "compras")) {
      return NextResponse.json({ error: "El reparto entre sedes lo cambia Compras" }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const accion = String(body?.accion ?? "");
    if (!ACCIONES.has(accion)) return NextResponse.json({ error: "Accion invalida" }, { status: 400 });

    const v = body?.version;
    const version = v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
    const quien: Quien = {
      nombre: sesion.nombre,
      email: sesion.payload?.email ? String(sesion.payload.email) : null,
    };

    switch (accion) {
      case "activar": {
        if (typeof body?.activo !== "boolean") {
          return NextResponse.json({ error: "Falta activo (true/false)" }, { status: 400 });
        }
        await cambiarActivo(rec.id, body.activo, quien, {
          versionEsperada: version,
          motivo: body?.motivo,
          parametros: parametrosDe(body?.parametros),
        });
        break;
      }
      case "calcular": {
        const motivo = String(body?.motivo ?? "").trim().slice(0, 500);
        await calcularReparto(rec.id, quien, {
          parametros: parametrosDe(body?.parametros),
          reiniciarManuales: body?.reiniciarManuales === true,
          versionEsperada: version,
          motivo: motivo || null,
        });
        break;
      }
      case "manual": {
        const cambios = Array.isArray(body?.cambios)
          ? body.cambios.map((x: any) => ({ clave: String(x?.clave ?? ""), cantidadCaracas: x?.cantidadCaracas }))
          : [];
        await guardarManual(rec.id, cambios, body?.motivo, quien, version);
        break;
      }
      case "porcentaje": {
        await aplicarPorcentaje(rec.id, body?.pctCaracas, body?.motivo, quien, version);
        break;
      }
      case "automatico": {
        const claves = Array.isArray(body?.claves) ? body.claves.map((x: unknown) => String(x)) : null;
        await volverAutomatico(rec.id, claves, body?.motivo, quien, version);
        break;
      }
    }

    // Otras pantallas (lista, detalle abierto en otro equipo) vuelven a pedir.
    emitirRecepcion({ accion: "editado", id: rec.id, cids: rec.cids, referencia: rec.referencia });
    return NextResponse.json(await respuesta(sesion, rec));
  } catch (e: any) {
    if (e instanceof ErrorReparto) {
      // En un 409 va el reparto fresco para que la pantalla recargue.
      let reparto: unknown;
      if (e.status === 409 && ctx) {
        try {
          reparto = await leerReparto(ctx.rec.id);
        } catch (e2: any) {
          console.warn("reparto: no se pudo releer tras el 409:", e2?.message || e2);
        }
      }
      return NextResponse.json(reparto === undefined ? { error: e.message } : { error: e.message, reparto }, { status: e.status });
    }
    console.error("Error cambiando el reparto entre sedes:", e);
    return NextResponse.json({ error: e?.message || "Error cambiando el reparto" }, { status: 500 });
  }
}
