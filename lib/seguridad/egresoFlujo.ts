/**
 * Egreso de mercancia por etapas: Almacen arma, verifica y asigna; Seguridad
 * verifica en el porton y califica.
 *
 * Sigue el proceso real del almacen (diagrama "Egreso Mercancia"):
 *
 *   por_armar ─► armando ─► pre_despacho ─► (Almacen verifica el armado)
 *        ├─ encomienda ─► por_empaquetar ─► por_asignar_despacho
 *        └─ puerta ────────────────────────► por_asignar_despacho
 *   por_asignar_despacho ─► por_verificar ─► (Seguridad verifica)
 *        ├─ aprueba            ─► despachado
 *        └─ no aprueba + motivo ─► Seguridad decide: despachado o no
 *   ─► por_calificar ─► cerrado
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

// "ruta" (camion propio, con chofer y placa) esta en el diagrama pero hoy no
// se trabaja con rutas: solo encomienda y entrega en puerta. Para activarla,
// agregarla aqui y volver a pedir chofer/placa al asignar el despacho.
export const TIPOS_ENTREGA = ["encomienda", "puerta"] as const;
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
 * Etapa siguiente a "Almacen verifico el armado". Solo la encomienda pasa
 * por empaquetado; la entrega en puerta va directo a asignar quien despacha.
 */
export function etapaTrasArmado(tipo: TipoEntrega): Etapa {
  return tipo === "encomienda" ? "por_empaquetar" : "por_asignar_despacho";
}

/**
 * Etapas que se muestran en la linea de tiempo de un registro. Empaquetado
 * solo aparece en una encomienda: en puerta no es un paso pendiente,
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

export type Novedad = {
  item_id: number;
  producto: string;
  tipo: "falta" | "sobra" | "no_salio";
  esperado: number;
  contado: number | null;
};

/**
 * Novedades de la verificacion de Seguridad: lo que no salio como decia la
 * orden. Hoy sale del conteo del porton (`cantidad_verificada` / `no_salio`);
 * #301 le suma las de seriales (faltantes, sobrantes, de otra orden).
 */
export function novedadesVerificacion(
  items: Array<{
    id: number;
    producto: string;
    cantidad_cargada: number | string;
    cantidad_verificada: number | string | null;
    no_salio?: number | boolean | null;
  }>,
): Novedad[] {
  const novedades: Novedad[] = [];
  for (const i of items) {
    const esperado = Number(i.cantidad_cargada);
    if (Number(i.no_salio) === 1 || i.no_salio === true) {
      novedades.push({ item_id: Number(i.id), producto: i.producto, tipo: "no_salio", esperado, contado: null });
      continue;
    }
    if (i.cantidad_verificada === null || i.cantidad_verificada === undefined || i.cantidad_verificada === "") continue;
    const contado = Number(i.cantidad_verificada);
    if (contado < esperado) {
      novedades.push({ item_id: Number(i.id), producto: i.producto, tipo: "falta", esperado, contado });
    } else if (contado > esperado) {
      novedades.push({ item_id: Number(i.id), producto: i.producto, tipo: "sobra", esperado, contado });
    }
  }
  return novedades;
}

/**
 * Con novedades, una nota alta del picking pide explicacion: si faltaron o
 * sobraron productos, un 4 o un 5 al que armo no se da a ciegas.
 */
export function pideComentarioPicking(estrellas: number, hayNovedades: boolean): boolean {
  return hayNovedades && estrellas >= 4;
}
