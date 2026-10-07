import { db } from "@/lib/db";
import {
  HORAS_EN_RUTA,
  PLAN_SERVICIOS,
  serviciosDeBase,
  type Equipo,
  type Estado,
  type Orden,
  type Prioridad,
  type Ruta,
  type Tarea,
  type TipoEquipo,
  type TipoOrden,
} from "@/lib/mantenimiento/tipos";

/**
 * Datos del mantenimiento de unidades (lib/mantenimiento/tipos).
 *
 * Dos tablas que se crean solas: `mantenimiento_equipos` (camiones y
 * montacargas de la sede) y `mantenimiento_ordenes` (cada trabajo, con sus
 * tareas en JSON). El DDL de referencia está en sql/mantenimiento_unidades.sql.
 *
 * Los camiones salen del catálogo de Unidades (`seguridad_catalogo_unidades`,
 * las placas que ya usa el despacho): al listar, toda placa que todavía no
 * esté aquí se agrega como camión. Los montacargas no tienen placa y se dan de
 * alta en esta sección.
 *
 * Qué camión está en ruta sale del despacho de mercancía
 * (`seguridad_mercancia`): un egreso por ruta con su placa. No se guarda
 * aquí; lo único propio es `regreso_at`, cuando Almacén marca que volvió.
 */

let tablasListas = false;
export async function asegurarTablas() {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mantenimiento_equipos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cids INT NULL,
      tipo ENUM('camion','montacargas') NOT NULL DEFAULT 'camion',
      codigo VARCHAR(50) NOT NULL,
      descripcion VARCHAR(200) NULL,
      medidor INT NULL,
      proximo_servicio DATE NULL,
      activo TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(200) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_mant_equipos_cids (cids, activo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mantenimiento_ordenes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      equipo_id INT NOT NULL,
      cids INT NULL,
      tipo ENUM('preventivo','correctivo') NOT NULL,
      prioridad ENUM('baja','media','alta') NOT NULL DEFAULT 'media',
      titulo VARCHAR(200) NOT NULL,
      detalle TEXT NULL,
      estado ENUM('reportado','en_taller','listo','cerrado') NOT NULL DEFAULT 'reportado',
      medidor INT NULL,
      tareas_json TEXT NULL,
      responsable VARCHAR(200) NULL,
      costo DECIMAL(12,2) NULL,
      notas_cierre TEXT NULL,
      reportado_por VARCHAR(200) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      iniciado_por VARCHAR(200) NULL,
      iniciado_at DATETIME NULL,
      terminado_por VARCHAR(200) NULL,
      terminado_at DATETIME NULL,
      cerrado_por VARCHAR(200) NULL,
      cerrado_at DATETIME NULL,
      KEY idx_mant_ordenes_equipo (equipo_id, estado),
      KEY idx_mant_ordenes_cids (cids, estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Columnas que se agregaron después: una base que ya tenía la tabla las
  // recibe aquí. MySQL no tiene ADD COLUMN IF NOT EXISTS, así que se mira antes.
  const [columnas] = await db.execute("SHOW COLUMNS FROM mantenimiento_equipos");
  const hay = new Set((columnas as any[]).map((c) => String(c.Field)));
  const nuevas: Array<[string, string]> = [
    ["regreso_at", "DATETIME NULL"],
    ["intervalo_dias", "INT NULL"],
    ["intervalo_medidor", "INT NULL"],
    ["ultimo_servicio_at", "DATE NULL"],
    ["ultimo_servicio_medidor", "INT NULL"],
    ["servicios_json", "TEXT NULL"],
  ];
  for (const [nombre, tipo] of nuevas) {
    if (!hay.has(nombre)) await db.execute(`ALTER TABLE mantenimiento_equipos ADD COLUMN ${nombre} ${tipo}`);
  }
  tablasListas = true;
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

/** Columna DATE → "YYYY-MM-DD", sin pasar por la zona horaria del servidor. */
const soloFecha = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};

function leerTareas(json: unknown): Tarea[] {
  try {
    const lista = JSON.parse(String(json || "[]"));
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((t) => t && typeof t.texto === "string" && t.texto.trim())
      .map((t) => ({ texto: String(t.texto), hecha: t.hecha === true, por: t.por || null, at: t.at || null }));
  } catch {
    return [];
  }
}

function aOrden(f: any): Orden {
  return {
    id: Number(f.id),
    equipo_id: Number(f.equipo_id),
    tipo: f.tipo as TipoOrden,
    prioridad: f.prioridad as Prioridad,
    titulo: f.titulo,
    detalle: f.detalle || null,
    estado: f.estado as Estado,
    medidor: f.medidor === null || f.medidor === undefined ? null : Number(f.medidor),
    tareas: leerTareas(f.tareas_json),
    responsable: f.responsable || null,
    costo: f.costo === null || f.costo === undefined ? null : Number(f.costo),
    notas_cierre: f.notas_cierre || null,
    reportado_por: f.reportado_por || null,
    created_at: iso(f.created_at) || "",
    iniciado_por: f.iniciado_por || null,
    iniciado_at: iso(f.iniciado_at),
    terminado_por: f.terminado_por || null,
    terminado_at: iso(f.terminado_at),
    cerrado_por: f.cerrado_por || null,
    cerrado_at: iso(f.cerrado_at),
    ...(f.equipo_codigo ? { equipo_codigo: f.equipo_codigo, equipo_tipo: f.equipo_tipo as TipoEquipo } : {}),
  };
}

const deSede = (cids: number | null, alias = "") =>
  cids !== null ? { sql: `${alias}cids = ?`, valores: [cids] as unknown[] } : { sql: "1 = 1", valores: [] as unknown[] };

/**
 * Las placas del catálogo de Unidades que todavía no están como equipo pasan
 * a ser camiones. Si el catálogo no existe (una base sin el módulo), no hay
 * nada que traer.
 */
async function traerCamionesDelCatalogo(cids: number | null) {
  const sede = deSede(cids, "u.");
  try {
    await db.execute(
      `INSERT INTO mantenimiento_equipos (cids, tipo, codigo, descripcion, created_by)
       SELECT u.cids, 'camion', u.placa, u.descripcion, 'Catálogo de Unidades'
         FROM seguridad_catalogo_unidades u
        WHERE ${sede.sql}
          AND NOT EXISTS (
            SELECT 1 FROM mantenimiento_equipos e
             WHERE CONVERT(e.codigo USING utf8mb4) COLLATE utf8mb4_unicode_ci
                 = CONVERT(u.placa USING utf8mb4) COLLATE utf8mb4_unicode_ci
               AND e.cids <=> u.cids
          )`,
      sede.valores as any[],
    );
  } catch (e: any) {
    // Sin el catálogo (o si no se puede leer) la sección sigue con los equipos
    // que ya tiene: no traer camiones nuevos no es motivo para no abrir.
    if (e?.code !== "ER_NO_SUCH_TABLE") {
      console.error("[mantenimiento] no se pudieron traer los camiones del catálogo de Unidades:", e?.message || e);
    }
  }
}

const entero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function leerServicios(json: unknown): Record<string, number> | null {
  if (!json) return null;
  try {
    const crudo = JSON.parse(String(json));
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
    const limpio: Record<string, number> = {};
    for (const [clave, valor] of Object.entries(crudo)) {
      if (Number.isFinite(Number(valor))) limpio[clave] = Number(valor);
    }
    return limpio;
  } catch {
    return null;
  }
}

/**
 * Qué dice el despacho de cada camión: cargando en el portón, o en ruta (un
 * egreso por ruta aprobado después del último regreso, en las últimas
 * HORAS_EN_RUTA horas). Y cuántas rutas hizo en 30 días. Si el módulo de
 * mercancía no está (o le falta una columna), no hay rutas que mostrar.
 */
async function rutasPorPlaca(
  cids: number | null,
  regresos: Map<string, Date | null>,
): Promise<{ rutas: Map<string, Ruta>; conteo: Map<string, number> }> {
  const rutas = new Map<string, Ruta>();
  const conteo = new Map<string, number>();
  const sede = deSede(cids);
  try {
    const [filas] = await db.execute(
      `SELECT placa_vehiculo, chofer_nombre, odoo_picking_name, contraparte, etapa, despachado,
              verificado_at, despacho_asignado_at
         FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND tipo_entrega = 'ruta' AND placa_vehiculo IS NOT NULL AND ${sede.sql}
          AND (etapa = 'por_verificar'
               OR (despachado = 1 AND verificado_at >= NOW() - INTERVAL ${HORAS_EN_RUTA} HOUR))
        ORDER BY id ASC`,
      sede.valores as any[],
    );
    for (const f of filas as any[]) {
      const placa = String(f.placa_vehiculo).toUpperCase();
      const salio = Number(f.despachado) === 1 && f.etapa !== "por_verificar";
      if (salio) {
        const regreso = regresos.get(placa);
        if (regreso && new Date(f.verificado_at).getTime() <= regreso.getTime()) continue;
      }
      const estado: Ruta["estado"] = salio ? "en_ruta" : "cargando";
      const previa = rutas.get(placa);
      // En ruta pesa más que cargando: si ya salió con algo, está en la calle.
      const ruta: Ruta =
        previa && (previa.estado === "en_ruta" || estado === "cargando")
          ? previa
          : { estado, desde: null, chofer: null, ordenes: previa?.estado === estado ? previa.ordenes : [] };
      if (ruta.estado === estado) {
        ruta.desde ||= iso(salio ? f.verificado_at : f.despacho_asignado_at);
        ruta.chofer ||= f.chofer_nombre || null;
        ruta.ordenes.push({ orden: f.odoo_picking_name || "—", cliente: f.contraparte || null });
      }
      rutas.set(placa, ruta);
    }
    const [cuenta] = await db.execute(
      `SELECT placa_vehiculo, COUNT(*) AS n
         FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND tipo_entrega = 'ruta' AND placa_vehiculo IS NOT NULL AND ${sede.sql}
          AND despachado = 1 AND verificado_at >= NOW() - INTERVAL 30 DAY
        GROUP BY placa_vehiculo`,
      sede.valores as any[],
    );
    for (const f of cuenta as any[]) conteo.set(String(f.placa_vehiculo).toUpperCase(), Number(f.n));
  } catch (e: any) {
    if (e?.code !== "ER_NO_SUCH_TABLE") {
      console.error("[mantenimiento] no se pudieron leer las rutas del despacho:", e?.message || e);
    }
  }
  return { rutas, conteo };
}

/**
 * La unidad está en el taller (o lista, sin recibir): el despacho no la puede
 * mandar a ruta. Devuelve el trabajo que la tiene parada, o null. Sin las
 * tablas de mantenimiento no hay nada que la frene.
 */
export async function unidadEnTaller(placa: string, cids: number | null): Promise<string | null> {
  try {
    const [filas] = await db.execute(
      `SELECT o.titulo
         FROM mantenimiento_ordenes o
         JOIN mantenimiento_equipos e ON e.id = o.equipo_id
        WHERE e.codigo = ? AND e.cids <=> ? AND e.activo = 1 AND o.estado IN ('en_taller', 'listo')
        LIMIT 1`,
      [placa, cids],
    );
    return (filas as any[])[0]?.titulo ?? null;
  } catch (e: any) {
    if (e?.code !== "ER_NO_SUCH_TABLE") {
      console.error("[mantenimiento] no se pudo revisar si la unidad está en el taller:", e?.message || e);
    }
    return null;
  }
}

/** Equipos de la sede con su orden abierta, y las últimas órdenes cerradas. */
export async function listar(cids: number | null): Promise<{ equipos: Equipo[]; historial: Orden[] }> {
  await asegurarTablas();
  await traerCamionesDelCatalogo(cids);

  const sede = deSede(cids);
  const [equipos] = await db.execute(
    `SELECT id, tipo, codigo, descripcion, medidor, proximo_servicio, regreso_at,
            intervalo_dias, intervalo_medidor, ultimo_servicio_at, ultimo_servicio_medidor, servicios_json
       FROM mantenimiento_equipos
      WHERE activo = 1 AND ${sede.sql}
      ORDER BY tipo ASC, codigo ASC`,
    sede.valores as any[],
  );
  const [abiertas] = await db.execute(
    `SELECT * FROM mantenimiento_ordenes WHERE estado <> 'cerrado' AND ${sede.sql} ORDER BY id ASC`,
    sede.valores as any[],
  );
  const sedeO = deSede(cids, "o.");
  const [cerradas] = await db.execute(
    `SELECT o.*, e.codigo AS equipo_codigo, e.tipo AS equipo_tipo
       FROM mantenimiento_ordenes o
       JOIN mantenimiento_equipos e ON e.id = o.equipo_id
      WHERE o.estado = 'cerrado' AND ${sedeO.sql}
      ORDER BY o.cerrado_at DESC, o.id DESC
      LIMIT 60`,
    sedeO.valores as any[],
  );

  const porEquipo = new Map<number, Orden>();
  for (const f of abiertas as any[]) porEquipo.set(Number(f.equipo_id), aOrden(f));

  const regresos = new Map<string, Date | null>();
  for (const f of equipos as any[]) {
    if (f.tipo === "camion") regresos.set(String(f.codigo).toUpperCase(), f.regreso_at ? new Date(f.regreso_at) : null);
  }
  const { rutas, conteo } = await rutasPorPlaca(cids, regresos);

  // La primera vez que un equipo tiene medidor, su calendario arranca dando por
  // hecho lo anterior (serviciosDeBase), y se guarda: a partir de ahí lo que
  // se pase de su kilometraje queda vencido hasta que se marque hecho.
  for (const f of equipos as any[]) {
    if (f.medidor === null || f.medidor === undefined || f.servicios_json) continue;
    f.servicios_json = JSON.stringify(serviciosDeBase(f.tipo as TipoEquipo, Number(f.medidor)));
    try {
      await db.execute("UPDATE mantenimiento_equipos SET servicios_json = ? WHERE id = ? AND servicios_json IS NULL", [
        f.servicios_json,
        f.id,
      ]);
    } catch (e: any) {
      console.error(`[mantenimiento] no se guardó el calendario inicial del equipo ${f.id}:`, e?.message || e);
    }
  }

  return {
    equipos: (equipos as any[]).map((f) => {
      const placa = String(f.codigo).toUpperCase();
      const camion = f.tipo === "camion";
      return {
        id: Number(f.id),
        tipo: f.tipo as TipoEquipo,
        codigo: f.codigo,
        descripcion: f.descripcion || null,
        medidor: entero(f.medidor),
        proximo_servicio: soloFecha(f.proximo_servicio),
        intervalo_dias: entero(f.intervalo_dias),
        intervalo_medidor: entero(f.intervalo_medidor),
        ultimo_servicio_at: soloFecha(f.ultimo_servicio_at),
        ultimo_servicio_medidor: entero(f.ultimo_servicio_medidor),
        servicios: leerServicios(f.servicios_json),
        orden: porEquipo.get(Number(f.id)) || null,
        ruta: (camion && rutas.get(placa)) || null,
        rutas_30d: (camion && conteo.get(placa)) || 0,
      };
    }),
    historial: (cerradas as any[]).map(aOrden),
  };
}

export async function crearEquipo(d: {
  cids: number;
  tipo: TipoEquipo;
  codigo: string;
  descripcion: string | null;
  medidor: number | null;
  quien: string;
}): Promise<"ok" | "repetido"> {
  await asegurarTablas();
  const [ya] = await db.execute(
    "SELECT id FROM mantenimiento_equipos WHERE codigo = ? AND cids = ? AND activo = 1 LIMIT 1",
    [d.codigo, d.cids],
  );
  if ((ya as any[]).length > 0) return "repetido";
  await db.execute(
    `INSERT INTO mantenimiento_equipos (cids, tipo, codigo, descripcion, medidor, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [d.cids, d.tipo, d.codigo, d.descripcion, d.medidor, d.quien],
  );
  return "ok";
}

/** El equipo, si es de la sede. */
export async function equipoDeSede(id: number, cids: number): Promise<{ id: number; tipo: TipoEquipo } | null> {
  await asegurarTablas();
  const [filas] = await db.execute(
    "SELECT id, tipo FROM mantenimiento_equipos WHERE id = ? AND cids = ? AND activo = 1 LIMIT 1",
    [id, cids],
  );
  const f = (filas as any[])[0];
  return f ? { id: Number(f.id), tipo: f.tipo as TipoEquipo } : null;
}

export async function crearOrden(d: {
  cids: number;
  equipoId: number;
  tipo: TipoOrden;
  prioridad: Prioridad;
  titulo: string;
  detalle: string | null;
  medidor: number | null;
  tareas: Tarea[];
  quien: string;
}): Promise<"ok" | "ya_tiene"> {
  // Una orden abierta por equipo: se revisa y se inserta en una sola sentencia,
  // para que dos personas reportando a la vez no dejen dos.
  const [res] = await db.execute(
    `INSERT INTO mantenimiento_ordenes
       (equipo_id, cids, tipo, prioridad, titulo, detalle, medidor, tareas_json, reportado_por)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
       FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM mantenimiento_ordenes WHERE equipo_id = ? AND estado <> 'cerrado'
      )`,
    [d.equipoId, d.cids, d.tipo, d.prioridad, d.titulo, d.detalle, d.medidor, JSON.stringify(d.tareas), d.quien, d.equipoId],
  );
  return Number((res as any)?.affectedRows || 0) === 1 ? "ok" : "ya_tiene";
}

/** La orden, si es de la sede. */
export async function ordenDeSede(id: number, cids: number): Promise<Orden | null> {
  await asegurarTablas();
  const [filas] = await db.execute("SELECT * FROM mantenimiento_ordenes WHERE id = ? AND cids = ? LIMIT 1", [id, cids]);
  const f = (filas as any[])[0];
  return f ? aOrden(f) : null;
}

/**
 * Cambia la orden solo si sigue en el estado esperado: si otra persona ya la
 * movió, devuelve false y la pantalla se refresca con lo que hay.
 */
export async function actualizarOrden(id: number, desde: Estado, set: string, valores: unknown[]): Promise<boolean> {
  const [res] = await db.execute(`UPDATE mantenimiento_ordenes SET ${set} WHERE id = ? AND estado = ?`, [
    ...valores,
    id,
    desde,
  ] as any[]);
  return Number((res as any)?.affectedRows || 0) === 1;
}

/**
 * Al cerrar: el equipo queda con el medidor del trabajo. Si fue un preventivo,
 * queda anotado como el último servicio y el próximo se programa solo con el
 * plan del equipo (hoy + intervalo_dias), salvo que se haya indicado una
 * fecha. Un correctivo no mueve el plan preventivo.
 */
export async function actualizarEquipoAlCerrar(
  equipoId: number,
  d: { medidor: number | null; proximo: string | null; preventivo: boolean },
) {
  await db.execute(
    `UPDATE mantenimiento_equipos
        SET medidor = COALESCE(?, medidor),
            proximo_servicio = COALESCE(
              ?,
              IF(? = 1 AND intervalo_dias IS NOT NULL, DATE_ADD(CURDATE(), INTERVAL intervalo_dias DAY), NULL),
              IF(? = 1, NULL, proximo_servicio)
            ),
            ultimo_servicio_at = IF(? = 1, CURDATE(), ultimo_servicio_at),
            ultimo_servicio_medidor = IF(? = 1, COALESCE(?, medidor, ultimo_servicio_medidor), ultimo_servicio_medidor)
      WHERE id = ?`,
    [d.medidor, d.proximo, d.preventivo ? 1 : 0, d.preventivo ? 1 : 0, d.preventivo ? 1 : 0, d.preventivo ? 1 : 0, d.medidor, equipoId],
  );
}

/** El camión volvió de la ruta: deja de estar "en ruta", con su kilometraje si se anotó. */
export async function marcarRegreso(equipoId: number, medidor: number | null) {
  await db.execute(
    "UPDATE mantenimiento_equipos SET regreso_at = NOW(), medidor = COALESCE(?, medidor) WHERE id = ?",
    [medidor, equipoId],
  );
}

/** El plan preventivo del equipo, y la fecha del próximo servicio si se indica. */
export async function guardarPlan(
  equipoId: number,
  d: { intervaloDias: number | null; intervaloMedidor: number | null; proximo: string | null | undefined; medidor: number | null },
) {
  await db.execute(
    `UPDATE mantenimiento_equipos
        SET intervalo_dias = ?, intervalo_medidor = ?, medidor = COALESCE(?, medidor)
            ${d.proximo !== undefined ? ", proximo_servicio = ?" : ""}
      WHERE id = ?`,
    [d.intervaloDias, d.intervaloMedidor, d.medidor, ...(d.proximo !== undefined ? [d.proximo] : []), equipoId],
  );
}

/** El kilometraje (u horas) de hoy. El calendario se arma solo al listar. */
export async function guardarMedidor(equipoId: number, medidor: number) {
  await db.execute("UPDATE mantenimiento_equipos SET medidor = ? WHERE id = ?", [medidor, equipoId]);
}

/**
 * Un servicio del calendario se hizo: queda anotado al medidor de hoy y le
 * vuelve a tocar un intervalo después. "sin_medidor" si el equipo todavía no
 * tiene kilometraje; "desconocido" si esa clave no es de su plan.
 */
export async function marcarServicioHecho(
  equipoId: number,
  tipo: TipoEquipo,
  clave: string,
): Promise<"ok" | "sin_medidor" | "desconocido"> {
  if (!PLAN_SERVICIOS[tipo].some((p) => p.clave === clave)) return "desconocido";
  const [filas] = await db.execute("SELECT medidor, servicios_json FROM mantenimiento_equipos WHERE id = ?", [equipoId]);
  const f = (filas as any[])[0];
  if (!f || f.medidor === null || f.medidor === undefined) return "sin_medidor";
  const servicios = leerServicios(f.servicios_json) || serviciosDeBase(tipo, Number(f.medidor));
  servicios[clave] = Number(f.medidor);
  await db.execute("UPDATE mantenimiento_equipos SET servicios_json = ? WHERE id = ?", [JSON.stringify(servicios), equipoId]);
  return "ok";
}
