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
