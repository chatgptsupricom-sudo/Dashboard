// Comparación entre la foto anterior y la de ahora del crédito de los clientes
// (lib/cxc/historialCredito.ts). Puro, sin imports: lo prueba
// `node scripts/check-historial-credito.cjs`.

export type TipoEvento = "cupo" | "excedio" | "normalizo";

export interface FotoCredito {
  partnerId: number;
  cliente: string;
  rif: string;
  vendedor: string;
  limite: number;
  usado: number;
  vencido: number;
  /** El de Sobregiro: "excedido" | "al_limite" | "en_uso" | "sin_uso" | "sin_limite". */
  estado: string;
}

export interface Previa { limite: number; usado: number; estado: string; cliente: string }

export interface EventoNuevo {
  partnerId: number;
  cliente: string;
  tipo: TipoEvento;
  antes: number | null;
  despues: number | null;
  usado: number;
}

const vacio = (p: Previa) => p.limite === 0 && p.usado === 0 && p.estado === "sin_limite";

/**
 * Filas a guardar hoy y eventos desde la foto anterior. Sin foto anterior
 * (primera corrida) solo hay base, sin eventos. Un cliente que ya no sale en
 * Sobregiro (le quitaron el cupo y no debe) se guarda en 0 una vez.
 */
export function compararFotos(previa: Map<number, Previa>, ahora: FotoCredito[]): { filas: FotoCredito[]; eventos: EventoNuevo[] } {
  const hayBase = previa.size > 0;
  const filas = [...ahora];
  const presentes = new Set(ahora.map((c) => c.partnerId));
  for (const [id, p] of previa) {
    if (!presentes.has(id) && !vacio(p)) {
      filas.push({ partnerId: id, cliente: p.cliente, rif: "", vendedor: "", limite: 0, usado: 0, vencido: 0, estado: "sin_limite" });
    }
  }

  const eventos: EventoNuevo[] = [];
  for (const c of filas) {
    const p = previa.get(c.partnerId);
    const limiteAntes = p?.limite ?? 0;
    if (hayBase && Math.abs(c.limite - limiteAntes) >= 0.01) {
      eventos.push({ partnerId: c.partnerId, cliente: c.cliente, tipo: "cupo", antes: limiteAntes, despues: c.limite, usado: c.usado });
    }
    const estaba = p?.estado === "excedido";
    const esta = c.estado === "excedido";
    if (hayBase && esta && !estaba) {
      eventos.push({ partnerId: c.partnerId, cliente: c.cliente, tipo: "excedio", antes: null, despues: c.limite, usado: c.usado });
    } else if (estaba && !esta) {
      eventos.push({ partnerId: c.partnerId, cliente: c.cliente, tipo: "normalizo", antes: null, despues: c.limite, usado: c.usado });
    }
  }
  return { filas, eventos };
}
