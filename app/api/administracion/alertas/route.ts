import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import {
  canEditAlertas,
  canViewAdministracion,
  getAdminUser,
} from "@/lib/administracion/auth";
import {
  SeguimientoAlerta,
  esEstatusValido,
} from "@/lib/administracion/alertas";
import { COMPANY_MAP } from "@/lib/administracion/empresas";

/**
 * Seguimiento del Top 10 de Alertas.
 *
 * Las alertas se recalculan en cada carga desde los KPIs, asi que "Fecha
 * compromiso" y "Estatus" —dos de los seis campos que exige la propuesta— no
 * pueden salir del calculo: los pone una persona y tienen que sobrevivir a la
 * siguiente carga. Viven aqui, cruzados por el id estable de cada alerta.
 *
 * El alcance de una alerta es (id, sede, mes): la misma alerta en Valencia y
 * en Caracas son dos compromisos distintos, y el compromiso de agosto no debe
 * arrastrarse a septiembre, donde el indicador ya se recalculo.
 */
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS alertas_admin_seguimiento (
      id INT AUTO_INCREMENT PRIMARY KEY,
      alerta_id VARCHAR(120) NOT NULL,
      empresa VARCHAR(20) NOT NULL DEFAULT '',
      mes VARCHAR(7) NOT NULL,
      estatus VARCHAR(20) NOT NULL DEFAULT 'abierta',
      fecha_compromiso DATE NULL,
      responsable VARCHAR(120) NULL,
      nota VARCHAR(500) NULL,
      actualizado_por VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_seguimiento (alerta_id, empresa, mes),
      KEY idx_periodo (empresa, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

const RE_MES = /^\d{4}-\d{2}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** "" = todas las sedes; cualquier otra cosa tiene que ser una sede conocida. */
function normalizarEmpresa(v: unknown): string | null {
  const e = String(v ?? "").toLowerCase().trim();
  if (e === "") return "";
  return COMPANY_MAP[e] ? e : null;
}

function aFecha(v: any): string | null {
  if (!v) return null;
  // MySQL devuelve DATE como Date; la UI trabaja con YYYY-MM-DD.
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v);
  return RE_FECHA.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canViewAdministracion(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const empresa = normalizarEmpresa(url.searchParams.get("empresa"));
    const mes = url.searchParams.get("mes") || "";
    if (empresa === null || !RE_MES.test(mes)) {
      return NextResponse.json(
        { error: "Parametros invalidos: empresa y mes (YYYY-MM)" },
        { status: 400 },
      );
    }

    await ensureTable();
    const rows = await query(
      `SELECT alerta_id, estatus, fecha_compromiso, responsable, nota,
              actualizado_por, updated_at
         FROM alertas_admin_seguimiento
        WHERE empresa = ? AND mes = ?`,
      [empresa, mes],
    );

    const seguimientos: Record<string, SeguimientoAlerta> = {};
    (rows.rows as any[]).forEach((r) => {
      seguimientos[r.alerta_id] = {
        alertaId: r.alerta_id,
        estatus: esEstatusValido(r.estatus) ? r.estatus : "abierta",
        fechaCompromiso: aFecha(r.fecha_compromiso),
        responsable: r.responsable || null,
        nota: r.nota || null,
        actualizadoPor: r.actualizado_por || null,
        actualizadoEn: r.updated_at ? String(r.updated_at) : null,
      };
    });

    return NextResponse.json({ success: true, empresa, mes, seguimientos });
  } catch (error: any) {
    console.error("Error leyendo seguimiento de alertas:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canEditAlertas(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const alertaId = String(body.alerta_id ?? "").trim();
    const empresa = normalizarEmpresa(body.empresa);
    const mes = String(body.mes ?? "");
    const estatus = body.estatus ?? "abierta";
    const fechaCompromiso =
      body.fecha_compromiso === null ||
      body.fecha_compromiso === undefined ||
      body.fecha_compromiso === ""
        ? null
        : String(body.fecha_compromiso);

    if (
      !alertaId ||
      alertaId.length > 120 ||
      empresa === null ||
      !RE_MES.test(mes)
    ) {
      return NextResponse.json(
        { error: "Parametros invalidos: alerta_id, empresa y mes (YYYY-MM)" },
        { status: 400 },
      );
    }
    if (!esEstatusValido(estatus)) {
      return NextResponse.json(
        { error: "Estatus invalido: abierta, en_proceso o cerrada" },
        { status: 400 },
      );
    }
    if (fechaCompromiso !== null && !RE_FECHA.test(fechaCompromiso)) {
      return NextResponse.json(
        { error: "Fecha compromiso invalida (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    const responsable = body.responsable
      ? String(body.responsable).trim().slice(0, 120)
      : null;
    const nota = body.nota ? String(body.nota).trim().slice(0, 500) : null;
    const actualizadoPor = (user!.nombre || user!.email || "").slice(0, 120);

    await ensureTable();
    await query(
      `INSERT INTO alertas_admin_seguimiento
         (alerta_id, empresa, mes, estatus, fecha_compromiso, responsable, nota, actualizado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         estatus = VALUES(estatus),
         fecha_compromiso = VALUES(fecha_compromiso),
         responsable = VALUES(responsable),
         nota = VALUES(nota),
         actualizado_por = VALUES(actualizado_por)`,
      [
        alertaId,
        empresa,
        mes,
        estatus,
        fechaCompromiso,
        responsable,
        nota,
        actualizadoPor,
      ],
    );

    const seguimiento: SeguimientoAlerta = {
      alertaId,
      estatus,
      fechaCompromiso,
      responsable,
      nota,
      actualizadoPor,
      actualizadoEn: new Date().toISOString(),
    };
    return NextResponse.json({ success: true, seguimiento });
  } catch (error: any) {
    console.error("Error guardando seguimiento de alerta:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
