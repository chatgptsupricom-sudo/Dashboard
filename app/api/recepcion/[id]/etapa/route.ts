import { query } from "@/lib/db";
import {
  alinearPrecintos,
  compararPrecintos,
  evaluarConteo,
  limpiarDanos,
  limpiarPrecintos,
} from "@/lib/recepcion/flujo";
import { cargarEnOdoo, ocPendiente, productoPorCodigo } from "@/lib/recepcion/odoo";
import { contenedorDeConteo, ponerCantidad, recalcularTotales } from "@/lib/recepcion/conteo";
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
 * POST /api/recepcion/[id]/etapa  { accion, ...datos }   — solo Almacen
 *
 * Por contenedor (pueden llegar en dias distintos):
 *  registrar_llegada  { contenedor_id, precintos_recibidos: string[] }
 *                     contenedor por_llegar -> descargando (fotos llegada + precintos;
 *                     puede tener varios precintos, coincide si son los mismos)
 *                     y el packing list pasa a descargando con el primero
 *  cerrar_contenedor  { contenedor_id, notas_cierre }
 *                     contenedor descargando -> cerrado (foto de como quedo)
 *
 * Del packing list entero:
 *  guardar_conteo     guarda el avance, no avanza. Cada renglon trae solo lo
 *                     que cambio; la cantidad va con el `contenedor_id` que
 *                     esta contando ese telefono (lib/recepcion/conteo.ts) y
 *                     el total del renglon es la suma de los contenedores.
 *  cerrar             descargando -> cerrado: todos los contenedores cerrados
 *                     y el conteo completo. Al cerrar se carga lo contado en
 *                     Odoo (recepcion de la OC + traslado a Existencias,
 *                     lib/recepcion/odoo.ts); si Odoo falla, la recepcion
 *                     queda cerrada igual y con el error a la vista.
 *
 * Despues de cerrar (Almacen o Compras):
 *  cargar_odoo        { purchase_order_id?, saltar_frenos?, validar_oc? } reintenta la
 *                     carga en Odoo; con la OC, para una recepcion que no
 *                     tenia (o tenia otra y no se llego a cargar nada).
 *                     `saltar_frenos` solo lo usa el SuperAdmin, despues de
 *                     revisar en Odoo que lo recibido a mano no es esta
 *                     misma mercancia.
 *  corregir_danos     { items: [{ id, danos, golpeado_nota }] } solo
 *                     el SuperAdmin: marca las cajas en mal estado que Almacen
 *                     no anoto antes de cerrar. No toca Odoo ni cantidades.
 *  agregar_producto   { codigo, cantidad, seriales? } solo el SuperAdmin:
 *                     renglon nuevo con un producto que no se conto, y se
 *                     carga en Odoo (solo lo nuevo).
 *
 * Cada avance se escribe con `WHERE etapa = <la esperada>`: si dos personas
 * pulsan a la vez, la segunda recibe 409 en vez de repetir el paso.
 */

const MAX = { motivo: 300, nota: 300, notas: 5000 };

function texto(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function conflicto() {
  return NextResponse.json(
    { error: "Esta recepcion ya cambio de etapa. Se actualizo la pantalla." },
    { status: 409 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;

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
    const rec = datos.recepcion;

    // Reintentar la carga en Odoo de una recepcion ya cerrada: Almacen o Compras.
    if (body?.accion === "cargar_odoo") {
      if (rec.etapa !== "cerrado") {
        return NextResponse.json({ error: "Se carga en Odoo al cerrar la recepcion" }, { status: 409 });
      }
      if (rec.odoo_estado === "cargado") return conflicto();
      const poId = Number(body?.purchase_order_id);
      if (Number.isInteger(poId) && poId > 0 && poId !== Number(rec.odoo_purchase_order_id)) {
        // Cambiar la OC solo si no se llego a cargar nada en la otra. Y si la
        // carga esta frenada (puede que ya se haya recibido a mano), solo el
        // SuperAdmin: cambiar de OC no puede servir para cargarla dos veces.
        const anterior = (() => {
          try {
            return JSON.parse(rec.odoo_resultado || "{}");
          } catch {
            return {};
          }
        })();
        if ((anterior.recepciones?.length || 0) > 0 || anterior.intento || (anterior.acumulado?.lineas?.length || 0) > 0) {
          return NextResponse.json(
            { error: "Ya se cargo una parte en la OC anterior: no se puede cambiar" },
            { status: 409 },
          );
        }
        if (anterior.bloqueo && sesion!.rol !== "superadmin") {
          return NextResponse.json(
            { error: "La carga esta frenada: solo el SuperAdmin puede cambiar la OC" },
            { status: 403 },
          );
        }
        const oc = await ocPendiente(Number(rec.cids), poId);
        if (!oc) {
          return NextResponse.json({ error: "Esa OC no es de la sucursal o ya no espera mercancia" }, { status: 400 });
        }
        // Sin foto de lo que la OC ya tenia recibido: cualquier recepcion
        // hecha a mano frena la carga hasta que el SuperAdmin la revise.
        await query(
          "UPDATE recepcion_packing SET odoo_purchase_order_id = ?, odoo_oc_nombre = ?, odoo_recepciones_previas = NULL WHERE id = ?",
          [oc.id, oc.nombre, id],
        );
      }
      await cargarEnOdoo(id, sesion!.nombre, {
        saltarFrenos: body?.saltar_frenos === true && sesion!.rol === "superadmin",
        // Una recepcion por OC: "ya llego todo", se valida aunque falte algo
        // (lo que falte queda pendiente en Odoo).
        validarOc: body?.validar_oc === true,
      });
      emitirRecepcion({ accion: "editado", id, cids: Number(rec.cids), referencia: rec.referencia });
      return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
    }

    // SuperAdmin: corregir el estado de las cajas de una recepcion cerrada
    // (Almacen cerro sin marcar las que llegaron en mal estado). Solo danos,
    // su nota y su foto: no tocan Odoo (las cajas en mal estado entran igual
    // a Existencias). Las cantidades no se corrigen: ya estan cargadas.
    if (body?.accion === "corregir_danos") {
      if (sesion!.rol !== "superadmin") {
        return NextResponse.json({ error: "Solo el SuperAdmin corrige una recepcion cerrada" }, { status: 403 });
      }
      if (rec.etapa !== "cerrado") return conflicto();

      const porId = new Map<number, any>(datos.items.map((i) => [Number(i.id), i]));
      const cambios: Array<{ item: any; danos: ReturnType<typeof limpiarDanos>; nota: string | null }> = [];
      for (const c of Array.isArray(body?.items) ? body.items : []) {
        const item = porId.get(Number(c?.id));
        if (!item) continue;
        const danos = limpiarDanos(c.danos);
        const nota = danos.length ? texto(c.golpeado_nota, MAX.nota) : null;
        if (JSON.stringify(danos) === JSON.stringify(item.danos || []) && nota === (item.golpeado_nota || null)) continue;
        cambios.push({ item, danos, nota });
        Object.assign(item, { danos, golpeado: danos.length ? 1 : 0, golpeado_nota: nota });
      }
      if (!cambios.length) return NextResponse.json({ error: "No cambio nada" }, { status: 400 });

      // Lo mismo que se pide al cerrar: foto, motivo y cuantas unidades (solo
      // en lo que se corrige; `todo` es para recalcular el resultado).
      const fotosGolpe = new Set(
        datos.archivos.filter((a) => a.tipo === "foto_golpe" && a.item_id).map((a) => Number(a.item_id)),
      );
      const evaluar = (lista: any[]) => evaluarConteo(
        lista.map((i) => ({
          id: Number(i.id),
          cantidad_esperada: Number(i.cantidad_esperada),
          cantidad_recibida: i.cantidad_recibida === null ? null : Number(i.cantidad_recibida),
          motivo_diferencia: i.motivo_diferencia,
          golpeado: Number(i.golpeado) === 1,
          danos: i.danos || [],
          golpeado_nota: i.golpeado_nota,
        })),
        fotosGolpe,
      );
      const ev = evaluar(cambios.map((c) => c.item));
      const todo = evaluar(datos.items);
      const faltan: string[] = [];
      if (ev.golpesSinFoto) faltan.push(`la foto de ${ev.golpesSinFoto} caja(s) en mal estado`);
      if (ev.golpesSinMotivo) faltan.push(`el motivo de ${ev.golpesSinMotivo} caja(s) en mal estado`);
      if (ev.danosSinCantidad) faltan.push(`cuantas unidades en ${ev.danosSinCantidad} dano(s) marcado(s)`);
      if (ev.danosDeMas) faltan.push(`corregir ${ev.danosDeMas} dano(s) con mas unidades que las recibidas`);
      if (faltan.length) {
        return NextResponse.json({ error: `Falta ${faltan.join(", ")}` }, { status: 400 });
      }

      for (const { item, danos, nota } of cambios) {
        await query(
          "UPDATE recepcion_packing_items SET golpeado = ?, golpeado_tipos = ?, golpeado_nota = ? WHERE id = ? AND recepcion_id = ?",
          [danos.length ? 1 : 0, danos.length ? JSON.stringify(danos) : null, nota, item.id, id],
        );
      }
      // Se recalcula el resultado. La correccion no deja rastro aparte: queda
      // como si se hubiera anotado al cerrar.
      const novedades =
        todo.faltantes > 0 || todo.sobrantes > 0 || todo.golpeados > 0 || Number(rec.precinto_coincide) === 0;
      await query("UPDATE recepcion_packing SET resultado = ? WHERE id = ? AND etapa = 'cerrado'", [
        novedades ? "con_novedades" : "conforme",
        id,
      ]);
      emitirRecepcion({ accion: "editado", id, cids: Number(rec.cids), referencia: rec.referencia });
      return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
    }

    // SuperAdmin: agregar a una recepcion cerrada un producto que Almacen no
    // conto. Entra como renglon nuevo (lo esperado = lo recibido) y se carga
    // en Odoo solo eso: cargarEnOdoo carga la diferencia con lo ya cargado.
    if (body?.accion === "agregar_producto") {
      if (sesion!.rol !== "superadmin") {
        return NextResponse.json({ error: "Solo el SuperAdmin agrega productos a una recepcion cerrada" }, { status: 403 });
      }
      if (rec.etapa !== "cerrado") return conflicto();
      const codigo = texto(body?.codigo, 100);
      if (!codigo) return NextResponse.json({ error: "Falta el codigo del producto" }, { status: 400 });
      const producto = await productoPorCodigo(codigo);
      if (!producto) {
        return NextResponse.json({ error: `No hay un producto en Odoo con el codigo ${codigo}` }, { status: 400 });
      }
      const seriales = [
        ...new Set(
          (Array.isArray(body?.seriales) ? body.seriales : [])
            .map((s: unknown) => String(s ?? "").trim().slice(0, 100))
            .filter(Boolean),
        ),
      ] as string[];
      const cantidad = producto.conSerial ? seriales.length : Number(body?.cantidad);
      if (producto.conSerial && cantidad === 0) {
        return NextResponse.json({ error: `${producto.codigo} lleva serial: escribe los seriales` }, { status: 400 });
      }
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return NextResponse.json({ error: "Cantidad invalida" }, { status: 400 });
      }

      const ins = await query(
        `INSERT INTO recepcion_packing_items (recepcion_id, codigo, producto, cantidad_esperada, odoo_product_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, producto.codigo, producto.nombre.slice(0, 300), cantidad, producto.id],
      );
      const itemId = Number((ins.rows as any)?.insertId);
      try {
        for (const s of producto.conSerial ? seriales : []) {
          await query(
            `INSERT INTO recepcion_packing_seriales (recepcion_id, item_id, serial, escaneado_por, contenedor_id)
             VALUES (?, ?, ?, ?, 0)`,
            [id, itemId, s, sesion!.nombre],
          );
        }
      } catch (e: any) {
        // Serial ya pistoleado en esta recepcion: no queda el renglon a medias.
        await query("DELETE FROM recepcion_packing_seriales WHERE item_id = ?", [itemId]);
        await query("DELETE FROM recepcion_packing_items WHERE id = ?", [itemId]);
        if (/Duplicate entry/i.test(e?.message || "")) {
          return NextResponse.json({ error: "Uno de esos seriales ya esta en esta recepcion" }, { status: 409 });
        }
        throw e;
      }
      await ponerCantidad(id, itemId, 0, cantidad, sesion!.nombre);

      // Ya cargada en Odoo: se vuelve a cargar para que entre lo nuevo.
      if (rec.odoo_estado === "cargado") {
        await query("UPDATE recepcion_packing SET odoo_estado = NULL WHERE id = ? AND odoo_estado = 'cargado'", [id]);
      }
      await cargarEnOdoo(id, sesion!.nombre);
      emitirRecepcion({ accion: "editado", id, cids: Number(rec.cids), referencia: rec.referencia });
      return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
    }

    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "La recepcion la hace Almacen" }, { status: 403 });
    }
    if (rec.etapa === "cerrado") return conflicto();

    // Contenedor sobre el que se actua (acciones de contenedor).
    const contenedor =
      body?.contenedor_id !== undefined
        ? datos.contenedores.find((c) => Number(c.id) === Number(body.contenedor_id))
        : null;
    const fotosDe = (tipo: string, contenedorId: number) =>
      datos.archivos.some((a) => a.tipo === tipo && Number(a.contenedor_id) === contenedorId);

    switch (body?.accion) {
      case "registrar_llegada": {
        if (!contenedor) return NextResponse.json({ error: "Contenedor invalido" }, { status: 400 });
        if (contenedor.etapa !== "por_llegar") return conflicto();
        // Un contenedor puede tener varios precintos: Almacen anota todos los
        // que ve. Se acepta tambien `precinto_recibido` suelto (lo de antes).
        const precintos = alinearPrecintos(
          limpiarPrecintos(
            Array.isArray(body?.precintos_recibidos) ? body.precintos_recibidos : body?.precinto_recibido,
          ),
          contenedor.precintos_esperados,
        );
        const faltan: string[] = [];
        if (!fotosDe("foto_llegada", contenedor.id)) faltan.push("la foto del contenedor al llegar");
        if (!fotosDe("foto_precinto", contenedor.id)) faltan.push("la foto de los precintos");
        if (precintos.length === 0) faltan.push("el numero de al menos un precinto");
        if (faltan.length) {
          return NextResponse.json({ error: `Falta ${faltan.join(", ")}` }, { status: 400 });
        }
        // Coincide solo si son exactamente los mismos; sin esperados, NULL.
        const cmp = compararPrecintos(contenedor.precintos_esperados, precintos);
        const coincide = cmp.coincide === null ? null : cmp.coincide ? 1 : 0;

        const res = await query(
          `UPDATE recepcion_packing_contenedores
              SET etapa = 'descargando', llegada_at = NOW(), llegada_por = ?,
                  precinto_recibido = ?, precintos_recibidos = ?, precinto_coincide = ?
            WHERE id = ? AND recepcion_id = ? AND etapa = 'por_llegar'`,
          [sesion!.nombre, precintos[0], JSON.stringify(precintos), coincide, contenedor.id, id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();

        // El packing list pasa a "descargando" con el primer contenedor que
        // llega; con los siguientes esto no cambia nada.
        await query(
          `UPDATE recepcion_packing
              SET etapa = 'descargando', llegada_at = COALESCE(llegada_at, NOW()),
                  llegada_por = COALESCE(llegada_por, ?)
            WHERE id = ? AND etapa = 'por_llegar'`,
          [sesion!.nombre, id],
        );

        if (coincide === 0) {
          console.warn(
            `[recepcion ${id}] PRECINTOS DISTINTOS en ${contenedor.numero}: ` +
              `faltan [${cmp.faltan.join(", ")}], no esperados [${cmp.sobran.join(", ")}]`,
          );
        }
        emitirRecepcion({
          accion: "llegada",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          proveedor: rec.proveedor,
          contenedor: contenedor.numero,
          llegados: datos.contenedores.filter((c) => c.etapa !== "por_llegar").length + 1,
          total: datos.contenedores.length,
        });
        break;
      }

      case "cerrar_contenedor": {
        if (!contenedor) return NextResponse.json({ error: "Contenedor invalido" }, { status: 400 });
        if (contenedor.etapa !== "descargando") return conflicto();
        if (!fotosDe("foto_cierre", contenedor.id)) {
          return NextResponse.json(
            { error: "Falta la foto de como quedo el contenedor" },
            { status: 400 },
          );
        }
        const res = await query(
          `UPDATE recepcion_packing_contenedores
              SET etapa = 'cerrado', cerrado_at = NOW(), cerrado_por = ?, notas_cierre = ?
            WHERE id = ? AND recepcion_id = ? AND etapa = 'descargando'`,
          [sesion!.nombre, texto(body?.notas_cierre, MAX.notas), contenedor.id, id],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();
        emitirRecepcion({
          accion: "contenedor_cerrado",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          contenedor: contenedor.numero,
        });
        break;
      }

      case "guardar_conteo":
      case "cerrar": {
        if (rec.etapa !== "descargando") return conflicto();

        // Se guarda el conteo (tambien al cerrar: el cierre manda el ultimo).
        // Solo los campos que vienen: varios telefonos cuentan la misma
        // recepcion a la vez y cada uno manda lo que cambio el; un campo que
        // no viene no se toca (antes se mandaba todo y se pisaba lo de otro).
        const porId = new Map<number, any>(datos.items.map((i) => [Number(i.id), i]));
        let cambioAlgo = false;
        for (const c of Array.isArray(body?.items) ? body.items : []) {
          const item = porId.get(Number(c?.id));
          if (!item) continue;
          const tiene = (k: string) => c !== null && typeof c === "object" && Object.prototype.hasOwnProperty.call(c, k);
          const sets: string[] = [];
          const vals: unknown[] = [];
          const cambios: Record<string, unknown> = {};

          if (tiene("cantidad_recibida")) {
            // La cantidad es la del contenedor que cuenta ese telefono.
            const cont = contenedorDeConteo(datos.contenedores, c.contenedor_id);
            if ("error" in cont) return NextResponse.json({ error: cont.error }, { status: cont.status });
            // Un renglon con serial vale lo que se pistoleo en ese contenedor:
            // con seriales, lo escrito no cuenta. Sin ninguno solo se acepta
            // un 0 explicito (no llego ninguno).
            const serialesAca = (item.seriales as any[]).filter((s) => Number(s.contenedor_id) === cont.id).length;
            if (!(item.lleva_serial && serialesAca > 0)) {
              const escrito = c.cantidad_recibida;
              const bruto = item.lleva_serial
                ? escrito !== null && escrito !== undefined && escrito !== "" && Number(escrito) === 0
                  ? 0
                  : null
                : escrito;
              const cantidad = bruto === null || bruto === undefined || bruto === "" ? null : Number(bruto);
              if (cantidad !== null && (!Number.isFinite(cantidad) || cantidad < 0)) {
                return NextResponse.json(
                  { error: `Cantidad invalida en "${item.producto}"` },
                  { status: 400 },
                );
              }
              const r = await ponerCantidad(id, Number(item.id), cont.id, cantidad, sesion!.nombre);
              item.cantidad_recibida = r.total;
              cambioAlgo = true;
            }
          }

          if (tiene("motivo_diferencia")) {
            const motivo = texto(c.motivo_diferencia, MAX.motivo);
            sets.push("motivo_diferencia = ?");
            vals.push(motivo);
            cambios.motivo_diferencia = motivo;
          }

          if (tiene("danos") || tiene("golpeado_tipos") || tiene("golpeado")) {
            // En que estado llego la caja (danada, humeda y/o abierta) y
            // cuantas unidades de cada una: no siempre es todo el renglon. Se
            // aceptan tambien la lista de tipos sin cantidad y el `golpeado`
            // suelto de antes (= danada).
            const danos = limpiarDanos(
              Array.isArray(c.danos)
                ? c.danos
                : Array.isArray(c.golpeado_tipos)
                  ? c.golpeado_tipos
                  : c.golpeado === true
                    ? ["danada"]
                    : [],
            );
            const golpeado = danos.length > 0;
            const nota = golpeado ? texto(tiene("golpeado_nota") ? c.golpeado_nota : item.golpeado_nota, MAX.nota) : null;
            sets.push("golpeado = ?", "golpeado_tipos = ?", "golpeado_nota = ?");
            vals.push(golpeado ? 1 : 0, golpeado ? JSON.stringify(danos) : null, nota);
            Object.assign(cambios, {
              golpeado: golpeado ? 1 : 0,
              danos,
              golpeado_tipos: danos.map((d) => d.tipo),
              golpeado_nota: nota,
            });
          } else if (tiene("golpeado_nota")) {
            const nota = Number(item.golpeado) === 1 ? texto(c.golpeado_nota, MAX.nota) : null;
            sets.push("golpeado_nota = ?");
            vals.push(nota);
            cambios.golpeado_nota = nota;
          }

          if (!sets.length) continue;
          await query(
            `UPDATE recepcion_packing_items SET ${sets.join(", ")} WHERE id = ? AND recepcion_id = ?`,
            [...vals, item.id, id],
          );
          Object.assign(item, cambios);
          cambioAlgo = true;
        }
        // Los otros telefonos que cuentan este packing list lo ven.
        if (cambioAlgo) emitirRecepcion({ accion: "conteo", id, cids: Number(rec.cids) });

        if (body.accion === "guardar_conteo") break;

        // El total de cada renglon es la suma de sus contenedores: se
        // recalcula todo antes de evaluar el cierre, por si algo quedo a medias.
        await recalcularTotales(id);
        const totales = await query(
          "SELECT id, cantidad_recibida FROM recepcion_packing_items WHERE recepcion_id = ?",
          [id],
        );
        for (const t of totales.rows as any[]) {
          const item = porId.get(Number(t.id));
          if (item) item.cantidad_recibida = t.cantidad_recibida === null ? null : Number(t.cantidad_recibida);
        }

        const fotosGolpe = new Set(
          datos.archivos
            .filter((a) => a.tipo === "foto_golpe" && a.item_id)
            .map((a) => Number(a.item_id)),
        );
        const ev = evaluarConteo(
          datos.items.map((i) => ({
            id: Number(i.id),
            cantidad_esperada: Number(i.cantidad_esperada),
            cantidad_recibida: i.cantidad_recibida === null ? null : Number(i.cantidad_recibida),
            motivo_diferencia: i.motivo_diferencia,
            golpeado: Number(i.golpeado) === 1,
            danos: i.danos || [],
            golpeado_nota: i.golpeado_nota,
          })),
          fotosGolpe,
        );
        const abiertos = datos.contenedores.filter((c) => c.etapa !== "cerrado");
        const faltan: string[] = [];
        if (abiertos.length) {
          faltan.push(
            `terminar ${abiertos.length} contenedor(es): ${abiertos.map((c) => c.numero).join(", ")}`,
          );
        }
        if (ev.sinContar) faltan.push(`${ev.sinContar} renglon(es) sin contar`);
        if (ev.sinMotivo) faltan.push(`el motivo en ${ev.sinMotivo} renglon(es) con diferencia`);
        if (ev.golpesSinFoto) faltan.push(`la foto de ${ev.golpesSinFoto} caja(s) en mal estado`);
        if (ev.golpesSinMotivo) faltan.push(`el motivo de ${ev.golpesSinMotivo} caja(s) en mal estado`);
        if (ev.danosSinCantidad) {
          faltan.push(`cuantas unidades en ${ev.danosSinCantidad} dano(s) marcado(s) (danada, humeda o abierta)`);
        }
        if (ev.danosDeMas) {
          faltan.push(`corregir ${ev.danosDeMas} dano(s) con mas unidades que las recibidas`);
        }
        if (faltan.length) {
          return NextResponse.json(
            { error: `No se puede cerrar: falta ${faltan.join(", ")}`, evaluacion: ev },
            { status: 400 },
          );
        }

        const precintoDistinto = datos.contenedores.some((c) => Number(c.precinto_coincide) === 0);
        const novedades =
          ev.faltantes > 0 || ev.sobrantes > 0 || ev.golpeados > 0 || precintoDistinto;
        const resultado = novedades ? "con_novedades" : "conforme";
        const res = await query(
          `UPDATE recepcion_packing
              SET etapa = 'cerrado', cerrado_at = NOW(), cerrado_por = ?,
                  resultado = ?, notas_cierre = ?,
                  precinto_coincide = ?
            WHERE id = ? AND etapa = 'descargando'`,
          [
            sesion!.nombre,
            resultado,
            texto(body?.notas_cierre, MAX.notas),
            // Resumen en la cabecera: 0 si algun precinto no coincidio.
            precintoDistinto ? 0 : datos.contenedores.some((c) => c.precinto_coincide !== null) ? 1 : null,
            id,
          ],
        );
        if (Number((res.rows as any)?.affectedRows || 0) !== 1) return conflicto();
        emitirRecepcion({
          accion: "cerrado",
          id,
          cids: Number(rec.cids),
          referencia: rec.referencia,
          proveedor: rec.proveedor,
          resultado,
        });
        // Lo contado entra a Odoo de una vez. Si falla, queda el error en la
        // recepcion y se reintenta desde el detalle: el cierre ya quedo.
        try {
          await cargarEnOdoo(id, sesion!.nombre);
        } catch (e: any) {
          console.error(`[recepcion ${id}] no se pudo cargar en Odoo:`, e?.message);
        }
        break;
      }

      default:
        return NextResponse.json({ error: "accion invalida" }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await cargarRecepcion(id)) });
  } catch (e: any) {
    console.error("Error en etapa de recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
