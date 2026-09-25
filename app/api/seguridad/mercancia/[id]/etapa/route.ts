import { getConnection, query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  ASPECTOS,
  ETAPA_DE_ACCION,
  LOCAL_DESPACHO,
  esAccion,
  esTipoEntrega,
  etapaTrasArmado,
  esDecision,
  etapaTrasVerificacion,
  evaluarArmado,
  novedadesVerificacion,
  novedadesQueCuentan,
  pideComentarioPicking,
  rechazoDeSeguridad,
  puedeHacer,
  requiereVehiculo,
  type Accion,
  type Aspecto,
  type DecisionSeguridad,
  type Etapa,
} from "@/lib/seguridad/egresoFlujo";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { cargarMovimiento } from "@/lib/seguridad/mercancia";
import { hayColumnaAspecto } from "@/lib/seguridad/calificaciones";
import {
  guardarNovedadesCierre,
  hayColumnaDecision,
  hayColumnasVerificacion,
  novedadesDeEscaneo,
} from "@/lib/seguridad/novedades";
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

const MAX = { nombre: 200, placa: 50, motivo: 500, comentario: 500, observacion: 300 };

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

    const resultado = await ejecutar(accion, id, mov, datos.items, body, quien, cids, datos);
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
  datos: NonNullable<Awaited<ReturnType<typeof cargarMovimiento>>>,
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

      // Un tipo desconocido (o vacio, de antes) sigue como puerta: directo a
      // despacho, sin empaquetado. Los "ruta" viejos ya son ruta, y siguen el
      // mismo recorrido que tenian, asi que ninguno queda a medio camino.
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

      // Ruta: chofer y unidad obligatorios, y del catalogo de la sucursal, con
      // el mismo criterio que el almacenista. Seguridad tiene que saber en
      // que camion y con quien sale la mercancia.
      let chofer: string | null = null;
      let placa: string | null = null;
      if (requiereVehiculo(esTipoEntrega(mov.tipo_entrega) ? mov.tipo_entrega : null)) {
        chofer = texto(body?.chofer_nombre, MAX.nombre);
        placa = texto(body?.placa_vehiculo, MAX.placa)?.toUpperCase() ?? null;
        if (!chofer || !placa) {
          return NextResponse.json(
            { error: "En ruta hay que indicar el chofer y la unidad" },
            { status: 400 },
          );
        }
        const [choferCat, unidadCat] = await Promise.all([
          query(
            `SELECT id FROM seguridad_catalogo_choferes
              WHERE nombre = ? ${cids !== null ? "AND cids = ?" : ""} LIMIT 1`,
            cids !== null ? [chofer, cids] : [chofer],
          ),
          query(
            `SELECT id FROM seguridad_catalogo_unidades
              WHERE placa = ? ${cids !== null ? "AND cids = ?" : ""} LIMIT 1`,
            cids !== null ? [placa, cids] : [placa],
          ),
        ]);
        if (choferCat.rows.length === 0) {
          return NextResponse.json(
            { error: "Ese chofer no esta en el catalogo de choferes" },
            { status: 400 },
          );
        }
        if (unidadCat.rows.length === 0) {
          return NextResponse.json(
            { error: "Esa unidad no esta en el catalogo de unidades" },
            { status: 400 },
          );
        }
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
      const equipo = Array.from(
        new Set([mov.almacenista_armado, despacho].filter(Boolean)),
      );
      // Fuera de ruta se conserva lo que ya hubiera (egresos del flujo
      // anterior que se registraron con chofer y placa).
      const ok = await avanzar(
        id,
        "por_asignar_despacho",
        "por_verificar",
        `almacenista_despacho = ?, almacenista_nombre = ?, almacenistas_json = ?,
         chofer_nombre = COALESCE(?, chofer_nombre),
         placa_vehiculo = COALESCE(?, placa_vehiculo),
         despacho_asignado_at = NOW()`,
        [despacho, despacho, JSON.stringify(equipo), chofer, placa],
      );
      return ok ? { avanzo: true } : conflicto();
    }

    // ── Seguridad ────────────────────────────────────────────────────────
    case "verificar_seguridad": {
      // Lo pistoleado ya esta en la base (POST/PATCH .../escaneo, issue #301):
      // la verificacion se cierra con eso, no con lo que mande el navegador.
      // Del body solo sale la decision de Seguridad.
      const ronda = Number(mov.ronda_verificacion || 1);
      const faltaMotivo = items.find((i) => Number(i.no_salio) === 1 && !String(i.observacion || "").trim());
      if (faltaMotivo) {
        return NextResponse.json(
          { error: `El motivo es obligatorio para "${faltaMotivo.producto}" (no salio)` },
          { status: 400 },
        );
      }

      const novedades = novedadesVerificacion(items, {
        seriales: datos.seriales,
        sobrantes: novedadesDeEscaneo(datos.novedades, ronda),
      });

      const aprobado = body?.aprobado === true;
      // Aprobar exige cero novedades: con faltas o sobras, lo que corresponde
      // es decidir si se despacha igual, con motivo.
      if (aprobado && novedades.length > 0) {
        return NextResponse.json(
          {
            error: `Hay ${novedades.length} novedad(es): no se puede aprobar. Decide si se despacha igual o no.`,
            novedades,
          },
          { status: 400 },
        );
      }

      let decision: DecisionSeguridad = "despachar";
      let motivo: string | null = null;
      if (!aprobado) {
        // `despachar: true/false` es como lo mandaba la pantalla antes de la
        // opcion "cancelar": se sigue aceptando.
        const pedida = esDecision(body?.decision)
          ? body.decision
          : typeof body?.despachar === "boolean"
            ? body.despachar
              ? "despachar"
              : "devolver"
            : null;
        if (!pedida) {
          return NextResponse.json(
            { error: "Decide si se despacha, vuelve a Almacen o se cancela" },
            { status: 400 },
          );
        }
        motivo = texto(body?.motivo, MAX.motivo);
        if (!motivo) {
          return NextResponse.json(
            { error: "El motivo es obligatorio si no se aprueba" },
            { status: 400 },
          );
        }
        decision = pedida;
      }
      const despachar = decision === "despachar";
      const devolver = decision === "devolver";

      // Devolver: vuelve a Almacen a asignar despacho, en una ronda nueva. Lo
      // pistoleado se conserva; aprobado/despachado = 0 quedan como el
      // resultado de esta ronda hasta la siguiente verificacion.
      // Cancelar: no sale; pasa a calificar con despachado = 0 y se cierra
      // como cualquier otro (antes de #301 era el unico "no despachar").
      // Sin sql/egreso_verificacion_c4.sql se cierra igual, sin el local ni
      // la ronda: la verificacion no puede quedar trabada por una migracion.
      // Salvo devolverlo a Almacen: sin ronda no queda registrado que volvio,
      // y si la siguiente verificacion sale limpia, el picking se calificaria
      // como si nada (ver `calificar`). Aprobar, despachar igual o cancelar
      // (#316: no sale y se cierra, no necesita ronda) si se pueden.
      // `body.decision` y no una variable de #316 a proposito: asi vale antes
      // y despues de que entre, sin importar el orden de los merges.
      const conRonda = await hayColumnasVerificacion();
      if (!despachar && body?.decision !== "cancelar" && !conRonda) {
        return NextResponse.json(
          {
            error:
              "No se puede devolver el egreso a Almacen: falta correr sql/egreso_verificacion_c4.sql. Avisale a sistemas.",
          },
          { status: 400 },
        );
      }
      if (!conRonda) {
        console.warn("[egreso] falta correr sql/egreso_verificacion_c4.sql: se cierra sin ronda ni local");
      }
      // Cancelado: lo que falta es lo que nunca iba a salir, no una falla. Se
      // cierra solo con las novedades reales, y el estado sale de esas.
      const novedadesCierre = novedadesQueCuentan(novedades, !aprobado && decision === "cancelar");
      const estadoCierre = novedadesCierre.length > 0 ? "descuadre" : "conforme";

      // La decision queda guardada (sql/egreso_decision_seguridad.sql): es lo
      // que distingue un cancelado de un rechazo, que en el resto se ven
      // iguales (aprobado = 0, despachado = 0).
      const conDecision = await hayColumnaDecision();
      const ok = await avanzar(
        id,
        "por_verificar",
        etapaTrasVerificacion(decision),
        `estado = ?, verificado_por = ?, verificado_at = CURRENT_TIMESTAMP,
         aprobado = ?, despachado = ?, motivo_no_aprobado = ?${
           conRonda ? `, verificado_en = ?${devolver ? ", ronda_verificacion = ronda_verificacion + 1" : ""}` : ""
         }${conDecision ? ", decision_seguridad = ?" : ""}`,
        [estadoCierre, quien, aprobado ? 1 : 0, despachar ? 1 : 0, motivo, ...(conRonda ? [LOCAL_DESPACHO] : []), ...(conDecision ? [aprobado ? "aprobar" : decision] : [])],
      );
      if (!ok) return conflicto();

      // La etapa ya cambio: si guardar las novedades falla, no se devuelve
      // error (la decision quedo registrada), pero queda en el log.
      try {
        await guardarNovedadesCierre(id, ronda, novedadesCierre, quien);
      } catch (e: any) {
        console.error(
          `[egreso ${id}] no se guardaron ${novedades.length} novedad(es) del cierre` +
            (faltaMigracion(e) ? ": falta correr sql/egreso_verificacion_c4.sql" : ""),
          e?.message || e,
        );
      }

      if (!aprobado) {
        console.warn(
          `[egreso ${id}] NO APROBADO por ${quien} en ${LOCAL_DESPACHO} (ronda ${ronda}, ` +
            `${novedades.length} novedad(es)). ${
              despachar ? "Se despacha igual" : devolver ? "NO se despacha: vuelve a Almacen" : "NO se despacha: cancelado"
            }. ` +
            `Motivo: ${motivo}`,
        );
      }
      return { avanzo: true, extra: { novedades } };
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
      // Con los seriales y lo que sobro al pistolear en C4 (#301), de la
      // ronda que termino en despacho. Y las de rondas anteriores: si la
      // primera salio con faltas y Seguridad lo devolvio, la segunda puede
      // salir limpia, pero el picking igual fallo (Lino, #301).
      const ronda = Number(mov.ronda_verificacion || 1);
      const hayNovedades =
        novedadesQueCuentan(
          novedadesVerificacion(items, {
            seriales: datos.seriales,
            sobrantes: novedadesDeEscaneo(datos.novedades, ronda),
          }),
          mov.decision_seguridad === "cancelar",
        ).length > 0 ||
        ronda > 1 ||
        datos.novedades.some((n) => n.origen === "cierre") ||
        rechazoDeSeguridad(mov);
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
