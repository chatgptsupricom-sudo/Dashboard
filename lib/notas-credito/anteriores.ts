import { query } from "@/lib/db";
import { registrarEvento, sedeConFlujo, tienePaso } from "@/lib/notas-credito/datos";
import { crearDesdeRma, ErrorNC, type Autor } from "@/lib/notas-credito/solicitudes";
import { leerProductos, type EstadoProducto } from "@/lib/rma/items";
import { listarNotas, obtenerNota, sePuedeSolicitar } from "@/lib/rma/notaCredito";

/**
 * Solicitudes de nota de crédito de RMA que no están en el flujo
 * (rma_notas_credito sin fila en nc_solicitudes): las de antes del flujo y
 * las de sedes que todavía no lo tienen activo. La pantalla de notas de
 * crédito las muestra aparte, y las pendientes se pueden pasar al flujo
 * (pasarAlFlujo): desde ahí siguen como cualquier solicitud nueva.
 */
export type AnteriorNC = {
  rma_nota_id: number;
  case_id: number;
  item_id: number | null;
  case_number: string;
  company_id: number;
  cliente: string;
  factura: string;
  producto: string;
  serial: string | null;
  motivo: string;
  estado: string;
  creado_por: string;
  created_at: string;
  puede_pasar: boolean;
};

export async function listarAnteriores(sedes: number[] | null, autor: Autor, superadmin: boolean): Promise<AnteriorNC[]> {
  const notas = (await listarNotas(null, 500)).filter((n) => !n.flujo_id);
  const flujo = new Map<number, boolean>();
  const out: AnteriorNC[] = [];
  for (const n of notas) {
    const sede = Number(n.company_id) || 9;
    if (sedes && !sedes.includes(sede)) continue;
    if (!flujo.has(sede)) flujo.set(sede, await sedeConFlujo(sede));
    const puede =
      n.estado === "pendiente" && !!flujo.get(sede) && (superadmin || (await tienePaso(autor.email, sede, "preaprueba")));
    out.push({
      rma_nota_id: n.id,
      case_id: n.case_id,
      item_id: n.item_id ?? null,
      case_number: String(n.case_number ?? ""),
      company_id: sede,
      cliente: n.client_name || "",
      factura: n.invoice_number || "",
      producto: n.model || n.hardware || "",
      serial: n.serial || null,
      motivo: n.motivo || n.detail || "",
      estado: n.estado,
      creado_por: n.created_by || "",
      created_at: n.created_at,
      puede_pasar: puede,
    });
  }
  return out;
}

/**
 * Pasa una solicitud pendiente de RMA al flujo: nace "por preaprobar", el
 * equipo queda en "NC en revisión" y le llega el aviso a quien preaprueba.
 * Solo la pasa el SuperAdmin o quien preaprueba en esa sede, y solo si la
 * sede tiene el flujo activo y el equipo sigue en el taller.
 */
export async function pasarAlFlujo(rmaNotaId: number, autor: Autor, superadmin: boolean, origenPeticion: string): Promise<number> {
  const nota = await obtenerNota(rmaNotaId);
  if (!nota) throw new ErrorNC("Solicitud no encontrada.", 404);
  if (nota.flujo_id) throw new ErrorNC(`Ya está en el flujo como NC-${nota.flujo_id}.`, 409);
  if (nota.estado !== "pendiente") throw new ErrorNC("Solo se pasan al flujo las solicitudes pendientes.", 409);
  const companyId = Number(nota.company_id) || 9;
  if (!superadmin && !(await tienePaso(autor.email, companyId, "preaprueba"))) {
    throw new ErrorNC("Solo el SuperAdmin o quien preaprueba en la sede la pasa al flujo.", 403);
  }
  if (!(await sedeConFlujo(companyId))) {
    throw new ErrorNC("La sede todavía no tiene el flujo activo: completa sus responsables.", 409);
  }

  const r = await query(`SELECT status, odoo_product_id FROM rma_cases WHERE id = ?`, [nota.case_id]);
  const caso = (r.rows as any[])[0];
  if (!caso) throw new ErrorNC("El caso de RMA ya no existe.", 404);
  const productos = await leerProductos(nota.case_id);
  const producto = nota.item_id ? productos.find((p) => p.id === nota.item_id) : productos.length === 1 ? productos[0] : null;
  const actual = (productos.length > 1 && producto ? producto.status : caso.status) as EstadoProducto;
  // "nc_revision" es del flujo anterior: si se rechaza, vuelve a diagnóstico.
  const previo: EstadoProducto = actual === "nc_revision" ? "en_diagnostico" : actual;
  if (actual !== "nc_revision" && !sePuedeSolicitar(actual)) {
    throw new ErrorNC(`El equipo ya no está en revisión en el taller (estado: ${actual}).`, 409);
  }

  const id = await crearDesdeRma({
    rmaNotaId,
    companyId,
    caseId: nota.case_id,
    itemId: productos.length > 1 ? (nota.item_id ?? null) : null,
    caseNumber: String(nota.case_number ?? ""),
    producto: nota.model || nota.hardware || "",
    serial: nota.serial || null,
    odooProductId: producto?.odoo_product_id ?? caso.odoo_product_id ?? null,
    numeroFactura: nota.invoice_number || null,
    clienteRma: nota.client_name || null,
    estadoRma: previo,
    motivo: String(nota.motivo || nota.detail || "Solicitud de RMA anterior al flujo"),
    autor: { nombre: nota.created_by || "RMA", email: "", rol: "rma" },
    origenPeticion,
  });
  await registrarEvento(id, "aviso", autor, `Solicitud de RMA del ${String(nota.created_at).slice(0, 10)} pasada al flujo por ${autor.nombre}.`);
  return id;
}
