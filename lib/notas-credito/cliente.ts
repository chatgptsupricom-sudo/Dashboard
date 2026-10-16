import { query } from "@/lib/db";
import { avisarNC } from "@/lib/notas-credito/aviso";
import { ensureTablas, registrarEvento, sedeConFlujo } from "@/lib/notas-credito/datos";
import { ErrorNC, guardarLineas, obtener, productosParaNota, validarLineas, type LineaPedida } from "@/lib/notas-credito/solicitudes";
import {
  estadoInicial,
  etapaCliente,
  ETIQUETA_MOTIVO_CLIENTE,
  MOTIVOS_CLIENTE,
  resumenProductos,
  type MotivoCliente,
  type SeguimientoCliente,
} from "@/lib/notas-credito/tipos";
import { generarTrackingToken } from "@/lib/servicio-tecnico/casos";
import { resolverFactura } from "@/lib/servicio-tecnico/factura";

/**
 * Nota de crédito pedida por el cliente: servicio aparte en su propio dominio
 * (NC_HOSTS → /<idioma>/notas-credito/<sucursal>, por dentro
 * app/[locale]/credito-clientes; lib/notas-credito/hostCliente.ts). APIs
 * públicas en app/api/credito-clientes. Sin sesión, así que:
 *   - Nada de lo que manda el cliente se cree: la factura se vuelve a buscar
 *     con su número + RIF (resolverFactura, la misma del reporte de servicio
 *     técnico) y los productos, cantidades y seriales se validan contra Odoo
 *     (validarLineas, la misma de "Nueva nota de crédito" del panel).
 *   - No se muestran precios ni montos: el monto lo calcula el panel y lo ven
 *     quienes deciden.
 * La solicitud entra como "Por preaprobar" (origen 'cliente') y sigue el
 * flujo de siempre. El cliente la sigue con su enlace (tracking_token, 32
 * bytes al azar), que solo devuelve la etapa, sus productos y, al final, el
 * número de la NC de Odoo o el motivo del rechazo.
 */

export const MAX_PRODUCTOS_CLIENTE = 30;

/** Producto de la factura tal como lo ve el cliente (sin precio). */
export type ProductoCliente = {
  linea_id: number;
  producto: string;
  codigo: string;
  marca: string;
  cantidad: number;
  disponible: number;
  con_serial: boolean;
  seriales: { serial: string; ocupado: boolean }[];
};

export type FacturaCliente =
  | {
      estado: "ok";
      factura: { numero: string; fecha: string | null };
      cliente: string;
      productos: ProductoCliente[];
    }
  | { estado: "no_encontrada" }
  | { estado: "ambiguo"; coincidencias: { numero: string; fecha: string | null; compania: string }[] };

async function exigirFlujo(companyId: number): Promise<void> {
  if (!(await sedeConFlujo(companyId))) {
    throw new ErrorNC(
      "Esta sucursal todavía no recibe solicitudes de nota de crédito por aquí. Comunícate con tu vendedor.",
      409,
    );
  }
}

/** La factura del cliente con sus productos, para elegir qué va en la nota. */
export async function facturaParaCliente(numero: string, rif: string, companyId: number): Promise<FacturaCliente> {
  await exigirFlujo(companyId);
  const r = await resolverFactura(numero, rif, companyId);
  if (r.estado === "no_encontrada") return r;
  if (r.estado === "ambiguo") {
    return { estado: "ambiguo", coincidencias: r.coincidencias.map((c) => ({ numero: c.numero, fecha: c.fecha, compania: c.compania })) };
  }
  const { factura, productos } = await productosParaNota(companyId, r.id);
  return {
    estado: "ok",
    factura: { numero: factura.nombre, fecha: factura.fecha },
    cliente: factura.cliente,
    productos: productos.map((p) => ({
      linea_id: p.linea_id,
      producto: p.producto,
      codigo: p.codigo,
      marca: p.marca,
      cantidad: p.cantidad,
      disponible: p.disponible,
      con_serial: p.con_serial,
      seriales: p.seriales.map((s) => ({ serial: s.serial, ocupado: !!s.nc })),
    })),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Crea la solicitud del cliente. Devuelve el número y el token de seguimiento. */
export async function crearDesdeCliente(datos: {
  companyId: number;
  numero: string;
  rif: string;
  lineas: LineaPedida[];
  motivoTipo: string;
  detalle: string;
  telefono: string;
  email: string;
  origenPeticion: string;
}): Promise<{ id: number; token: string }> {
  if (!MOTIVOS_CLIENTE.includes(datos.motivoTipo as MotivoCliente)) throw new ErrorNC("Elige el motivo de la nota de crédito.");
  const motivoTipo = datos.motivoTipo as MotivoCliente;
  const detalle = datos.detalle.trim();
  if (detalle.length < 15) throw new ErrorNC("Cuéntanos con un poco más de detalle qué pasó (al menos 15 caracteres).");
  const telefono = datos.telefono.trim();
  if (telefono.replace(/\D/g, "").length < 7) throw new ErrorNC("Escribe un teléfono de contacto.");
  const email = datos.email.trim().toLowerCase();
  if (email && !EMAIL.test(email)) throw new ErrorNC("El correo no parece válido.");
  if (!datos.lineas.length) throw new ErrorNC("Elige al menos un producto de la factura.");
  if (datos.lineas.length > MAX_PRODUCTOS_CLIENTE) throw new ErrorNC(`Hasta ${MAX_PRODUCTOS_CLIENTE} productos por solicitud.`);

  await exigirFlujo(datos.companyId);
  const r = await resolverFactura(datos.numero, datos.rif, datos.companyId);
  if (r.estado !== "ok") throw new ErrorNC("No encontramos esa factura con ese documento.", 404);
  const { factura, productos } = await productosParaNota(datos.companyId, r.id);
  const lineas = validarLineas(datos.lineas, productos);
  const monto = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;
  const seriales = lineas.flatMap((l) => l.seriales);
  const motivo = `${ETIQUETA_MOTIVO_CLIENTE[motivoTipo]}: ${detalle}`;
  const creadoPor = `${factura.cliente || "Cliente"} (portal)`.slice(0, 190);
  const token = generarTrackingToken();

  await ensureTablas();
  const ins = await query(
    `INSERT INTO nc_solicitudes
       (company_id, origen, estado, factura_id, factura_nombre, partner_id, cliente, moneda, monto, total_factura,
        producto, serial, odoo_product_id, motivo, creado_por, motivo_tipo, contacto_telefono, contacto_email, tracking_token)
     VALUES (?, 'cliente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.companyId, estadoInicial("cliente"), factura.id, factura.nombre, factura.partner_id, factura.cliente.slice(0, 255),
      factura.moneda, monto, factura.total, resumenProductos(lineas).slice(0, 500), seriales.join(", ").slice(0, 200) || null,
      lineas.length === 1 ? lineas[0].product_id : null, motivo.slice(0, 5000), creadoPor, motivoTipo,
      telefono.slice(0, 40), email.slice(0, 190) || null, token,
    ],
  );
  const id = Number((ins.rows as any).insertId);
  await guardarLineas(id, lineas);
  await registrarEvento(id, "solicitada_cliente", { nombre: creadoPor }, motivo);
  const sol = await obtener(id);
  if (sol) avisarNC("preaprobar", sol, datos.origenPeticion);
  return { id, token };
}

const TOKEN = /^[a-f0-9]{64}$/;

/** Lo que ve el cliente con su enlace, o null si el token no es de ninguna solicitud. */
export async function seguimientoCliente(token: string): Promise<SeguimientoCliente | null> {
  if (!TOKEN.test(token)) return null;
  await ensureTablas();
  const r = await query(`SELECT id FROM nc_solicitudes WHERE tracking_token = ? AND origen = 'cliente' LIMIT 1`, [token]);
  const id = Number((r.rows as any[])[0]?.id);
  if (!id) return null;
  const s = await obtener(id);
  if (!s) return null;
  const etapa = etapaCliente(s.estado);
  return {
    numero: `NC-${s.id}`,
    etapa,
    fecha: s.created_at,
    factura: s.factura_nombre || "",
    motivo: s.motivo_tipo ? ETIQUETA_MOTIVO_CLIENTE[s.motivo_tipo] : "",
    productos: (s.lineas ?? []).map((l) => ({ producto: l.producto, codigo: l.codigo, cantidad: l.cantidad, seriales: l.seriales })),
    nota_odoo: etapa === "emitida" ? s.odoo_move_nombre || null : null,
    motivo_rechazo: etapa === "rechazada" ? s.motivo_rechazo || null : null,
    actualizado: s.procesado_at || s.rechazado_at || s.aprobado_at || s.preaprobado_at || null,
  };
}
