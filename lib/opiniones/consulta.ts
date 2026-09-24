import { query } from "@/lib/db";
import { COMPANY_NAME } from "@/lib/gerente_venta/reporteVentas";
import { NO_ESTOY_SEGURO, type RespuestaOpinion } from "@/lib/opiniones/preguntas";

/**
 * Lectura de `auditoria_comercial_respuestas`, la tabla que llena la landing
 * pública de la encuesta (repo LandignPage-Calificaciones). La tabla la crea
 * y migra la landing, no el dashboard: por eso aquí se tolera que todavía no
 * exista (nadie respondió aún) o que le falte `sede_cid` (landing sin
 * actualizar), en vez de fallar.
 */

const TABLA = "auditoria_comercial_respuestas";
const MAX_FILAS = 2000;

// En Odoo los nombres vienen como se cargaron: "DIEGO  GUERRERO",
// "Aaron Jaramillo (v)", "EMILI BRICEÑO.". Misma limpieza que la landing.
function etiquetaEjecutivo(nombre: string): string {
  return nombre
    .replace(/\s*\(v\)\s*$/i, "")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/(^|\s)\p{L}/gu, (letra) => letra.toLocaleUpperCase("es"));
}

async function columnasDeLaTabla(): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [TABLA],
  );
  return new Set(rows.map((r: any) => String(r.c)));
}

export interface FiltroOpiniones {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD, inclusive
  /** null = todas las sedes (solo superadmin). */
  sedeCid: number | null;
}

export interface ResultadoOpiniones {
  respuestas: RespuestaOpinion[];
  /** true si la landing aún no guarda la sede y hubo que filtrar por ella. */
  sinDatosDeSede: boolean;
}

export async function listarOpiniones(f: FiltroOpiniones): Promise<ResultadoOpiniones> {
  const columnas = await columnasDeLaTabla();
  if (columnas.size === 0) return { respuestas: [], sinDatosDeSede: false };

  const tieneSede = columnas.has("sede_cid");
  if (f.sedeCid !== null && !tieneSede) {
    return { respuestas: [], sinDatosDeSede: true };
  }

  const where = ["created_at >= ?", "created_at < DATE_ADD(?, INTERVAL 1 DAY)"];
  const params: (string | number)[] = [f.desde, f.hasta];
  if (f.sedeCid !== null) {
    where.push("sede_cid = ?");
    params.push(f.sedeCid);
  }

  const { rows } = await query(
    `SELECT id, created_at, razon_social, email, ejecutivo,
            ${tieneSede ? "sede_cid" : "NULL AS sede_cid"},
            p4_tiempo_respuesta, p5_precision_tecnica, p6_seguimiento, p7_observacion,
            p8_tramito_rma, p9_tiempo_resolucion, p10_claridad, p11_resolucion,
            p12_comentario, p13_mejora
       FROM ${TABLA}
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${MAX_FILAS}`,
    params,
  );

  const respuestas: RespuestaOpinion[] = rows.map((r: any) => ({
    id: Number(r.id),
    fecha: new Date(r.created_at).toISOString(),
    razonSocial: String(r.razon_social ?? ""),
    email: r.email ?? null,
    ejecutivo:
      r.ejecutivo === NO_ESTOY_SEGURO
        ? "Sin identificar"
        : etiquetaEjecutivo(String(r.ejecutivo ?? "")),
    sede: r.sede_cid != null ? COMPANY_NAME[Number(r.sede_cid)] ?? null : null,
    p4: r.p4_tiempo_respuesta ?? null,
    p5: r.p5_precision_tecnica ?? null,
    p6: r.p6_seguimiento ?? null,
    observacionVentas: r.p7_observacion ?? null,
    tramitoRma: Number(r.p8_tramito_rma) === 1,
    p9: r.p9_tiempo_resolucion ?? null,
    p10: r.p10_claridad ?? null,
    p11: r.p11_resolucion ?? null,
    comentarioRma: r.p12_comentario ?? null,
    mejora: r.p13_mejora ?? null,
  }));

  return { respuestas, sinDatosDeSede: false };
}
