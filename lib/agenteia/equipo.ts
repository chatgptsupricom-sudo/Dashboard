import type Anthropic from "@anthropic-ai/sdk";
import type { Alcance, Area } from "@/lib/agenteia/alcance";
import type { Estacion, IdAgente } from "@/lib/agenteia/respuesta";
import { alertasQuiebre, menorRotacion } from "@/lib/compras/reportes";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { fetchTesoreriaAdmin } from "@/lib/administracion/tesoreria";
import { fetchCxPAdmin } from "@/lib/administracion/cxp";
import { calcularSobregiro } from "@/lib/cxc/sobregiro";

/**
 * Equipo de Supri: el Agente IA (el coordinador) le reparte tareas a
 * especialistas con la herramienta `consultar_especialista`. Cada especialista
 * es otra conversación con Claude, con sus instrucciones y sus herramientas
 * (las de lectura del agente + las de este archivo, que usan los mismos
 * cálculos de las pantallas del panel). No habla con el usuario: le devuelve
 * su informe a Supri, que arma la respuesta. Solo lee: nadie del equipo
 * prepara cambios en Odoo.
 *
 * El bucle de cada especialista está en lib/agenteia/agente.ts
 * (`correrEspecialista`); lo que se ve en la oficina, en lib/agenteia/oficina.ts.
 */

export type IdEspecialista = Exclude<IdAgente, "sup">;

export interface Especialista {
  id: IdEspecialista;
  nombre: string;
  /** Áreas del alcance de las que necesita al menos una (lib/agenteia/alcance.ts). */
  areas: Area[];
  /** Herramientas del agente (HERRAMIENTAS de agente.ts) y de este archivo que puede usar. */
  herramientas: string[];
  instrucciones: string;
}

const COMUN = `No hablas con el usuario: le respondes a Supri, el coordinador, que arma la respuesta final. Consulta antes de afirmar y no inventes cifras.
Entrega un informe compacto: primero una tabla corta (máximo 25 filas) con lo importante, después 3 a 5 viñetas con lo que encontraste, los supuestos y lo que no pudiste revisar. Sin saludos ni recomendaciones generales. Montos en USD con formato venezolano (1.234,56).
Si la tarea no dice sede, revisa Valencia, Caracas y Panamá por separado. Si algo no se puede hacer con tus herramientas, dilo en una línea.`;

export const ESPECIALISTAS: Especialista[] = [
  {
    id: "inv",
    nombre: "Inventario",
    areas: ["inventario"],
    herramientas: ["inventario_quiebres", "inventario_menor_rotacion", "odoo_agrupar", "odoo_buscar", "odoo_contar", "odoo_campos", "odoo_modelos", "consultar_panel"],
    instrucciones: `## Eres Inventario, del equipo de Supri
Sabes qué hay en el almacén principal de cada sede, qué se va a acabar y qué no se mueve.
- Quiebres y riesgo: \`inventario_quiebres\` (el mismo cálculo de Sugeridos y Mayor rotación de Compras: venta de 45 días, disponible, tránsito, punto de reorden, días hasta quedarse sin stock y cantidad sugerida).
- Lo que no rota: \`inventario_menor_rotacion\`.
- Lo que viene en camino fuera de Odoo (Valencia): tabla \`recepcion_packing\` del panel (packing list no cerrados) con \`consultar_panel\`.
${COMUN}`,
  },
  {
    id: "com",
    nombre: "Compras",
    areas: ["compras"],
    herramientas: ["inventario_quiebres", "ventas_detalle", "odoo_agrupar", "odoo_buscar", "odoo_contar", "odoo_campos", "odoo_modelos", "consultar_panel"],
    instrucciones: `## Eres Compras, del equipo de Supri
Propones qué comprar, cuánto y a quién, con su costo.
- Parte de la lista que te pase Supri (casi siempre la de Inventario). Si no te la pasa, usa \`inventario_quiebres\`.
- Cantidad: la sugerida de \`inventario_quiebres\`, ajustada con la venta reciente (\`ventas_detalle\` por producto) si hace falta.
- Proveedor y costo: el último proveedor y precio de compra en Odoo (\`purchase.order.line\` confirmadas, o \`product.supplierinfo\`); órdenes pendientes de recibir para no comprar dos veces.
- Agrupa por proveedor y da el total al costo de cada uno y el total general.
${COMUN}`,
  },
  {
    id: "ven",
    nombre: "Ventas",
    areas: ["ventas"],
    herramientas: ["ventas_detalle", "odoo_agrupar", "odoo_buscar", "odoo_contar", "odoo_campos", "odoo_modelos", "consultar_panel"],
    instrucciones: `## Eres Ventas, del equipo de Supri
Ves clientes y oportunidades: quién compra qué, quién dejó de comprar y qué pedidos esperan mercancía.
- Venta por cliente, vendedor, marca o producto: \`ventas_detalle\`.
- Pedidos abiertos (cotizaciones y pedidos confirmados sin entregar): \`sale.order\` / \`sale.order.line\` en Odoo.
- Clientes en riesgo: tabla \`semaforo_clientes_fotos\` del panel (estado de cada cliente la última semana) con \`consultar_panel\`.
${COMUN}`,
  },
  {
    id: "fin",
    nombre: "Finanzas",
    areas: ["contabilidad", "cobranza"],
    herramientas: ["finanzas_caja", "finanzas_por_pagar", "clientes_credito", "odoo_agrupar", "odoo_buscar", "odoo_contar", "odoo_campos", "odoo_modelos"],
    instrucciones: `## Eres Finanzas, del equipo de Supri
Dices si alcanza la plata y qué riesgo hay.
- Caja disponible, cobros y pagos del mes y flujo de 4 semanas: \`finanzas_caja\` (lo mismo que Tesorería y Bancos). Ojo: \`disponible\` es saldo en libros (banco + recibos y pagos registrados sin conciliar con el extracto, \`pendiente\`); en Valencia y Caracas casi no se concilian extractos y puede salir negativo aunque haya plata en el banco. Si da negativo no digas «no hay caja»: muestra \`disponibleBancos\`, \`disponibleCajas\` y \`pendiente\` por separado, explica que falta conciliar y que conviene confirmar con el saldo real del banco antes de comprometer la compra.
- Lo que se debe a proveedores, lo vencido y lo que vence: \`finanzas_por_pagar\` (lo mismo que Cuentas por Pagar, sin empresas del grupo).
- Clientes excedidos en su crédito: \`clientes_credito\` (lo mismo que Sobregiro).
- Si Supri te pasa una propuesta de compra, compárala con la caja y lo que vence, y di cuánto se puede comprometer y qué conviene dejar para después.
${COMUN}`,
  },
];

/** Especialistas que el usuario puede usar según su alcance (null = SuperAdmin, todos). */
export function especialistasPara(alcance: Alcance | null): Especialista[] {
  if (!alcance) return ESPECIALISTAS;
  return ESPECIALISTAS.filter((e) => e.areas.some((a) => alcance.areas.has(a)));
}

// ── Herramientas propias del equipo ──────────────────────────────────────────

const SEDE = { type: "integer", enum: [9, 10, 7], description: "Sede: 9 Valencia, 10 Caracas, 7 Panamá" };
const LIMITE = { type: "integer", description: "Máx. filas (default 40, tope 80)" };

export const HERRAMIENTAS_EQUIPO: Anthropic.Beta.BetaTool[] = [
  {
    name: "inventario_quiebres",
    description:
      "Productos del almacén principal de una sede en quiebre o en riesgo (el cálculo de Sugeridos de Compras), ordenados por días hasta quedarse sin stock: venta de 45 días, disponible, tránsito, punto de reorden, cantidad sugerida a comprar y costo.",
    input_schema: { type: "object", properties: { sede: SEDE, limite: LIMITE }, required: ["sede"] },
  },
  {
    name: "inventario_menor_rotacion",
    description: "Productos con stock en el almacén principal de una sede que se venden poco o nada (Menor rotación de Compras).",
    input_schema: { type: "object", properties: { sede: SEDE, limite: LIMITE }, required: ["sede"] },
  },
  {
    name: "finanzas_caja",
    description:
      "Tesorería de una sede (la pantalla Tesorería y Bancos): disponible en bancos y cajas, retenciones, cobros y pagos del mes, tasa BCV y flujo de las próximas 4 semanas.",
    input_schema: { type: "object", properties: { sede: SEDE }, required: ["sede"] },
  },
  {
    name: "finanzas_por_pagar",
    description:
      "Cuentas por pagar de una sede sin empresas del grupo (la pantalla Cuentas por Pagar): deuda neta, vencido, lo que vence en 7 y 30 días, antigüedad, calendario de 8 semanas y los 15 proveedores con más saldo.",
    input_schema: { type: "object", properties: { sede: SEDE }, required: ["sede"] },
  },
  {
    name: "clientes_credito",
    description: "Clientes de una sede excedidos o al límite de su crédito (la pantalla Sobregiro de CxC).",
    input_schema: { type: "object", properties: { sede: SEDE, limite: LIMITE }, required: ["sede"] },
  },
];

const AREA_HERRAMIENTA: Record<string, Area[]> = {
  inventario_quiebres: ["inventario", "compras"],
  inventario_menor_rotacion: ["inventario", "compras"],
  finanzas_caja: ["contabilidad"],
  finanzas_por_pagar: ["contabilidad"],
  clientes_credito: ["cobranza", "contabilidad"],
};

export const esHerramientaEquipo = (nombre: string) => nombre in AREA_HERRAMIENTA;

const MAX = 60_000;
const json = (v: unknown, conCostos: boolean) => {
  const t = JSON.stringify(v, (k, x) => (!conCostos && /costo|valor|margen/i.test(k) ? undefined : x));
  return t.length > MAX ? `${t.slice(0, MAX)}…(recortado: pide menos filas)` : t;
};

/**
 * Corre una herramienta del equipo. `sedes` ya viene recortada al alcance del
 * usuario (sedesDe de agente.ts): se usa la primera.
 */
export async function ejecutarHerramientaEquipo(nombre: string, i: any, sedes: number[], alcance: Alcance | null): Promise<string> {
  const areas = AREA_HERRAMIENTA[nombre];
  if (!areas) return `Error: herramienta desconocida ${nombre}`;
  if (alcance && !areas.some((a) => alcance.areas.has(a))) return "Error: el rol de este usuario no tiene acceso a esta información.";
  const sede = sedes[0];
  if (!sede) return "Error: sede no permitida para este usuario.";
  const limite = Math.min(Math.max(Number(i?.limite) || 40, 1), 80);
  const conCostos = !alcance || alcance.costos;
  const hoy = hoyCaracas();
  const desde = `${hoy.slice(0, 8)}01`;

  if (nombre === "inventario_quiebres") {
    const filas = (await alertasQuiebre(sede)).sort((a, b) => a.diasHastaQuiebre - b.diasHastaQuiebre);
    return json(
      {
        sede,
        total: filas.length,
        quiebreTotal: filas.filter((f) => f.nivelCritico === "QUIEBRE TOTAL").length,
        filas: filas.slice(0, limite).map((f) => ({
          codigo: f.codigo,
          producto: f.name,
          marca: f.marca,
          categoria: f.categoria,
          venta45d: f.ventas45d,
          disponible: f.stockDisponible,
          transito: f.transito,
          diasHastaQuiebre: Math.round(f.diasHastaQuiebre),
          puntoReorden: f.puntoReorden,
          cantidadSugerida: f.cantidadAComprar,
          costo: f.costo,
          nivel: f.nivelCritico,
        })),
      },
      conCostos,
    );
  }
  if (nombre === "inventario_menor_rotacion") {
    const filas = await menorRotacion(sede);
    return json({ sede, total: filas.length, filas: filas.slice(0, limite) }, conCostos);
  }
  if (nombre === "finanzas_caja") {
    const d = await fetchTesoreriaAdmin([sede], hoy, desde, hoy);
    return json({ sede, al: hoy, resumen: d.resumen, flujo: d.flujo, tasas: d.tasas.slice(0, 2) }, true);
  }
  if (nombre === "finanzas_por_pagar") {
    const d = await fetchCxPAdmin([sede], hoy, desde, hoy, true);
    return json({ sede, al: hoy, resumen: d.resumen, bandas: d.bandas, calendario: d.calendario, proveedores: d.proveedores.slice(0, 15) }, true);
  }
  const { clientes, resumen } = await calcularSobregiro([sede]);
  const riesgo = clientes.filter((c) => c.estado === "excedido" || c.estado === "al_limite");
  return json({ sede, resumen, excedidosOAlLimite: riesgo.length, clientes: riesgo.slice(0, limite) }, true);
}

/** Estación de la oficina donde se ve trabajando a quien usa esa herramienta. */
export function estacionDe(nombre: string): Estacion {
  if (nombre === "consultar_panel" || nombre === "recordar_preferencia" || nombre === "olvidar_preferencia") return "archivos";
  if (/^web_/.test(nombre)) return "internet";
  if (/code_execution|preparar_cambio/.test(nombre)) return "escritorio";
  if (/^finanzas_|^clientes_credito/.test(nombre)) return "caja";
  if (nombre === "consultar_especialista") return "mesa";
  return "odoo";
}
