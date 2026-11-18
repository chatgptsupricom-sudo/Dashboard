import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { agregarASolicitudes, asegurarTablas, datosSede } from "@/lib/rotacion-inventario/datos";
import {
  ACCIONES_LINEA,
  ESTADOS_SOLICITUD,
  LIMITE_AMARILLO,
  TIPOS_APOYO,
  etiquetaMes,
  folio,
  nombreSede,
  vendidasEntre,
  type AccionLinea,
  type ContactoMarca,
  type EstadoSolicitud,
  type EventoSolicitud,
  type LineaSolicitud,
  type Solicitud,
  type TipoApoyo,
} from "@/lib/rotacion-inventario/tipos";

/**
 * Solicitudes de apoyo a las marcas (lib/rotacion-inventario/tipos.ts).
 *
 * El panel arma solo una solicitud "por enviar" por marca y sede con lo que
 * pasa a rojo (datos.ts, `sincronizar`). Una persona la revisa y la envía: por
 * el flujo de n8n "Rotación - Solicitud a la marca"
 * (`N8N_ROTACION_WEBHOOK_URL`, importable desde
 * scripts/n8n-rotacion-solicitud-marca.json), con el Excel adjunto, o la
 * marca como enviada si la mandó por su cuenta. Después se anota la
 * respuesta de la marca, el apoyo (tipo y monto), la acción acordada y, por
 * producto, el apoyo por unidad, el precio de remate y qué se hace con él.
 * Cada cambio queda en `rotacion_solicitud_eventos`.
 */

const filas = async (sql: string, params: any[] = []) => ((await db.query(sql, params))[0] as any[]);
const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
const dia = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
};
const fechaHora = (v: any): string | null => (v ? (v instanceof Date ? v.toISOString() : String(v)) : null);

export class ErrorSolicitud extends Error {
  constructor(mensaje: string, public status = 400) {
    super(mensaje);
  }
}

function aSolicitud(f: any): Solicitud {
  return {
    id: Number(f.id),
    companyId: Number(f.company_id),
    marca: f.marca,
    marcaNombre: f.marca_nombre,
    estado: f.estado,
    creadaAuto: !!Number(f.creada_auto),
    createdAt: fechaHora(f.created_at)!,
    creadoPor: f.creado_por ?? null,
    enviadaEl: fechaHora(f.enviada_el),
    enviadaPor: f.enviada_por ?? null,
    enviadaA: f.enviada_a ?? null,
    canal: f.canal ?? null,
    respuestaEl: dia(f.respuesta_el),
    respuesta: f.respuesta ?? null,
    tiposApoyo: String(f.tipos_apoyo || "").split(",").filter(Boolean) as TipoApoyo[],
    montoApoyo: num(f.monto_apoyo),
    accionAcordada: f.accion_acordada ?? null,
    acordadaEl: dia(f.acordada_el),
    notas: f.notas ?? null,
    cerradaEl: dia(f.cerrada_el),
    updatedAt: fechaHora(f.updated_at),
    productos: Number(f.productos) || 0,
    unidades: Number(f.unidades) || 0,
    valorCosto: Number(f.valor) || 0,
  };
}

function aLinea(f: any): LineaSolicitud {
  return {
    id: Number(f.id),
    companyId: Number(f.company_id),
    productoId: Number(f.product_id),
    codigo: f.codigo || "",
    nombre: f.nombre || "",
    categoria: f.categoria || "",
    unidades: Number(f.unidades) || 0,
    costoUnitario: Number(f.costo_unitario) || 0,
    valorCosto: Number(f.valor_costo) || 0,
    diasSinVenta: Number(f.dias_sin_venta) || 0,
    ultimaVenta: dia(f.ultima_venta),
    fechaRojo: dia(f.fecha_rojo),
    excluida: !!Number(f.excluida),
    exclusion: f.exclusion ?? null,
    apoyoUnitario: num(f.apoyo_unitario),
    precioRemate: num(f.precio_remate),
    accion: f.accion ?? null,
  };
}

const SELECT_SOLICITUD = `
  SELECT s.*,
         COALESCE(SUM(l.excluida = 0), 0) AS productos,
         COALESCE(SUM(IF(l.excluida = 0, l.unidades, 0)), 0) AS unidades,
         COALESCE(SUM(IF(l.excluida = 0, l.valor_costo, 0)), 0) AS valor
    FROM rotacion_solicitudes s
    LEFT JOIN rotacion_solicitud_lineas l ON l.solicitud_id = s.id`;

/** Solicitudes de las sedes; `marcas` (claves) limita a esas marcas (null = todas). */
export async function listarSolicitudes(sedes: number[], marcas: string[] | null): Promise<Solicitud[]> {
  await asegurarTablas();
  if (!sedes.length || (marcas && !marcas.length)) return [];
  const r = await filas(
    `${SELECT_SOLICITUD}
      WHERE s.company_id IN (?) ${marcas ? "AND s.marca IN (?)" : ""}
      GROUP BY s.id
      ORDER BY FIELD(s.estado, 'por_enviar', 'enviada', 'respondida', 'acordada', 'liquidando', 'rechazada', 'cerrada', 'anulada'), valor DESC, s.id DESC`,
    marcas ? [sedes, marcas] : [sedes],
  );
  // Un borrador que se quedó sin productos (todo se vendió) no se muestra.
  return r.map(aSolicitud).filter((s) => s.productos > 0 || s.estado !== "por_enviar");
}

export async function leerSolicitud(id: number): Promise<Solicitud | null> {
  await asegurarTablas();
  const r = await filas(`${SELECT_SOLICITUD} WHERE s.id = ? GROUP BY s.id`, [id]);
  return r[0] ? aSolicitud(r[0]) : null;
}

export async function detalleSolicitud(id: number) {
  const solicitud = await leerSolicitud(id);
  if (!solicitud) return null;
  const [lineas, eventos] = await Promise.all([
    filas(`SELECT * FROM rotacion_solicitud_lineas WHERE solicitud_id = ? ORDER BY excluida, valor_costo DESC`, [id]),
    filas(`SELECT * FROM rotacion_solicitud_eventos WHERE solicitud_id = ? ORDER BY id DESC`, [id]),
  ]);
  const lista = lineas.map(aLinea);
  const avisos: string[] = [];
  // Cómo va la liquidación: lo disponible hoy y lo vendido desde el acuerdo (o el envío).
  try {
    const d = await datosSede(solicitud.companyId);
    const desde = solicitud.acordadaEl ?? dia(solicitud.enviadaEl);
    for (const l of lista) {
      l.disponibleHoy = d.fichas.get(l.productoId)?.disponible ?? 0;
      l.vendidasDesdeAcuerdo = desde ? vendidasEntre(d.ventas.get(l.productoId), desde, d.hoy) : null;
    }
  } catch (e: any) {
    console.error("[rotacion-inventario] detalle solicitud:", e?.message);
    avisos.push("Odoo no respondió: no se ve lo disponible hoy ni lo vendido desde el acuerdo.");
  }
  const contactos = await contactosDe(solicitud.marca, solicitud.companyId);
  return {
    solicitud,
    lineas: lista,
    eventos: eventos.map(
      (e): EventoSolicitud => ({ id: Number(e.id), createdAt: fechaHora(e.created_at)!, usuario: e.usuario, accion: e.accion, detalle: e.detalle }),
    ),
    contactos,
    avisos,
  };
}

async function evento(id: number, usuario: string | null, accion: string, detalle: string | null) {
  await db.query(`INSERT INTO rotacion_solicitud_eventos (solicitud_id, usuario, accion, detalle) VALUES (?, ?, ?, ?)`, [
    id,
    usuario,
    accion,
    detalle?.slice(0, 4000) ?? null,
  ]);
}

// ---------------------------------------------------------------------------
// Cambios
// ---------------------------------------------------------------------------

export interface CambiosSolicitud {
  estado?: EstadoSolicitud;
  respuestaEl?: string | null;
  respuesta?: string | null;
  tiposApoyo?: TipoApoyo[];
  montoApoyo?: number | null;
  accionAcordada?: string | null;
  acordadaEl?: string | null;
  notas?: string | null;
  lineas?: { id: number; excluida?: boolean; apoyoUnitario?: number | null; precioRemate?: number | null; accion?: AccionLinea | null }[];
}

const ESTADOS_VALIDOS = ESTADOS_SOLICITUD.map((e) => e.value);
const TIPOS_VALIDOS = TIPOS_APOYO.map((t) => t.value);
const ACCIONES_VALIDAS = ACCIONES_LINEA.map((a) => a.value);
const esDia = (v: unknown) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
const texto = (v: unknown, max = 4000) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
const numeroONull = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ErrorSolicitud("Los montos tienen que ser números positivos.");
  return Math.round(n * 10000) / 10000;
};

const ETIQUETA_CAMPO: Record<string, string> = {
  estado: "Estado",
  respuesta_el: "Fecha de respuesta",
  respuesta: "Respuesta de la marca",
  tipos_apoyo: "Tipo de apoyo",
  monto_apoyo: "Monto del apoyo",
  accion_acordada: "Acción acordada",
  acordada_el: "Fecha del acuerdo",
  notas: "Notas",
};

export async function actualizarSolicitud(id: number, c: CambiosSolicitud, usuario: string) {
  const actual = await leerSolicitud(id);
  if (!actual) throw new ErrorSolicitud("La solicitud no existe.", 404);

  const sets: Record<string, any> = {};
  if (c.estado !== undefined) {
    if (!ESTADOS_VALIDOS.includes(c.estado)) throw new ErrorSolicitud("Estado inválido.");
    if (c.estado === "por_enviar" && actual.estado !== "por_enviar") throw new ErrorSolicitud("Una solicitud enviada no vuelve a «Por enviar».");
    if (c.estado !== "anulada" && c.estado !== "por_enviar" && !actual.enviadaEl && actual.estado === "por_enviar") {
      throw new ErrorSolicitud("Primero envía la solicitud a la marca (o márcala como enviada).");
    }
    sets.estado = c.estado;
    if (["cerrada", "rechazada", "anulada"].includes(c.estado) && !actual.cerradaEl) sets.cerrada_el = new Date().toISOString().slice(0, 10);
    if (!["cerrada", "rechazada", "anulada"].includes(c.estado)) sets.cerrada_el = null;
  }
  if (c.respuestaEl !== undefined) {
    if (!esDia(c.respuestaEl)) throw new ErrorSolicitud("Fecha de respuesta inválida.");
    sets.respuesta_el = c.respuestaEl;
  }
  if (c.respuesta !== undefined) sets.respuesta = texto(c.respuesta);
  if (c.tiposApoyo !== undefined) {
    const tipos = (Array.isArray(c.tiposApoyo) ? c.tiposApoyo : []).filter((t) => TIPOS_VALIDOS.includes(t));
    sets.tipos_apoyo = tipos.join(",") || null;
  }
  if (c.montoApoyo !== undefined) sets.monto_apoyo = numeroONull(c.montoApoyo);
  if (c.accionAcordada !== undefined) sets.accion_acordada = texto(c.accionAcordada);
  if (c.acordadaEl !== undefined) {
    if (!esDia(c.acordadaEl)) throw new ErrorSolicitud("Fecha del acuerdo inválida.");
    sets.acordada_el = c.acordadaEl;
  }
  if (c.notas !== undefined) sets.notas = texto(c.notas);

  // Al anotar la respuesta o el acuerdo, el estado avanza solo si no lo cambiaron a mano.
  if (c.estado === undefined && actual.estado === "enviada" && (sets.respuesta || sets.respuesta_el)) sets.estado = "respondida";
  if (c.estado === undefined && ["enviada", "respondida"].includes(actual.estado) && sets.accion_acordada) sets.estado = "acordada";
  if ((sets.estado ?? actual.estado) === "acordada" && !actual.acordadaEl && sets.acordada_el === undefined) {
    sets.acordada_el = new Date().toISOString().slice(0, 10);
  }

  const cambios: string[] = [];
  const antes: Record<string, any> = {
    estado: actual.estado,
    respuesta_el: actual.respuestaEl,
    respuesta: actual.respuesta,
    tipos_apoyo: actual.tiposApoyo.join(","),
    monto_apoyo: actual.montoApoyo,
    accion_acordada: actual.accionAcordada,
    acordada_el: actual.acordadaEl,
    notas: actual.notas,
  };
  for (const [k, v] of Object.entries(sets)) {
    if (k === "cerrada_el") continue;
    if (String(antes[k] ?? "") === String(v ?? "")) {
      delete sets[k];
      continue;
    }
    const mostrar = (x: any) =>
      k === "estado"
        ? ESTADOS_SOLICITUD.find((e) => e.value === x)?.label ?? x
        : k === "tipos_apoyo"
          ? String(x || "").split(",").filter(Boolean).map((t) => TIPOS_APOYO.find((a) => a.value === t)?.label ?? t).join(", ")
          : x;
    cambios.push(`${ETIQUETA_CAMPO[k] ?? k}: ${mostrar(antes[k]) || "—"} → ${mostrar(v) || "—"}`);
  }

  if (Object.keys(sets).length) {
    sets.updated_at = new Date();
    sets.updated_por = usuario;
    await db.query(`UPDATE rotacion_solicitudes SET ? WHERE id = ?`, [sets, id]);
  }

  if (c.lineas?.length) {
    const lineas = new Map(
      (await filas(`SELECT * FROM rotacion_solicitud_lineas WHERE solicitud_id = ?`, [id])).map((l) => [Number(l.id), aLinea(l)]),
    );
    for (const cl of c.lineas) {
      const l = lineas.get(Number(cl.id));
      if (!l) continue;
      const set: Record<string, any> = {};
      const cambio: string[] = [];
      if (cl.excluida !== undefined && cl.excluida !== l.excluida) {
        if (actual.estado !== "por_enviar" && !cl.excluida) throw new ErrorSolicitud("Solo se agregan productos antes de enviar.");
        set.excluida = cl.excluida ? 1 : 0;
        set.exclusion = cl.excluida ? "usuario" : null;
        cambio.push(cl.excluida ? "quitado de la solicitud" : "vuelve a la solicitud");
      }
      if (cl.apoyoUnitario !== undefined) {
        const v = numeroONull(cl.apoyoUnitario);
        if (v !== l.apoyoUnitario) {
          set.apoyo_unitario = v;
          cambio.push(`apoyo por unidad ${l.apoyoUnitario ?? "—"} → ${v ?? "—"}`);
        }
      }
      if (cl.precioRemate !== undefined) {
        const v = numeroONull(cl.precioRemate);
        if (v !== l.precioRemate) {
          set.precio_remate = v;
          cambio.push(`precio de remate ${l.precioRemate ?? "—"} → ${v ?? "—"}`);
        }
      }
      if (cl.accion !== undefined) {
        const v = cl.accion && ACCIONES_VALIDAS.includes(cl.accion) ? cl.accion : null;
        if (v !== l.accion) {
          set.accion = v;
          cambio.push(`acción ${ACCIONES_LINEA.find((a) => a.value === l.accion)?.label ?? "—"} → ${ACCIONES_LINEA.find((a) => a.value === v)?.label ?? "—"}`);
        }
      }
      if (!cambio.length) continue;
      await db.query(`UPDATE rotacion_solicitud_lineas SET ? WHERE id = ?`, [set, l.id]);
      cambios.push(`${l.codigo || l.nombre}: ${cambio.join(", ")}`);
    }
  }

  if (cambios.length) await evento(id, usuario, "cambio", cambios.join("\n"));
  return cambios.length;
}

// ---------------------------------------------------------------------------
// Excel para la marca
// ---------------------------------------------------------------------------

export async function excelSolicitud(id: number): Promise<{ archivo: string; buffer: Buffer }> {
  const det = await detalleSolicitud(id);
  if (!det) throw new ErrorSolicitud("La solicitud no existe.", 404);
  const { solicitud: s } = det;
  const lineas = det.lineas.filter((l) => !l.excluida);
  let meses: string[] = [];
  let ventasMes = new Map<number, number[]>();
  try {
    const d = await datosSede(s.companyId);
    meses = d.meses;
    ventasMes = new Map(lineas.map((l) => [l.productoId, d.fichas.get(l.productoId)?.vendidasPorMes ?? meses.map(() => 0)]));
  } catch {
    /* sin Odoo el Excel sale sin las ventas por mes */
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Mercancía sin rotación");
  ws.addRow([`Supricom ${nombreSede(s.companyId)} — Solicitud de apoyo para rotar inventario ${s.marcaNombre}`]).font = { bold: true, size: 14 };
  ws.addRow([`Referencia ${folio(s.id)} · ${new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}`]);
  ws.addRow([
    `Productos con más de ${LIMITE_AMARILLO} días sin venta en la sede. Apoyo solicitado: protección de precio, notas de crédito, fondos de promoción o devolución.`,
  ]);
  ws.addRow([]);
  const encabezado = [
    "Código",
    "Producto",
    "Categoría",
    "Unidades",
    "Costo unitario (USD)",
    "Valor a costo (USD)",
    "Días sin venta",
    "Última venta",
    ...meses.map((m) => `Vendidas ${etiquetaMes(m)}`),
  ];
  const fila = ws.addRow(encabezado);
  fila.font = { bold: true, color: { argb: "FFFFFFFF" } };
  fila.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  for (const l of lineas) {
    ws.addRow([
      l.codigo,
      l.nombre,
      l.categoria,
      l.unidades,
      l.costoUnitario,
      l.valorCosto,
      l.diasSinVenta,
      l.ultimaVenta ? new Date(`${l.ultimaVenta}T12:00:00Z`) : "Sin venta desde abr-2026",
      ...(ventasMes.get(l.productoId) ?? []),
    ]);
  }
  const total = ws.addRow([
    "Total",
    `${lineas.length} producto(s)`,
    "",
    lineas.reduce((a, l) => a + l.unidades, 0),
    "",
    Math.round(lineas.reduce((a, l) => a + l.valorCosto, 0) * 100) / 100,
  ]);
  total.font = { bold: true };
  encabezado.forEach((_, i) => {
    ws.getColumn(i + 1).width = [22, 50, 22, 11, 13, 14, 11, 14][i] ?? 11;
  });
  ws.getColumn(5).numFmt = "#,##0.00";
  ws.getColumn(6).numFmt = "#,##0.00";
  ws.getColumn(8).numFmt = "dd/mm/yyyy";
  ws.views = [{ state: "frozen", ySplit: 5 }];
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const marca = s.marcaNombre.replace(/[^\w-]+/g, "_");
  return { archivo: `${folio(s.id)}_${marca}_${nombreSede(s.companyId)}.xlsx`, buffer };
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

const correosDe = (v: unknown) =>
  [...new Set(String(v ?? "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

export const envioPorN8n = () => !!process.env.N8N_ROTACION_WEBHOOK_URL;

export async function enviarSolicitud(
  id: number,
  datos: { para: string; cc?: string; asunto: string; mensaje: string; manual?: boolean },
  usuario: string,
) {
  const s = await leerSolicitud(id);
  if (!s) throw new ErrorSolicitud("La solicitud no existe.", 404);
  if (s.estado !== "por_enviar") throw new ErrorSolicitud("Esta solicitud ya se envió.");
  if (s.productos === 0) throw new ErrorSolicitud("La solicitud no tiene productos.");
  const para = correosDe(datos.para);
  const cc = correosDe(datos.cc);
  if (!datos.manual) {
    if (!para.length) throw new ErrorSolicitud("Escribe al menos un correo de la marca.");
    const malos = [...para, ...cc].filter((c) => !correoValido(c));
    if (malos.length) throw new ErrorSolicitud(`Correo inválido: ${malos.join(", ")}`);
    if (!String(datos.asunto || "").trim() || !String(datos.mensaje || "").trim()) throw new ErrorSolicitud("Falta el asunto o el mensaje.");
  }

  let canal: "n8n" | "manual" = "manual";
  if (!datos.manual) {
    const url = process.env.N8N_ROTACION_WEBHOOK_URL;
    if (!url) throw new ErrorSolicitud("El envío por correo no está configurado (N8N_ROTACION_WEBHOOK_URL). Descarga el Excel y márcala como enviada.");
    const { archivo, buffer } = await excelSolicitud(id);
    const det = await detalleSolicitud(id);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: "rotacion_solicitud_marca",
        solicitud_id: s.id,
        folio: folio(s.id),
        company_id: s.companyId,
        sede: nombreSede(s.companyId),
        marca: s.marcaNombre,
        para,
        cc,
        asunto: String(datos.asunto).trim().slice(0, 300),
        mensaje: String(datos.mensaje).trim().slice(0, 10000),
        enviado_por: usuario,
        productos: (det?.lineas ?? [])
          .filter((l) => !l.excluida)
          .map((l) => ({ codigo: l.codigo, producto: l.nombre, unidades: l.unidades, valor_costo: l.valorCosto, dias_sin_venta: l.diasSinVenta })),
        adjunto: { nombre: archivo, base64: buffer.toString("base64") },
      }),
      signal: AbortSignal.timeout(30_000),
    }).catch((e) => {
      throw new ErrorSolicitud(`No se pudo llamar a n8n: ${e?.message}`, 502);
    });
    if (!res.ok) throw new ErrorSolicitud(`n8n respondió ${res.status}: la solicitud sigue «Por enviar».`, 502);
    canal = "n8n";
  }

  // Solo si sigue por enviar: dos clics no la mandan dos veces al registro.
  const [r]: any = await db.query(
    `UPDATE rotacion_solicitudes
        SET estado = 'enviada', enviada_el = NOW(), enviada_por = ?, enviada_a = ?, canal = ?, updated_at = NOW(), updated_por = ?
      WHERE id = ? AND estado = 'por_enviar'`,
    [usuario, [...para, ...cc.map((c) => `cc:${c}`)].join(", ") || null, canal, usuario, id],
  );
  if (!r.affectedRows) throw new ErrorSolicitud("Otra persona ya la envió.", 409);
  await evento(
    id,
    usuario,
    "enviada",
    canal === "n8n"
      ? `Enviada por correo a ${para.join(", ")}${cc.length ? ` (cc ${cc.join(", ")})` : ""}.\nAsunto: ${datos.asunto}`
      : `Marcada como enviada a mano${para.length ? ` (a ${para.join(", ")})` : ""}.`,
  );
}

// ---------------------------------------------------------------------------
// Agregar productos a mano
// ---------------------------------------------------------------------------

export async function agregarProductos(companyId: number, productIds: number[], usuario: string) {
  const d = await datosSede(companyId);
  const elegidos = productIds.map((id) => d.fichas.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof d.fichas.get>>[];
  if (!elegidos.length) throw new ErrorSolicitud("Ninguno de esos productos tiene unidades disponibles en la sede.");
  await asegurarTablas();
  const ids = await agregarASolicitudes(companyId, elegidos, "manual", usuario);
  if (!ids.length) throw new ErrorSolicitud("Esos productos no tienen marca en Odoo.");
  return ids;
}

// ---------------------------------------------------------------------------
// Contactos de las marcas
// ---------------------------------------------------------------------------

function aContacto(f: any): ContactoMarca {
  return {
    id: Number(f.id),
    marca: f.marca,
    companyId: Number(f.company_id),
    nombre: f.nombre ?? null,
    correos: f.correos ?? "",
    cc: f.cc ?? null,
    notas: f.notas ?? null,
  };
}

export async function listarContactos(): Promise<ContactoMarca[]> {
  await asegurarTablas();
  return (await filas(`SELECT * FROM rotacion_contactos_marca ORDER BY marca, company_id`)).map(aContacto);
}

/** El contacto de la marca para la sede (si no hay, el de todas las sedes). */
export async function contactosDe(marca: string, companyId: number): Promise<ContactoMarca | null> {
  const r = await filas(
    `SELECT * FROM rotacion_contactos_marca WHERE marca = ? AND company_id IN (0, ?) ORDER BY company_id DESC LIMIT 1`,
    [marca, companyId],
  );
  return r[0] ? aContacto(r[0]) : null;
}

export async function guardarContacto(
  c: { marca: string; companyId: number; nombre?: string | null; correos: string; cc?: string | null; notas?: string | null },
  usuario: string,
) {
  const marca = String(c.marca || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!marca) throw new ErrorSolicitud("Falta la marca.");
  if (![0, 7, 9, 10].includes(Number(c.companyId))) throw new ErrorSolicitud("Sede inválida.");
  const correos = correosDe(c.correos);
  const cc = correosDe(c.cc);
  if (!correos.length) throw new ErrorSolicitud("Escribe al menos un correo.");
  const malos = [...correos, ...cc].filter((x) => !correoValido(x));
  if (malos.length) throw new ErrorSolicitud(`Correo inválido: ${malos.join(", ")}`);
  await asegurarTablas();
  await db.query(
    `INSERT INTO rotacion_contactos_marca (marca, company_id, nombre, correos, cc, notas, updated_at, updated_por)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), correos = VALUES(correos), cc = VALUES(cc), notas = VALUES(notas),
       updated_at = NOW(), updated_por = VALUES(updated_por)`,
    [marca, Number(c.companyId), texto(c.nombre, 255), correos.join(", "), cc.join(", ") || null, texto(c.notas), usuario],
  );
}

export async function borrarContacto(id: number) {
  await asegurarTablas();
  await db.query(`DELETE FROM rotacion_contactos_marca WHERE id = ?`, [id]);
}
