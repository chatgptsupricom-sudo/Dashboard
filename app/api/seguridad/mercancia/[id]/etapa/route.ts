import { getConnection, query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  ASPECTOS,
  ETAPA_DE_ACCION,
  esAccion,
  esTipoEntrega,
  etapaTrasArmado,
  evaluarArmado,
  novedadesVerificacion,
  pideComentarioPicking,
  puedeHacer,
  type Accion,
  type Aspecto,
  type Etapa,
} from "@/lib/seguridad/egresoFlujo";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { cargarMovimiento, evaluarDescuadre } from "@/lib/seguridad/mercancia";
import { hayColumnaAspecto } from "@/lib/seguridad/calificaciones";
import { faltaMigracion, sincronizarSeriales } from "@/lib/seguridad/seriales";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/seguridad/mercancia/[id]/etapa  { accion, ...datos }
 *
 * Mueve un egreso por etapas un paso adelante (ver lib/seguridad/egresoFlujo).
 * Cada accion la puede hacer un solo rol, y solo desde una etapa: Almacen no
 * puede aprobar su propio despacho, ni Seguridad saltarse el armado.
 *
 * El cambio de etapa se escribe con `WHERE etapa = <la esperada>`. Si dos
 * personas pulsan a la vez (dos almacenistas en dos telefonos), la segunda no
 * pisa a la primera: recibe 409 y su pantalla se refresca con lo que ya paso.
 * Sin esto, con todo en tiempo real, un doble toque avanzaria dos etapas.
 */

const MAX = { nombre: 200, motivo: 500, comentario: 500, observacion: 300 };

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Cantidad contada: null = "sin contar", que no es cero. */
function cantidad(v: unknown): number | null | "invalida" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalida";
}

function conflicto() {
  return NextResponse.json(
    { error: "Este egreso ya cambio de etapa. Se actualizo la pantalla." },
    { status: 409 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const accion = body?.accion;
    if (!esAccion(accion)) {
      return NextResponse.json({ error: "accion invalida" }, { status: 400 });
    }

    const rolSesion = String(auth.payload?.role || "");
    if (!puedeHacer(accion, rolSesion)) {
      return NextResponse.json(
        { error: "Este paso no le corresponde a tu rol" },
        { status: 403 },
      );
    }

    const datos = await cargarMovimiento(id);
    // 404 y no 403 para otra sucursal: adivinar un id no debe ni confirmar
    // que existe. Mismo criterio que el resto del modulo.
    if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const mov = datos.movimiento;
    if (mov.tipo !== "egreso" || !mov.etapa) {
      return NextResponse.json(
        { error: "Este registro no sigue el flujo por etapas" },
        { status: 409 },
      );
    }

    const desde: Etapa = ETAPA_DE_ACCION[accion];
    if (mov.etapa !== desde) return conflicto();

    // Quien firma cada paso sale de la sesion, no del body: el nombre que
    // queda registrado tiene que ser el de quien de verdad pulso el boton.
    const quien = String(auth.payload?.name || auth.payload?.email || rolSesion).slice(
      0,
      MAX.nombre,
    );

    const resultado = await ejecutar(accion, id, mov, datos.items, body, quien, cids);
    if (resultado instanceof NextResponse) return resultado;

    const actualizado = await cargarMovimiento(id);
    const m = actualizado!.movimiento;

    if (resultado.avanzo) {
      // Aviso en vivo a la sucursal: Seguridad se entera de que tiene algo por
      // verificar, y Almacen del resultado del porton, sin recargar.
      emitirMercancia(
        {
          accion: "etapa",
          id,
          tipo: "egreso",
          etapa: m.etapa,
          estado: m.estado,
          documento: m.odoo_picking_name,
          aprobado: m.aprobado === null ? undefined : Number(m.aprobado) === 1,
          despachado: m.despachado === null ? undefined : Number(m.despachado) === 1,
        },
        Number(m.cids) || null,
      );
    }

    return NextResponse.json({
      success: true,
      avanzo: resultado.avanzo,
      ...(resultado.extra || {}),
      ...actualizado,
    });
  } catch (error: any) {
    console.error("Error moviendo egreso de etapa:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

type Resultado = { avanzo: boolean; extra?: Record<string, unknown> };

/**
 * Cambia la etapa solo si sigue siendo la esperada. Devuelve false si otra
 * persona ya la movio (ver el comentario de arriba).
 */
async function avanzar(
  id: number,
  desde: Etapa,
  hacia: Etapa,
  set: string,
  valores: unknown[],
): Promise<boolean> {
  const res = await query(
    `UPDATE seguridad_mercancia SET etapa = ?${set ? `, ${set}` : ""}
      WHERE id = ? AND etapa = ?`,
    [hacia, ...valores, id, desde],
  );
  return Number((res.rows as any)?.affectedRows || 0) === 1;
}

async function ejecutar(
  accion: Accion,
  id: number,
  mov: any,
  items: any[],
  body: any,
  quien: string,
  cids: number | null,
): Promise<Resultado | NextResponse> {
  switch (accion) {
    // ── Almacen ──────────────────────────────────────────────────────────
    case "iniciar_armado": {
      const ok = await avanzar(id, "por_armar", "armando", "armado_inicio_at = NOW()", []);
      return ok ? { avanzo: true } : conflicto();
    }

    case "terminar_armado": {
      // "Culmina el proceso de armado — queda en area pre-despacho".
      const ok = await avanzar(id, "armando", "pre_despacho", "armado_fin_at = NOW()", []);
      return ok ? { avanzo: true } : conflicto();
    }

    case "verificar_armado": {
      const porId = new Map<number, any>(items.map((i) => [Number(i.id), i]));
      const conteos: Array<{ item: any; valor: number | null }> = [];
      for (const c of Array.isArray(body?.items) ? body.items : []) {
        const item = porId.get(Number(c?.id));
        if (!item) continue;
        const valor = cantidad(c?.cantidad_armado);
        if (valor === "invalida") {
          return NextResponse.json(
            { error: `Cantidad invalida en "${item.producto}"` },
            { status: 400 },
          );
        }
        conteos.push({ item, valor });
      }

      // El conteo se guarda aunque no cuadre: si Almacen conto 9 de 10, eso
      // queda escrito y el siguiente intento parte de ahi, no de cero.
      for (const { item, valor } of conteos) {
        await query(
          `UPDATE seguridad_mercancia_items SET cantidad_armado = ?
            WHERE id = ? AND mercancia_id = ?`,
          [valor, item.id, id],
        );
        item.cantidad_armado = valor;
      }

      const evaluacion = evaluarArmado(
        items.map((i) => ({
          cantidad_cargada: Number(i.cantidad_cargada),
          cantidad_armado:
            i.cantidad_armado === null || i.cantidad_armado === undefined
              ? null
              : Number(i.cantidad_armado),
        })),
      );

      // No cuadra: se queda en pre-despacho hasta que se corrija y se vuelva a
      // contar. Es la regla que pediste: no pasa a despacho con diferencias.
      if (!evaluacion.completo) {
        return { avanzo: false, extra: { armado: evaluacion } };
      }

      // Un tipo que ya no se ofrece (ej. "ruta" de antes) sigue como puerta:
      // directo a despacho, sin empaquetado.
      const tipo = esTipoEntrega(mov.tipo_entrega) ? mov.tipo_entrega : "puerta";
      const ok = await avanzar(
        id,
        "pre_despacho",
        etapaTrasArmado(tipo),
        "armado_verificado_por = ?, armado_verificado_at = NOW()",
        [quien],
      );
      return ok ? { avanzo: true, extra: { armado: evaluacion } } : conflicto();
    }

    case "empaquetar": {
      const ok = await avanzar(
        id,
        "por_empaquetar",
        "por_asignar_despacho",
        "empaquetado_por = ?, empaquetado_at = NOW()",
        [quien],
      );
      return ok ? { avanzo: true } : conflicto();
    }

    case "asignar_despacho": {
      const despacho = texto(body?.almacenista_despacho, MAX.nombre);
      if (!despacho) {
        return NextResponse.json(
          { error: "Falta el almacenista de despacho" },
          { status: 400 },
        );
      }
      // Tiene que ser alguien del catalogo de la sucursal: es a quien se va a
      // calificar, y un nombre escrito a mano no se puede sumar a su historial.
      const enCatalogo = await query(
        `SELECT id FROM seguridad_catalogo_almacenistas
          WHERE nombre = ? ${cids !== null ? "AND cids = ?" : ""} LIMIT 1`,
        cids !== null ? [despacho, cids] : [despacho],
      );
      if (enCatalogo.rows.length === 0) {
        return NextResponse.json(
          { error: "Ese almacenista no esta en el personal de Almacen" },
          { status: 400 },
        );
      }

      // No pasa a Seguridad un picking serializable sin sus seriales (issue
      // #299): es contra lo que se pistolea en C4. Se releen de Odoo aca,
      // aunque Almacen ya haya pulsado "Actualizar", porque es la ultima vez
      // que se pueden leer: en Seguridad la lista queda fija.
      if (mov.odoo_picking_id) {
        try {
          const s = await sincronizarSeriales(id, Number(mov.odoo_picking_id));
          if (!s.completo) {
            const detalle = s.faltantes
              .map((f) => `${f.producto} (${f.cargados} de ${f.esperados})`)
              .join("; ");
            return NextResponse.json(
              {
                error: `Faltan seriales en Odoo: ${detalle || "sin leer"}. Cargalos en el picking y vuelve a intentar.`,
                seriales_estado: s,
              },
              { status: 400 },
            );
          }
        } catch (e: any) {
          // Sin la migracion no hay donde guardarlos: se sigue como antes, para
          // no frenar el despacho por una tabla. Si es Odoo, no se sigue.
          if (!faltaMigracion(e)) {
            console.error(`[egreso ${id}] no se pudieron leer los seriales:`, e?.message || e);
            return NextResponse.json(
              { error: "No se pudieron leer los seriales de Odoo. Intenta de nuevo." },
              { status: 502 },
            );
          }
          console.warn("[egreso] falta correr sql/egreso_seriales.sql: se asigna sin seriales");
        }
      }

      // El responsable del registro pasa a ser quien despacha (es a quien
      // Seguridad califica); el del armado queda aparte y en la lista.
      // Sin chofer ni placa: hoy no se trabaja con rutas (ver TIPOS_ENTREGA).
      const equipo = Array.from(
        new Set([mov.almacenista_armado, despacho].filter(Boolean)),
      );
      const ok = await avanzar(
        id,
        "por_asignar_despacho",
        "por_verificar",
        `almacenista_despacho = ?, almacenista_nombre = ?, almacenistas_json = ?,
         despacho_asignado_at = NOW()`,
        [despacho, despacho, JSON.stringify(equipo)],
      );
      return ok ? { avanzo: true } : conflicto();
    }

    // ── Seguridad ────────────────────────────────────────────────────────
    case "verificar_seguridad": {
      const porId = new Map<number, any>(items.map((i) => [Number(i.id), i]));
      const cambios: Array<{
        item: any;
        valor: number | null;
        noSalio: boolean;
        observacion: string | null;
      }> = [];
      for (const c of Array.isArray(body?.items) ? body.items : []) {
        const item = porId.get(Number(c?.id));
        if (!item) continue;
        const valor = cantidad(c?.cantidad_verificada);
        if (valor === "invalida") {
          return NextResponse.json(
            { error: `Cantidad invalida en "${item.producto}"` },
            { status: 400 },
          );
        }
        const noSalio = c?.no_salio === true;
        const observacion = texto(c?.observacion, MAX.observacion);
        if (noSalio && !observacion) {
          return NextResponse.json(
            { error: `El motivo es obligatorio para "${item.producto}" (no salio)` },
            { status: 400 },
          );
        }
        cambios.push({ item, valor, noSalio, observacion });
      }

      // Se calcula antes de escribir nada: la decision de abajo depende de
      // si el conteo cuadra, y un 400 no debe dejar renglones a medio guardar.
      const proyectados = items.map((i) => {
        const c = cambios.find((x) => x.item.id === i.id);
        return {
          cantidad_cargada: Number(i.cantidad_cargada),
          cantidad_verificada: c
            ? c.valor
            : i.cantidad_verificada === null || i.cantidad_verificada === undefined
              ? null
              : Number(i.cantidad_verificada),
          no_salio: c ? c.noSalio : Number(i.no_salio) === 1,
        };
      });
      const { estado, diferencias } = evaluarDescuadre(proyectados);

      const aprobado = body?.aprobado === true;
      // Aprobar exige que todo cuadre: con diferencias, o sin terminar de
      // contar, lo que corresponde es "No aprueba" + decidir + motivo.
      if (aprobado && estado !== "conforme") {
        return NextResponse.json(
          {
            error:
              estado === "descuadre"
                ? "Hay diferencias: no se puede aprobar. Marca No aprueba y decide."
                : "Faltan renglones por contar para poder aprobar.",
          },
          { status: 400 },
        );
      }

      let despachado = true;
      let motivo: string | null = null;
      if (!aprobado) {
        if (typeof body?.despachar !== "boolean") {
          return NextResponse.json(
            { error: "Decide si se despacha o no" },
            { status: 400 },
          );
        }
        motivo = texto(body?.motivo, MAX.motivo);
        if (!motivo) {
          return NextResponse.json(
            { error: "El motivo de no aprobar es obligatorio" },
            { status: 400 },
          );
        }
        despachado = body.despachar;
      }

      for (const { item, valor, noSalio, observacion } of cambios) {
        await query(
          `UPDATE seguridad_mercancia_items
              SET cantidad_verificada = ?, observacion = ?, no_salio = ?
            WHERE id = ? AND mercancia_id = ?`,
          [valor, noSalio ? observacion : null, noSalio ? 1 : 0, item.id, id],
        );
      }

      // "Aprueba -> el almacenista despacha": aprobado queda despachado de una
      // vez, sin otro paso de Almacen (asi lo decidiste).
      const ok = await avanzar(
        id,
        "por_verificar",
        "por_calificar",
        `estado = ?, verificado_por = ?, verificado_at = CURRENT_TIMESTAMP,
         aprobado = ?, despachado = ?, motivo_no_aprobado = ?`,
        [estado, quien, aprobado ? 1 : 0, despachado ? 1 : 0, motivo],
      );
      if (!ok) return conflicto();

      if (!aprobado) {
        console.warn(
          `[egreso ${id}] NO APROBADO por ${quien} (${diferencias} diferencia(s)). ` +
            `${despachado ? "Se despacha igual" : "NO se despacha"}. Motivo: ${motivo}`,
        );
      }
      return { avanzo: true };
    }

    case "calificar": {
      // Dos notas (issue #302): el picking al que armo y el despacho al que
      // despacho. Si es la misma persona, igual son dos.
      const notas: Array<{ aspecto: Aspecto; almacenista: string; estrellas: number; comentario: string | null }> = [];
      const quienes: Record<Aspecto, string | null> = {
        picking: mov.almacenista_armado || mov.almacenista_nombre || null,
        despacho: mov.almacenista_despacho || mov.almacenista_nombre || null,
      };
      for (const aspecto of ASPECTOS) {
        const estrellas = parseInt(String(body?.[aspecto]?.calificacion ?? ""), 10);
        if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
          return NextResponse.json(
            { error: `La calificacion del ${aspecto} va de 1 a 5 estrellas` },
            { status: 400 },
          );
        }
        const almacenista = quienes[aspecto];
        if (!almacenista) {
          return NextResponse.json(
            { error: `Este egreso no tiene almacenista de ${aspecto}` },
            { status: 409 },
          );
        }
        notas.push({
          aspecto,
          almacenista,
          estrellas,
          comentario: texto(body?.[aspecto]?.comentario, MAX.comentario),
        });
      }

      // Con novedades, un 4 o un 5 al picking no se da a ciegas.
      const hayNovedades =
        novedadesVerificacion(items).length > 0 ||
        (mov.aprobado !== null && Number(mov.aprobado) === 0);
      const picking = notas.find((n) => n.aspecto === "picking")!;
      if (pideComentarioPicking(picking.estrellas, hayNovedades) && !picking.comentario) {
        return NextResponse.json(
          { error: "Hubo novedades: explica la nota del picking en el comentario" },
          { status: 400 },
        );
      }

      // Cerrar y guardar las notas en una transaccion: con la guarda de
      // etapa, un doble toque no deja dos juegos de notas, y si el INSERT
      // falla el egreso no queda cerrado sin calificar.
      const conAspecto = await hayColumnaAspecto();
      const conn = await getConnection();
      try {
        await conn.beginTransaction();
        const [cierre]: any = await conn.execute(
          `UPDATE seguridad_mercancia SET etapa = 'cerrado', cerrado_at = NOW()
            WHERE id = ? AND etapa = 'por_calificar'`,
          [id],
        );
        if (Number(cierre?.affectedRows || 0) !== 1) {
          await conn.rollback();
          return conflicto();
        }
        // Sin la migracion (sql/egreso_calificaciones.sql) no hay donde
        // distinguirlas: se guarda solo la del despacho, que es lo que se
        // guardaba antes, en vez de dos notas que despues no se separan.
        const aGuardar = conAspecto ? notas : notas.filter((n) => n.aspecto === "despacho");
        const valores: Array<string | number | null> = [];
        const marcadores = aGuardar
          .map((n) => {
            valores.push(n.almacenista, n.estrellas, id, n.comentario, quien, Number(mov.cids) || null);
            if (conAspecto) valores.push(n.aspecto);
            return conAspecto ? "(?, ?, 'mercancia', ?, ?, ?, ?, ?)" : "(?, ?, 'mercancia', ?, ?, ?, ?)";
          })
          .join(", ");
        await conn.execute(
          `INSERT INTO seguridad_calificaciones
            (almacenista_nombre, calificacion, relacionado_a, relacionado_id,
             comentario, calificado_por, cids${conAspecto ? ", aspecto" : ""})
           VALUES ${marcadores}`,
          valores,
        );
        await conn.commit();
        if (!conAspecto) {
          console.warn("[egreso] falta correr sql/egreso_calificaciones.sql: se guardo solo la nota del despacho");
        }
      } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
      } finally {
        conn.release();
      }
      return { avanzo: true };
    }
  }
}
