/**
 * Egreso de mercancia por etapas: Almacen arma, verifica y asigna; Seguridad
 * verifica en el porton y califica.
 *
 * Sigue el proceso real del almacen (diagrama "Egreso Mercancia"):
 *
 *   por_armar ─► armando ─► pre_despacho ─► (Almacen verifica el armado)
 *        ├─ encomienda ─► por_empaquetar ─► por_asignar_despacho
 *        ├─ puerta ────────────────────────► por_asignar_despacho
 *        └─ ruta ──────────────────────────► por_asignar_despacho (+ chofer y unidad)
 *   por_asignar_despacho ─► por_verificar ─► (Seguridad pistolea en C4)
 *        ├─ sin novedades, aprueba ─► despachado ─► por_calificar
 *        └─ con novedades (o no aprueba) + motivo, Seguridad decide:
 *             ├─ despachar igual ─► por_calificar
 *             ├─ devolver ───────► vuelve a por_asignar_despacho (#301)
 *             └─ cancelar ───────► por_calificar, sin despachar (no sale)
 *   por_calificar ─► cerrado
 *
 * Sin dependencias de servidor: lo usan la API (para validar cada paso) y las
 * pantallas (para saber que mostrar y a quien le toca). Si la regla de quien
 * puede hacer que cambia, cambia aca y en ningun otro lado.
 */

export const ETAPAS = [
  "por_armar",
  "armando",
  "pre_despacho",
  "por_empaquetar",
  "por_asignar_despacho",
  "por_verificar",
  "por_calificar",
  "cerrado",
] as const;
export type Etapa = (typeof ETAPAS)[number];

// Como sale la mercancia, segun lo que decida el cliente: por ruta (camion
// propio, con chofer y unidad), retira el cliente ("puerta") o por encomienda.
// El orden es el de los botones del formulario.
export const TIPOS_ENTREGA = ["ruta", "puerta", "encomienda"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

export function esEtapa(v: unknown): v is Etapa {
  return typeof v === "string" && (ETAPAS as readonly string[]).includes(v);
}
export function esTipoEntrega(v: unknown): v is TipoEntrega {
  return typeof v === "string" && (TIPOS_ENTREGA as readonly string[]).includes(v);
}

export type RolFlujo = "almacen" | "seguridad";

/** A quien le toca mover el registro en cada etapa. `cerrado` no es de nadie. */
export const RESPONSABLE: Record<Etapa, RolFlujo | null> = {
  por_armar: "almacen",
  armando: "almacen",
  pre_despacho: "almacen",
  por_empaquetar: "almacen",
  por_asignar_despacho: "almacen",
  por_verificar: "seguridad",
  por_calificar: "seguridad",
  cerrado: null,
};

export const ACCIONES = [
  "iniciar_armado",
  "terminar_armado",
  "verificar_armado",
  "empaquetar",
  "asignar_despacho",
  "verificar_seguridad",
  "calificar",
] as const;
export type Accion = (typeof ACCIONES)[number];

export function esAccion(v: unknown): v is Accion {
  return typeof v === "string" && (ACCIONES as readonly string[]).includes(v);
}

/** Desde que etapa se puede hacer cada accion. Una sola: el flujo es lineal. */
export const ETAPA_DE_ACCION: Record<Accion, Etapa> = {
  iniciar_armado: "por_armar",
  terminar_armado: "armando",
  verificar_armado: "pre_despacho",
  empaquetar: "por_empaquetar",
  asignar_despacho: "por_asignar_despacho",
  verificar_seguridad: "por_verificar",
  calificar: "por_calificar",
};

/**
 * Rol normalizado de la sesion que puede hacer una accion. superadmin puede
 * todas (mismo criterio que `requireRoles`); cualquier otro rol, ninguna.
 */
export function puedeHacer(accion: Accion, rolSesion: string): boolean {
  const rol = String(rolSesion || "").toLowerCase().trim();
  if (rol === "superadmin") return true;
  return RESPONSABLE[ETAPA_DE_ACCION[accion]] === rol;
}

/**
 * La ruta sale en camion propio: al asignar el despacho hay que decir que
 * chofer y que unidad (placa) la llevan. Las otras dos no llevan vehiculo.
 */
export function requiereVehiculo(tipo: TipoEntrega | null): boolean {
  return tipo === "ruta";
}

/**
 * Etapa siguiente a "Almacen verifico el armado". Solo la encomienda pasa
 * por empaquetado; puerta y ruta van directo a asignar quien despacha.
 * (Ruta sin empaquetado es la propuesta del #300: confirmar con Almacen.)
 */
export function etapaTrasArmado(tipo: TipoEntrega): Etapa {
  return tipo === "encomienda" ? "por_empaquetar" : "por_asignar_despacho";
}

/**
 * Etapas que se muestran en la linea de tiempo de un registro. Empaquetado
 * solo aparece en una encomienda: en puerta y ruta no es un paso pendiente,
 * simplemente no existe.
 */
export function etapasDelRecorrido(tipo: TipoEntrega | null): Etapa[] {
  return ETAPAS.filter((e) => e !== "por_empaquetar" || tipo === "encomienda");
}

/** Posicion de una etapa en el recorrido (para pintar hechas / actual / por venir). */
export function indiceEtapa(etapa: Etapa, tipo: TipoEntrega | null): number {
  return etapasDelRecorrido(tipo).indexOf(etapa);
}

/**
 * Compara el conteo de Almacen contra la orden de despacho.
 *
 * El armado solo queda verificado si se contaron TODOS los renglones y todos
 * coinciden. Un renglon sin contar no es cero, es "todavia no": no puede pasar
 * a despacho algo que nadie termino de revisar.
 */
export function evaluarArmado(
  items: Array<{ cantidad_cargada: number; cantidad_armado: number | null }>,
): { completo: boolean; diferencias: number; sinContar: number } {
  const sinContar = items.filter((i) => i.cantidad_armado === null).length;
  const diferencias = items.filter(
    (i) =>
      i.cantidad_armado !== null &&
      Number(i.cantidad_armado) !== Number(i.cantidad_cargada),
  ).length;
  return { completo: sinContar === 0 && diferencias === 0, diferencias, sinContar };
}

/** Etapas en las que el egreso todavia esta en manos de Almacen. */
export function enAlmacen(etapa: Etapa): boolean {
  return RESPONSABLE[etapa] === "almacen";
}

export type FaltanteSeriales = {
  item_id: number;
  producto: string;
  esperados: number;
  cargados: number;
};

/**
 * Compara, por renglon con serial, cuantos seriales tiene el picking de Odoo
 * contra la cantidad que sale (issue #299).
 *
 * Los seriales no se conocen al registrar el egreso: en un picking "Listo"
 * Odoo aparta la cantidad pero no que serial sale; el serial aparece cuando
 * el almacenista procesa el picking. Por eso esto se evalua al leerlos, y un
 * egreso con faltantes no pasa a Seguridad: no hay contra que pistolear.
 *
 * `lleva_serial` null = todavia no se le pregunto a Odoo: no cuenta como
 * faltante, pero tampoco deja el egreso "completo".
 */
export function evaluarSeriales(
  items: Array<{
    id: number;
    producto: string;
    cantidad_cargada: number | string;
    lleva_serial?: number | boolean | null;
  }>,
  seriales: Array<{ item_id: number }>,
): { completo: boolean; sinLeer: boolean; faltantes: FaltanteSeriales[] } {
  const porItem = new Map<number, number>();
  for (const s of seriales) porItem.set(Number(s.item_id), (porItem.get(Number(s.item_id)) || 0) + 1);

  const sinLeer = items.some((i) => i.lleva_serial === null || i.lleva_serial === undefined);
  const faltantes = items
    .filter((i) => Number(i.lleva_serial) === 1)
    .map((i) => ({
      item_id: Number(i.id),
      producto: i.producto,
      esperados: Number(i.cantidad_cargada),
      cargados: porItem.get(Number(i.id)) || 0,
    }))
    .filter((f) => f.cargados !== f.esperados);

  return { completo: !sinLeer && faltantes.length === 0, sinLeer, faltantes };
}

/**
 * Las dos calificaciones de un egreso (issue #302): el picking va al que armo
 * (`almacenista_armado`) y el despacho al que despacho (`almacenista_despacho`).
 * Si es la misma persona, igual son dos notas.
 *
 * `null` en la tabla = calificacion de otra cosa (RMA) o de un egreso de
 * antes de #302, que tenia una sola nota: esa cuenta como `despacho`.
 */
export const ASPECTOS = ["picking", "despacho"] as const;
export type Aspecto = (typeof ASPECTOS)[number];

/**
 * Tipos de novedad. Los de conteo (#302) y los de la pistola en C4 (#301):
 *  - serial_falta: un serial esperado que no se pistoleo.
 *  - serial_sobra: un serial pistoleado que no esta en el picking.
 *  - serial_otra_orden: un serial que es de otro egreso (`otra_orden`).
 *  - producto_ajeno: un producto que no esta en la orden (`item_id` null;
 *    `producto` es el codigo leido y `contado` cuantas veces se pistoleo).
 * Un serial repetido no es novedad: la pistola avisa y no suma dos veces.
 */
export const TIPOS_NOVEDAD = [
  "falta",
  "sobra",
  "no_salio",
  "serial_falta",
  "serial_sobra",
  "serial_otra_orden",
  "producto_ajeno",
] as const;
export type TipoNovedad = (typeof TIPOS_NOVEDAD)[number];

export type Novedad = {
  /** null = producto que no esta en la orden. */
  item_id: number | null;
  producto: string;
  tipo: TipoNovedad;
  esperado: number;
  contado: number | null;
  serial?: string | null;
  otra_orden?: string | null;
  /** En "no_salio": el motivo que escribio Seguridad. */
  detalle?: string | null;
};

type ItemNovedad = {
  id: number;
  producto: string;
  cantidad_cargada: number | string;
  cantidad_verificada: number | string | null;
  no_salio?: number | boolean | null;
  observacion?: string | null;
  lleva_serial?: number | boolean | null;
};

type SerialNovedad = { item_id: number; serial: string; verificado_at: string | null };

/**
 * Un renglon se verifica por serial si lleva serial en Odoo y tiene seriales
 * esperados (#299). Si no los tiene (egresos de antes de #299, o la migracion
 * sin correr) se cuenta como cualquier otro producto.
 */
export function verificaPorSerial(
  item: { id: number; lleva_serial?: number | boolean | null },
  seriales: Array<{ item_id: number }>,
): boolean {
  return (
    Number(item.lleva_serial) === 1 &&
    seriales.some((s) => Number(s.item_id) === Number(item.id))
  );
}

/**
 * Novedades de la verificacion de Seguridad: lo que no salio como decia la
 * orden.
 *
 * Sin `extra`, solo mira el conteo del porton (`cantidad_verificada` /
 * `no_salio`). Con `extra` (#301):
 *  - `seriales`: los esperados del picking (seguridad_mercancia_seriales).
 *    Un renglon con seriales se verifica por serial: cada esperado sin
 *    `verificado_at` es un `serial_falta`.
 *  - `sobrantes`: lo que se registro al pistolear y no se puede deducir de
 *    los renglones (serial_sobra, serial_otra_orden, producto_ajeno), de la
 *    ronda en curso (lib/seguridad/novedades).
 *
 * Sin dependencias de servidor: la usan la API y la pantalla por igual.
 */
export function novedadesVerificacion(
  items: ItemNovedad[],
  extra: { seriales?: SerialNovedad[]; sobrantes?: Novedad[] } = {},
): Novedad[] {
  const seriales = extra.seriales || [];
  const novedades: Novedad[] = [];
  for (const i of items) {
    const item_id = Number(i.id);
    const esperado = Number(i.cantidad_cargada);
    if (Number(i.no_salio) === 1 || i.no_salio === true) {
      novedades.push({
        item_id,
        producto: i.producto,
        tipo: "no_salio",
        esperado,
        contado: null,
        detalle: i.observacion || null,
      });
      continue;
    }
    if (verificaPorSerial(i, seriales)) {
      const propios = seriales.filter((s) => Number(s.item_id) === item_id);
      for (const s of propios) {
        if (!s.verificado_at) {
          novedades.push({ item_id, producto: i.producto, tipo: "serial_falta", esperado: 1, contado: 0, serial: s.serial });
        }
      }
      // Odoo con menos seriales que la cantidad (no deberia pasar: Almacen no
      // puede asignar el despacho asi, ver #299).
      if (propios.length < esperado) {
        novedades.push({ item_id, producto: i.producto, tipo: "falta", esperado, contado: propios.length });
      }
      continue;
    }
    // Sin contar = 0: con la pistola (#301), un renglon que nadie pistoleo es
    // algo que no se vio salir. Si no, se podria aprobar sin contar nada.
    const sinContar =
      i.cantidad_verificada === null || i.cantidad_verificada === undefined || i.cantidad_verificada === "";
    const contado = sinContar ? 0 : Number(i.cantidad_verificada);
    if (contado < esperado) {
      novedades.push({ item_id, producto: i.producto, tipo: "falta", esperado, contado });
    } else if (contado > esperado) {
      novedades.push({ item_id, producto: i.producto, tipo: "sobra", esperado, contado });
    }
  }
  return [...novedades, ...(extra.sobrantes || [])];
}

/**
 * Con novedades, una nota alta del picking pide explicacion: si faltaron o
 * sobraron productos, un 4 o un 5 al que armo no se da a ciegas.
 */
export function pideComentarioPicking(estrellas: number, hayNovedades: boolean): boolean {
  return hayNovedades && estrellas >= 4;
}

// ── Verificacion de Seguridad en C4 (issue #301) ─────────────────────────

/**
 * Donde verifica Seguridad. Hoy hay un solo local de despacho; si aparecen
 * otros (u otra sucursal le dice distinto), esto pasa a ser un catalogo.
 */
export const LOCAL_DESPACHO = "C4";

/**
 * Lo que decide Seguridad cuando no aprueba (hay novedades, o no aprueba por
 * otra razon):
 *  - despachar: sale igual.
 *  - devolver: vuelve a Almacen a asignar despacho (no a armar de nuevo),
 *    para corregir y mandarlo otra vez. Lo ya pistoleado se conserva.
 *  - cancelar: no sale nunca (el cliente cancelo, por ejemplo). Se cierra
 *    sin despachar, pasando por calificar como cualquier otro.
 */
export const DECISIONES = ["despachar", "devolver", "cancelar"] as const;
export type DecisionSeguridad = (typeof DECISIONES)[number];

export function esDecision(v: unknown): v is DecisionSeguridad {
  return typeof v === "string" && (DECISIONES as readonly string[]).includes(v);
}

/** Etapa tras la verificacion de Seguridad. Aprobar cuenta como "despachar". */
export function etapaTrasVerificacion(decision: DecisionSeguridad): Etapa {
  return decision === "devolver" ? "por_asignar_despacho" : "por_calificar";
}

export type ResultadoEgreso =
  | "aprobado"
  | "no_aprobado_despachado"
  | "no_despachado"
  | "devuelto"
  | "cancelado";

/**
 * Resultado del porton (null = Seguridad todavia no verifico). Con `etapa`:
 * si ya tiene resultado pero esta otra vez en Almacen (o en una verificacion
 * nueva), es que Seguridad no lo despacho y volvio (#301): "devuelto".
 */
export function resultadoEgreso(m: {
  aprobado: number | string | null;
  despachado: number | string | null;
  etapa?: string | null;
  decision_seguridad?: string | null;
}): ResultadoEgreso | null {
  if (m.aprobado === null || m.aprobado === undefined) return null;
  // No salio porque se cancelo (el cliente, por ejemplo): no es un rechazo
  // de Seguridad por lo que armo Almacen.
  if (esCancelado(m)) return "cancelado";
  if (esEtapa(m.etapa) && (enAlmacen(m.etapa) || m.etapa === "por_verificar")) return "devuelto";
  if (Number(m.aprobado) === 1) return "aprobado";
  return Number(m.despachado) === 1 ? "no_aprobado_despachado" : "no_despachado";
}

/**
 * Mientras Seguridad pistolea, las faltas son lo normal: todavia no se conto.
 * En vivo solo se muestra lo que ya es anormal (algo de mas, de otra orden,
 * que no esta en la orden, o marcado "No salio"); las faltas van en un
 * contador. La lista completa, al decidir. La regla de novedadesVerificacion
 * no cambia: es solo que se pinta (Lino, #314).
 */
export function esAnormalEnVivo(n: Novedad): boolean {
  return n.tipo !== "falta" && n.tipo !== "serial_falta";
}

/** Unidades que faltan por pistolear, segun las faltas de la verificacion. */
export function faltanPorPistolear(novedades: Novedad[]): number {
  let n = 0;
  for (const x of novedades) {
    if (x.tipo === "serial_falta") n += 1;
    else if (x.tipo === "falta") n += Math.max(0, x.esperado - (x.contado ?? 0));
  }
  return n;
}

/**
 * Seguridad lo cancelo: no salio nunca (#316). Solo se sabe con
 * sql/egreso_verificacion_c4.sql corrido (columna decision_seguridad); sin
 * ella un cancelado se ve como "no despachado".
 */
export function esCancelado(m: { decision_seguridad?: string | null }): boolean {
  return m.decision_seguridad === "cancelar";
}

/**
 * Que se califica. Un cancelado solo el picking: el despacho nunca ocurrio.
 */
export function aspectosACalificar(m: { decision_seguridad?: string | null }): readonly Aspecto[] {
  return esCancelado(m) ? ["picking"] : ASPECTOS;
}

/**
 * Si al calificar hubo novedades (para pedir comentario con 4 o 5 estrellas
 * al picking). Misma regla en la API y en la pantalla.
 *  - `actuales`: las de la ronda que termino (novedadesVerificacion).
 *  - `previas`: las guardadas de rondas anteriores. Si Seguridad lo
 *    devolvio, el picking fallo aunque la ultima ronda saliera limpia.
 * Un cancelado no cuenta como novedad por si solo: si el cliente cancelo un
 * pedido bien armado, nadie se equivoco. Tampoco sus faltas (no se pistoleo
 * porque no salia); si las sobras, lo de otra orden o lo que no estaba en la
 * orden, que si son errores del armado.
 */
export function hayNovedadesAlCalificar(p: {
  actuales: Novedad[];
  previas: Novedad[];
  ronda: number;
  aprobado: number | string | null;
  cancelado: boolean;
}): boolean {
  if (p.previas.length > 0 || p.ronda > 1) return true;
  if (p.cancelado) return p.actuales.some(esAnormalEnVivo);
  return p.actuales.length > 0 || (p.aprobado !== null && Number(p.aprobado) === 0);
}
