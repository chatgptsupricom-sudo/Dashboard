import { db } from "@/lib/db";
import { almacenSede, cachear, costos, disponible, hoyCaracas, leerTodo, ultimaVenta } from "@/lib/compras/datosOdoo";
import { ventasPorDia } from "@/lib/compras/historial";
import { claveMarca, SIN_MARCA } from "@/lib/metas-marca/marcas";
import {
  ESTADOS_ABIERTOS,
  INICIO_SEGUIMIENTO,
  calcularPlan,
  colorDe,
  colorDesde,
  diasEntre,
  estadoPlanHoy,
  inicioSemana,
  mesesSeguimiento,
  referenciaSinVenta,
  sumarDias,
  vendidasEntre,
  type EstadoSolicitud,
  type FichaProducto,
  type PlanBase,
} from "@/lib/rotacion-inventario/tipos";

/**
 * Datos de la Rotación de inventario (lib/rotacion-inventario/tipos.ts tiene
 * las reglas). De Odoo, con las mismas lecturas de Compras para que un número
 * salga igual allá y aquí (lib/compras/datosOdoo.ts): stock del almacén
 * principal de la sede (Existencias + Entrada), costo de la sede, última venta
 * sin notas de crédito ni intercompañía y ventas netas por día desde abril.
 *
 * En la MySQL del panel (tablas que se crean solas; referencia
 * sql/rotacion_inventario.sql):
 * - `rotacion_planes`: el plan de 90 días de cada producto y sede.
 * - `rotacion_solicitudes`, `rotacion_solicitud_lineas`,
 *   `rotacion_solicitud_eventos`: las solicitudes de apoyo a las marcas
 *   (lib/rotacion-inventario/solicitudes.ts).
 * - `rotacion_contactos_marca`: a quién se le escribe en cada marca.
 *
 * `sincronizar()` (al abrir la pantalla, a lo sumo cada 10 min por sede, y en
 * el cron diario de server.js) abre y cierra los planes y arma solas las
 * solicitudes "por enviar" de lo que pasó a rojo. Escribe con `db.query`
 * directo (no `query()`) para no llenar `system_audit_log` con lo automático.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

let tablas: Promise<void> | null = null;

export function asegurarTablas(): Promise<void> {
  if (!tablas) {
    tablas = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS rotacion_planes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        product_id INT NOT NULL,
        inicio DATE NOT NULL,
        unidades_inicio DECIMAL(14,2) NOT NULL,
        costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
        estado VARCHAR(12) NOT NULL DEFAULT 'activo',
        cerrado_el DATE NULL,
        creado_por VARCHAR(255) NULL,
        motivo VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_plan (company_id, product_id, inicio),
        INDEX idx_estado (company_id, estado)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS rotacion_solicitudes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        marca VARCHAR(120) NOT NULL,
        marca_nombre VARCHAR(255) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'por_enviar',
        creada_auto TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        creado_por VARCHAR(255) NULL,
        enviada_el DATETIME NULL,
        enviada_por VARCHAR(255) NULL,
        enviada_a TEXT NULL,
        canal VARCHAR(10) NULL,
        respuesta_el DATE NULL,
        respuesta TEXT NULL,
        tipos_apoyo VARCHAR(255) NULL,
        monto_apoyo DECIMAL(14,2) NULL,
        accion_acordada TEXT NULL,
        acordada_el DATE NULL,
        notas TEXT NULL,
        cerrada_el DATE NULL,
        updated_at DATETIME NULL,
        updated_por VARCHAR(255) NULL,
        INDEX idx_marca (company_id, marca, estado)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS rotacion_solicitud_lineas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitud_id INT NOT NULL,
        company_id INT NOT NULL,
        product_id INT NOT NULL,
        codigo VARCHAR(120) NULL,
        nombre VARCHAR(500) NULL,
        categoria VARCHAR(255) NULL,
        unidades DECIMAL(14,2) NOT NULL DEFAULT 0,
        costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
        valor_costo DECIMAL(14,2) NOT NULL DEFAULT 0,
        dias_sin_venta INT NOT NULL DEFAULT 0,
        ultima_venta DATE NULL,
        fecha_rojo DATE NULL,
        origen VARCHAR(10) NOT NULL DEFAULT 'auto',
        excluida TINYINT(1) NOT NULL DEFAULT 0,
        exclusion VARCHAR(10) NULL,
        apoyo_unitario DECIMAL(14,4) NULL,
        precio_remate DECIMAL(14,4) NULL,
        accion VARCHAR(12) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_linea (solicitud_id, product_id),
        INDEX idx_producto (company_id, product_id)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS rotacion_solicitud_eventos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitud_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        usuario VARCHAR(255) NULL,
        accion VARCHAR(40) NOT NULL,
        detalle TEXT NULL,
        INDEX idx_solicitud (solicitud_id)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS rotacion_contactos_marca (
        id INT AUTO_INCREMENT PRIMARY KEY,
        marca VARCHAR(120) NOT NULL,
        company_id INT NOT NULL DEFAULT 0,
        nombre VARCHAR(255) NULL,
        correos TEXT NOT NULL,
        cc TEXT NULL,
        notas TEXT NULL,
        updated_at DATETIME NULL,
        updated_por VARCHAR(255) NULL,
        UNIQUE KEY uk_contacto (marca, company_id)
      )`);
    })();
    tablas.catch(() => {
      tablas = null;
    });
  }
  return tablas;
}

// ---------------------------------------------------------------------------
// Odoo
// ---------------------------------------------------------------------------

export type FichaBase = Omit<FichaProducto, "plan" | "solicitud">;

export interface DatosSede {
  hoy: string;
  meses: string[];
  fichas: Map<number, FichaBase>;
  /** Ventas netas por producto y día desde el inicio del seguimiento. */
  ventas: Map<number, Map<string, number>>;
}

async function infoProductos(ids: number[]) {
  const mapa = new Map<number, { codigo: string; nombre: string; marca: string; categoria: string }>();
  for (let i = 0; i < ids.length; i += 2000) {
    const filas = await leerTodo(
      "product.product",
      [["id", "in", ids.slice(i, i + 2000)]],
      ["id", "default_code", "name", "categ_id", "spiff_brand_id"],
      // Un producto archivado con stock también está parado.
      { context: { active_test: false } },
    );
    for (const p of filas) {
      mapa.set(p.id, {
        codigo: String(p.default_code || "").trim(),
        nombre: String(p.name || "").trim(),
        marca: p.spiff_brand_id ? String(p.spiff_brand_id[1] || "").trim() : SIN_MARCA,
        categoria: (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría",
      });
    }
  }
  return mapa;
}

/** Productos con unidades disponibles en el almacén principal de la sede, con su semáforo. */
export function datosSede(companyId: number): Promise<DatosSede> {
  const hoy = hoyCaracas();
  return cachear(`rotacion|${companyId}|${hoy}`, async () => {
    const meses = mesesSeguimiento(hoy);
    const [almacen, ultima, costo, ventasDia] = await Promise.all([
      almacenSede(companyId),
      ultimaVenta(companyId),
      costos(companyId),
      ventasPorDia(companyId, INICIO_SEGUIMIENTO, hoy),
    ]);
    const ids = [...almacen.stock.entries()].filter(([, s]) => disponible(s) > 0).map(([id]) => id);
    const info = await infoProductos(ids);
    const fichas = new Map<number, FichaBase>();
    for (const id of ids) {
      const s = almacen.stock.get(id)!;
      const p = info.get(id);
      if (!p) continue; // servicio o producto borrado
      const disp = disponible(s);
      const c = costo.get(id) ?? 0;
      const ult = ultima.get(id) ?? null;
      const referencia = referenciaSinVenta(ult, s.enStockDesde, hoy);
      const diasSinVenta = Math.max(0, diasEntre(referencia, hoy));
      const color = colorDe(diasSinVenta);
      const porDia = ventasDia.porProducto.get(id);
      const vendidasPorMes = meses.map((m) => vendidasEntre(porDia, `${m}-01`, `${m}-31`));
      fichas.set(id, {
        companyId,
        productoId: id,
        codigo: p.codigo,
        nombre: p.nombre,
        marca: p.marca,
        claveMarca: claveMarca(p.marca),
        categoria: p.categoria,
        fisico: s.fisico,
        existencia: s.fisico,
        reservado: s.reservado,
        disponible: disp,
        costo: r2(c),
        valorCosto: r2(disp * c),
        ultimaVenta: ult,
        enStockDesde: s.enStockDesde,
        referencia,
        diasSinVenta,
        color,
        colorDesde: colorDesde(referencia, color),
        vendidasSeguimiento: r2(vendidasPorMes.reduce((a, b) => a + b, 0)),
        vendidasPorMes,
      });
    }
    return { hoy, meses, fichas, ventas: ventasDia.porProducto };
  });
}

// ---------------------------------------------------------------------------
// Planes y solicitudes automáticas
// ---------------------------------------------------------------------------

const filas = async (sql: string, params: any[] = []) => ((await db.query(sql, params))[0] as any[]);
const dia = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
};

function aPlanBase(f: any): PlanBase {
  return {
    id: Number(f.id),
    inicio: dia(f.inicio)!,
    unidadesInicio: Number(f.unidades_inicio) || 0,
    creadoPor: f.creado_por ?? null,
    motivo: f.motivo ?? null,
  };
}

async function planesActivos(companyId: number): Promise<Map<number, PlanBase>> {
  const r = await filas(
    `SELECT id, product_id, inicio, unidades_inicio, creado_por, motivo
       FROM rotacion_planes WHERE company_id = ? AND estado = 'activo'`,
    [companyId],
  );
  return new Map(r.map((f) => [Number(f.product_id), aPlanBase(f)]));
}

async function sincronizarPlanes(d: DatosSede, companyId: number) {
  const activos = await planesActivos(companyId);
  const cerrar: { id: number; estado: string }[] = [];
  const nuevos: any[][] = [];
  for (const f of d.fichas.values()) {
    const plan = activos.get(f.productoId);
    if (plan) {
      const vendidas = vendidasEntre(d.ventas.get(f.productoId), plan.inicio, d.hoy);
      const estado = estadoPlanHoy(plan, vendidas, f.disponible, d.hoy);
      if (estado === "activo") continue;
      cerrar.push({ id: plan.id!, estado });
    }
    nuevos.push([companyId, f.productoId, d.hoy, f.disponible, f.costo, "activo"]);
  }
  // Sin stock disponible: el plan se cumplió.
  for (const [pid, plan] of activos) if (!d.fichas.has(pid)) cerrar.push({ id: plan.id!, estado: "cumplido" });

  for (const estado of ["cumplido", "vencido"]) {
    const ids = cerrar.filter((c) => c.estado === estado).map((c) => c.id);
    for (let i = 0; i < ids.length; i += 500) {
      await db.query(`UPDATE rotacion_planes SET estado = ?, cerrado_el = ? WHERE id IN (?)`, [estado, d.hoy, ids.slice(i, i + 500)]);
    }
  }
  for (let i = 0; i < nuevos.length; i += 500) {
    await db.query(
      `INSERT IGNORE INTO rotacion_planes (company_id, product_id, inicio, unidades_inicio, costo_unitario, estado) VALUES ?`,
      [nuevos.slice(i, i + 500)],
    );
  }
}

/** Valores de una línea de solicitud con lo de hoy del producto. */
export const valoresLinea = (f: FichaBase) => [
  f.codigo,
  f.nombre.slice(0, 500),
  f.categoria.slice(0, 255),
  f.disponible,
  f.costo,
  f.valorCosto,
  f.diasSinVenta,
  f.ultimaVenta,
];

/**
 * Agrega productos a la solicitud "por enviar" de su marca en la sede (la crea
 * si no hay). Una línea que salió sola (dejó de estar en rojo) vuelve; una que
 * quitó una persona se queda fuera.
 */
export async function agregarASolicitudes(
  companyId: number,
  productos: FichaBase[],
  origen: "auto" | "manual",
  usuario: string | null,
): Promise<number[]> {
  const porMarca = new Map<string, FichaBase[]>();
  for (const f of productos) {
    if (f.claveMarca === SIN_MARCA) continue;
    const l = porMarca.get(f.claveMarca) ?? [];
    l.push(f);
    porMarca.set(f.claveMarca, l);
  }
  const tocadas: number[] = [];
  for (const [marca, lista] of porMarca) {
    let id = Number(
      (await filas(
        `SELECT id FROM rotacion_solicitudes WHERE company_id = ? AND marca = ? AND estado = 'por_enviar' ORDER BY id DESC LIMIT 1`,
        [companyId, marca],
      ))[0]?.id,
    );
    if (!id) {
      const [r]: any = await db.query(
        `INSERT INTO rotacion_solicitudes (company_id, marca, marca_nombre, estado, creada_auto, creado_por) VALUES (?, ?, ?, 'por_enviar', ?, ?)`,
        [companyId, marca, lista[0].marca, origen === "auto" ? 1 : 0, usuario],
      );
      id = Number(r.insertId);
      await db.query(
        `INSERT INTO rotacion_solicitud_eventos (solicitud_id, usuario, accion, detalle) VALUES (?, ?, 'creada', ?)`,
        [id, usuario, origen === "auto" ? "La armó el panel con los productos que pasaron a rojo." : "Creada a mano."],
      );
    }
    const valores = lista.map((f) => [id, companyId, f.productoId, ...valoresLinea(f), f.color === "rojo" ? f.colorDesde : null, origen]);
    await db.query(
      `INSERT INTO rotacion_solicitud_lineas
         (solicitud_id, company_id, product_id, codigo, nombre, categoria, unidades, costo_unitario, valor_costo,
          dias_sin_venta, ultima_venta, fecha_rojo, origen)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         excluida = IF(exclusion = 'usuario' AND VALUES(origen) = 'auto', excluida, 0),
         exclusion = IF(exclusion = 'usuario' AND VALUES(origen) = 'auto', exclusion, NULL),
         unidades = VALUES(unidades), costo_unitario = VALUES(costo_unitario), valor_costo = VALUES(valor_costo),
         dias_sin_venta = VALUES(dias_sin_venta), ultima_venta = VALUES(ultima_venta),
         fecha_rojo = COALESCE(VALUES(fecha_rojo), fecha_rojo)`,
      [valores],
    );
    if (origen === "manual") {
      await db.query(
        `INSERT INTO rotacion_solicitud_eventos (solicitud_id, usuario, accion, detalle) VALUES (?, ?, 'productos', ?)`,
        [id, usuario, `Agregó ${lista.length} producto(s): ${lista.map((f) => f.codigo || f.nombre).join(", ").slice(0, 900)}`],
      );
    }
    tocadas.push(id);
  }
  return tocadas;
}

async function sincronizarSolicitudes(d: DatosSede, companyId: number) {
  // Lo que pasó a rojo y todavía no se pidió en este paso a rojo (ni está en
  // una solicitud que se sigue trabajando con la marca).
  const pedidas = await filas(
    `SELECT l.product_id,
            MAX(GREATEST(DATE(l.created_at), COALESCE(l.fecha_rojo, '1900-01-01'))) AS ultima,
            MAX(l.excluida = 0 AND s.estado IN (?)) AS abierta
       FROM rotacion_solicitud_lineas l
       JOIN rotacion_solicitudes s ON s.id = l.solicitud_id
      WHERE l.company_id = ? AND (l.excluida = 0 OR l.exclusion = 'usuario')
      GROUP BY l.product_id`,
    [ESTADOS_ABIERTOS, companyId],
  );
  const ultimaPedida = new Map(pedidas.map((p) => [Number(p.product_id), dia(p.ultima)!]));
  const abiertas = new Set(pedidas.filter((p) => Number(p.abierta) === 1).map((p) => Number(p.product_id)));
  const nuevas = [...d.fichas.values()].filter(
    (f) =>
      f.color === "rojo" &&
      f.claveMarca !== SIN_MARCA &&
      !abiertas.has(f.productoId) &&
      !((ultimaPedida.get(f.productoId) ?? "") >= f.colorDesde),
  );
  if (nuevas.length) await agregarASolicitudes(companyId, nuevas, "auto", null);

  // Las que esperan envío se mantienen al día: lo que se vendió o salió de rojo, sale.
  const lineas = await filas(
    `SELECT l.id, l.product_id, l.origen, l.excluida, l.exclusion
       FROM rotacion_solicitud_lineas l
       JOIN rotacion_solicitudes s ON s.id = l.solicitud_id
      WHERE s.company_id = ? AND s.estado = 'por_enviar' AND (l.excluida = 0 OR l.exclusion = 'auto')`,
    [companyId],
  );
  for (const l of lineas) {
    const f = d.fichas.get(Number(l.product_id));
    const sale = !f || (l.origen === "auto" && f.color !== "rojo");
    if (sale) {
      if (!Number(l.excluida)) await db.query(`UPDATE rotacion_solicitud_lineas SET excluida = 1, exclusion = 'auto' WHERE id = ?`, [l.id]);
      continue;
    }
    await db.query(
      `UPDATE rotacion_solicitud_lineas
          SET codigo = ?, nombre = ?, categoria = ?, unidades = ?, costo_unitario = ?, valor_costo = ?,
              dias_sin_venta = ?, ultima_venta = ?
        WHERE id = ?`,
      [...valoresLinea(f), l.id],
    );
  }
}

const enCurso = new Map<number, Promise<void>>();

/** Planes y solicitudes automáticas de la sede (una a la vez por sede). */
export function sincronizar(companyId: number, d: DatosSede): Promise<void> {
  const previa = enCurso.get(companyId) ?? Promise.resolve();
  const esta = previa
    .catch(() => {})
    .then(async () => {
      await asegurarTablas();
      await sincronizarPlanes(d, companyId);
      await sincronizarSolicitudes(d, companyId);
    });
  enCurso.set(companyId, esta);
  esta.finally(() => {
    if (enCurso.get(companyId) === esta) enCurso.delete(companyId);
  }).catch(() => {});
  return esta;
}

/** Sincroniza a lo sumo cada 10 min por sede (al abrir la pantalla). */
export function sincronizarSiToca(companyId: number, d: DatosSede): Promise<void> {
  return cachear(`rotacion-sync|${companyId}|${d.hoy}`, () => sincronizar(companyId, d));
}

// ---------------------------------------------------------------------------
// Fichas completas
// ---------------------------------------------------------------------------

async function solicitudesAbiertas(companyId: number): Promise<Map<number, { id: number; estado: EstadoSolicitud }>> {
  const r = await filas(
    `SELECT l.product_id, s.id, s.estado
       FROM rotacion_solicitud_lineas l
       JOIN rotacion_solicitudes s ON s.id = l.solicitud_id
      WHERE s.company_id = ? AND l.excluida = 0 AND s.estado IN (?)
      ORDER BY s.id`,
    [companyId, ESTADOS_ABIERTOS],
  );
  return new Map(r.map((f) => [Number(f.product_id), { id: Number(f.id), estado: f.estado as EstadoSolicitud }]));
}

export interface FichasSede {
  hoy: string;
  meses: string[];
  fichas: FichaProducto[];
  avisos: string[];
}

export async function fichasDeSede(companyId: number): Promise<FichasSede> {
  const d = await datosSede(companyId);
  const avisos: string[] = [];
  let planes = new Map<number, PlanBase>();
  let abiertas = new Map<number, { id: number; estado: EstadoSolicitud }>();
  try {
    await sincronizarSiToca(companyId, d);
    [planes, abiertas] = await Promise.all([planesActivos(companyId), solicitudesAbiertas(companyId)]);
  } catch (e: any) {
    console.error(`[rotacion-inventario] sede ${companyId}:`, e?.message);
    avisos.push("No se pudo leer la base del panel: los planes salen como si empezaran hoy y no se ven las solicitudes.");
  }
  const fichas: FichaProducto[] = [];
  for (const f of d.fichas.values()) {
    const base: PlanBase = planes.get(f.productoId) ?? {
      id: null,
      inicio: d.hoy,
      unidadesInicio: f.disponible,
      creadoPor: null,
      motivo: null,
    };
    fichas.push({
      ...f,
      plan: calcularPlan(base, d.ventas.get(f.productoId), f.disponible, d.hoy),
      solicitud: abiertas.get(f.productoId) ?? null,
    });
  }
  return { hoy: d.hoy, meses: d.meses, fichas, avisos };
}

// ---------------------------------------------------------------------------
// Detalle de un producto
// ---------------------------------------------------------------------------

export async function detalleProducto(companyId: number, productoId: number) {
  const { fichas, meses, hoy } = await fichasDeSede(companyId);
  const ficha = fichas.find((f) => f.productoId === productoId) ?? null;
  const d = await datosSede(companyId);
  const porDia = d.ventas.get(productoId);
  // Semanas (lunes) desde el inicio del plan o, si no hay ficha, las últimas 13.
  const semanas: { semana: string; vendidas: number; meta: number | null }[] = [];
  const desde = ficha ? ficha.plan.inicio : hoy;
  let lunes = inicioSemana(desde < hoy ? desde : hoy);
  if (!ficha) lunes = sumarDias(lunes, -7 * 12);
  while (lunes <= hoy) {
    semanas.push({
      semana: lunes,
      vendidas: vendidasEntre(porDia, lunes, sumarDias(lunes, 6)),
      meta: ficha ? ficha.plan.metaSemanal : null,
    });
    lunes = sumarDias(lunes, 7);
  }
  let planes: any[] = [];
  let solicitudes: any[] = [];
  try {
    await asegurarTablas();
    planes = (await filas(
      `SELECT id, inicio, unidades_inicio, costo_unitario, estado, cerrado_el, creado_por, motivo
         FROM rotacion_planes WHERE company_id = ? AND product_id = ? ORDER BY inicio DESC`,
      [companyId, productoId],
    )).map((p) => ({
      id: Number(p.id),
      inicio: dia(p.inicio),
      unidadesInicio: Number(p.unidades_inicio),
      estado: p.estado,
      cerradoEl: dia(p.cerrado_el),
      creadoPor: p.creado_por,
      motivo: p.motivo,
      vendidas: vendidasEntre(porDia, dia(p.inicio)!, dia(p.cerrado_el) ?? hoy),
    }));
    solicitudes = (await filas(
      `SELECT s.id, s.estado, s.created_at, s.enviada_el, s.accion_acordada, l.excluida, l.apoyo_unitario, l.precio_remate, l.accion
         FROM rotacion_solicitud_lineas l JOIN rotacion_solicitudes s ON s.id = l.solicitud_id
        WHERE l.company_id = ? AND l.product_id = ? ORDER BY s.id DESC`,
      [companyId, productoId],
    )).map((s) => ({
      id: Number(s.id),
      estado: s.estado,
      creada: dia(s.created_at),
      enviada: dia(s.enviada_el),
      accionAcordada: s.accion_acordada,
      excluida: !!Number(s.excluida),
      apoyoUnitario: s.apoyo_unitario === null ? null : Number(s.apoyo_unitario),
      precioRemate: s.precio_remate === null ? null : Number(s.precio_remate),
      accion: s.accion,
    }));
  } catch (e: any) {
    console.error("[rotacion-inventario] detalle:", e?.message);
  }
  return { hoy, meses, ficha, semanas, planes, solicitudes };
}

/** Reinicia el plan de 90 días de un producto con lo disponible hoy. */
export async function reiniciarPlan(companyId: number, productoId: number, usuario: string, motivo: string) {
  const d = await datosSede(companyId);
  const f = d.fichas.get(productoId);
  if (!f) throw Object.assign(new Error("El producto no tiene unidades disponibles en esa sede."), { status: 400 });
  await asegurarTablas();
  await db.query(
    `UPDATE rotacion_planes SET estado = 'reiniciado', cerrado_el = ? WHERE company_id = ? AND product_id = ? AND estado = 'activo'`,
    [d.hoy, companyId, productoId],
  );
  // Un reinicio el mismo día que arrancó el plan reemplaza esa fila.
  await db.query(
    `INSERT INTO rotacion_planes (company_id, product_id, inicio, unidades_inicio, costo_unitario, estado, creado_por, motivo)
     VALUES (?, ?, ?, ?, ?, 'activo', ?, ?)
     ON DUPLICATE KEY UPDATE unidades_inicio = VALUES(unidades_inicio), costo_unitario = VALUES(costo_unitario),
       estado = 'activo', cerrado_el = NULL, creado_por = VALUES(creado_por), motivo = VALUES(motivo)`,
    [companyId, productoId, d.hoy, f.disponible, f.costo, usuario, motivo.slice(0, 500)],
  );
}
