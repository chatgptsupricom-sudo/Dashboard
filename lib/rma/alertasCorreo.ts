import { query } from "@/lib/db";
import { urlWebhookRma } from "@/lib/rma/webhook";
import { casosConPlazo, type CasoConPlazo } from "@/lib/rma/plazosCasos";
import { PLAZOS, type Plazo } from "@/lib/rma/plazos";
import { etiquetaEstado } from "@/components/rma/estados";
import { emailDeContacto, origenPortal, resolverEmailCliente } from "@/lib/rma/emailReparado";
import { NOMBRES_SUCURSAL, SLUGS_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";

/**
 * Avisos por correo de los plazos del taller (lib/rma/plazos.ts). Los dispara
 * el cron de server.js (GET /api/cron/alertas-plazos-rma). Cada aviso va a
 * quien le toca y con los casos de UNA sede:
 *
 *   equipo que no llega (5 días hábiles)  → al cliente           rma_plazo_por_llegar
 *   diagnóstico de más de 48 h hábiles    → al RMA de la sede    rma_plazo_diagnostico
 *   7.º día hábil sin salir               → al RMA de la sede
 *                                           y a los Super Admin  rma_plazo_taller
 *   resumen diario (8:00)                 → al RMA de la sede    rma_plazos_resumen
 *
 * Todo va al webhook de n8n de RMA ("RMA - Notification") con
 * `company_id`: n8n lo manda por Gmail desde la cuenta de RMA de esa sede, y el
 * buzón de RMA de cada sede (destinatario de los avisos internos, `para:
 * "rma_sede"`) también se define allá.
 *
 * Los tres primeros salen una sola vez por vencimiento: se anotan en
 * `rma_avisos_plazo` (se crea sola) antes de mandarse; si n8n falla, se borra
 * la marca y se reintenta en la próxima pasada. El resumen no se anota: es el
 * recordatorio diario de lo que sigue sin moverse.
 */

export type ModoAviso = "avisos" | "resumen";
type TipoAviso = "por_llegar" | "diagnostico" | "taller";

/**
 * Al cliente solo se le recuerda un vencimiento reciente: la primera pasada
 * después de desplegar no puede escribirle por tickets de hace semanas.
 */
const DIAS_MAX_AVISO_CLIENTE = 7;

const fechaCaracas = (iso: string, conHora = true) =>
  new Date(iso).toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(conHora ? { hour: "numeric", minute: "2-digit" } : {}),
  });

/** El plazo que aprieta, en una línea para el correo interno. */
export function textoPlazo(p: Plazo): string {
  if (p.porLlegar) {
    const d = p.porLlegar.dias;
    return `Ticket esperando el equipo hace ${d} día${d === 1 ? "" : "s"} hábil${d === 1 ? "" : "es"}`;
  }
  const partes: string[] = [];
  const dg = p.diagnostico;
  if (dg && dg.nivel !== "ok") {
    partes.push(
      `Diagnóstico: ${dg.horas} de ${PLAZOS.diagnostico.limite} h (${dg.nivel === "vencido" ? "venció" : "vence"} ${fechaCaracas(dg.vence)})`,
    );
  }
  const tl = p.taller;
  if (tl && (tl.nivel !== "ok" || !partes.length)) {
    partes.push(
      `Día hábil ${tl.dia} de ${PLAZOS.taller.limite} en las instalaciones` +
        ` (${tl.nivel === "vencido" ? "debía salir" : "debe salir"} antes del ${fechaCaracas(tl.saleAntesDe, false)})`,
    );
  }
  return partes.join(" · ");
}

/** Cuándo venció el plazo de ese tipo, o null si no está vencido. */
function vencio(p: Plazo, tipo: TipoAviso): string | null {
  if (tipo === "por_llegar") return p.porLlegar?.nivel === "vencido" ? p.porLlegar.vence : null;
  if (tipo === "diagnostico") return p.diagnostico?.nivel === "vencido" ? p.diagnostico.vence : null;
  return p.taller?.nivel === "vencido" ? p.taller.saleAntesDe : null;
}

let hayTabla = false;
async function asegurarTabla(): Promise<void> {
  if (hayTabla) return;
  await query(
    `CREATE TABLE IF NOT EXISTS rma_avisos_plazo (
       id INT AUTO_INCREMENT PRIMARY KEY,
       case_id INT NOT NULL,
       tipo VARCHAR(20) NOT NULL,
       vence DATETIME NOT NULL,
       enviado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uk_aviso (case_id, tipo, vence)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  hayTabla = true;
}

/** "YYYY-MM-DD HH:MM:SS" en UTC, para la columna DATETIME. */
const sqlFecha = (iso: string) => new Date(iso).toISOString().slice(0, 19).replace("T", " ");

/** Anota el aviso; false si ya estaba (se mandó antes). */
async function marcar(caseId: number, tipo: TipoAviso, vence: string): Promise<boolean> {
  const r = await query(`INSERT IGNORE INTO rma_avisos_plazo (case_id, tipo, vence) VALUES (?, ?, ?)`, [
    caseId,
    tipo,
    sqlFecha(vence),
  ]);
  return Number((r.rows as any)?.affectedRows) > 0;
}

async function desmarcar(caseId: number, tipo: TipoAviso, vence: string): Promise<void> {
  await query(`DELETE FROM rma_avisos_plazo WHERE case_id = ? AND tipo = ? AND vence = ?`, [caseId, tipo, sqlFecha(vence)]).catch(
    () => {},
  );
}

async function superAdmins(): Promise<{ email: string; name: string | null }[]> {
  const r = await query(
    `SELECT uc.email, uc.name
       FROM users_config uc
       JOIN roles r ON uc.role_id = r.id
      WHERE LOWER(TRIM(r.name)) = 'superadmin' AND COALESCE(uc.is_active, 1) = 1`,
  );
  return (r.rows as any[]).filter((u) => u.email).map((u) => ({ email: String(u.email), name: u.name ?? null }));
}

const filaCaso = (c: CasoConPlazo, base: string) => ({
  case_number: c.case_number,
  cliente: c.client_name,
  producto: c.producto,
  estado: etiquetaEstado[c.status] || c.status,
  nivel: c.plazo.nivel,
  plazo: textoPlazo(c.plazo),
  link: `${base}/es/rma/casos/${c.id}`,
});

const porSede = (casos: CasoConPlazo[]) => {
  const m = new Map<number, CasoConPlazo[]>();
  for (const c of casos) {
    // Sin sede, Valencia: el mismo default que el resto del módulo.
    const sede = c.company_id ?? 9;
    m.set(sede, [...(m.get(sede) ?? []), c]);
  }
  return m;
};

type Envio = { payload: any; marcas: { caseId: number; tipo: TipoAviso; vence: string }[] };

/** Correo al cliente: "todavía no recibimos tu equipo". Solo tickets del portal. */
async function envioCliente(c: CasoConPlazo, vence: string, base: string): Promise<Envio | null> {
  const r = await query(`SELECT odoo_partner_id, tracking_token FROM rma_cases WHERE id = ?`, [c.id]);
  const extra = (r.rows as any[])[0];
  const slug = c.company_id ? SLUGS_SUCURSAL[c.company_id] : undefined;
  if (!extra?.tracking_token || !slug) return null;
  const email = (await resolverEmailCliente(extra.odoo_partner_id)) || (await emailDeContacto(c.id));
  if (!email) {
    console.warn(`[rma/alertasCorreo] caso ${c.case_number}: sin email del cliente, no se le recuerda el envío`);
    return null;
  }
  const portal = origenPortal(base).replace(/\/+$/, "");
  return {
    payload: {
      evento: "rma_plazo_por_llegar",
      company_id: c.company_id,
      correo: {
        destinatario: email,
        nombre_cliente: c.client_name,
        case_number: c.case_number,
        producto: c.producto,
        dias: c.plazo.porLlegar?.dias ?? PLAZOS.porLlegar.limite,
        sede: NOMBRES_SUCURSAL[c.company_id!] || "",
        link_consulta: portal ? `${portal}/es/servicio-tecnico/${slug}/consultar?token=${extra.tracking_token}` : "",
      },
    },
    marcas: [{ caseId: c.id, tipo: "por_llegar", vence }],
  };
}

/** Los correos de la pasada, sin mandarlos todavía. */
async function armarEnvios(modo: ModoAviso, base: string, ahora = new Date()): Promise<Envio[]> {
  const casos = await casosConPlazo();
  const envios: Envio[] = [];

  if (modo === "resumen") {
    for (const [sede, suyos] of porSede(casos.filter((c) => c.plazo.nivel !== "ok"))) {
      const orden = (c: CasoConPlazo) => (c.plazo.nivel === "vencido" ? 0 : 1);
      suyos.sort((a, b) => orden(a) - orden(b));
      const vencidos = suyos.filter((c) => c.plazo.nivel === "vencido").length;
      envios.push({
        payload: {
          evento: "rma_plazos_resumen",
          company_id: sede,
          correo: {
            para: "rma_sede",
            sede: NOMBRES_SUCURSAL[sede] || String(sede),
            vencidos,
            por_vencer: suyos.length - vencidos,
            casos: suyos.slice(0, 80).map((c) => filaCaso(c, base)),
            mas: Math.max(0, suyos.length - 80),
            link_panel: `${base}/es/rma`,
          },
        },
        marcas: [],
      });
    }
    return envios;
  }

  await asegurarTabla();
  const nuevos: Record<TipoAviso, { caso: CasoConPlazo; vence: string }[]> = { por_llegar: [], diagnostico: [], taller: [] };
  for (const c of casos) {
    for (const tipo of ["por_llegar", "diagnostico", "taller"] as TipoAviso[]) {
      const vence = vencio(c.plazo, tipo);
      if (!vence) continue;
      if (tipo === "por_llegar") {
        // Solo el estado nuevo (no los "recibido" de antes) y vencimientos recientes.
        if (c.status !== "por_llegar") continue;
        if (ahora.getTime() - new Date(vence).getTime() > DIAS_MAX_AVISO_CLIENTE * 86_400_000) continue;
      }
      const ya = await query(`SELECT 1 FROM rma_avisos_plazo WHERE case_id = ? AND tipo = ? AND vence = ? LIMIT 1`, [
        c.id,
        tipo,
        sqlFecha(vence),
      ]);
      if (!(ya.rows as any[]).length) nuevos[tipo].push({ caso: c, vence });
    }
  }

  for (const { caso, vence } of nuevos.por_llegar) {
    const e = await envioCliente(caso, vence, base);
    if (e) envios.push(e);
  }

  const cc = nuevos.taller.length ? (await superAdmins()).map((a) => a.email) : [];
  for (const tipo of ["diagnostico", "taller"] as const) {
    for (const [sede, lista] of porSede(nuevos[tipo].map((x) => x.caso))) {
      envios.push({
        payload: {
          evento: tipo === "diagnostico" ? "rma_plazo_diagnostico" : "rma_plazo_taller",
          company_id: sede,
          correo: {
            para: "rma_sede",
            // El 7.º día hábil también lo ven los Super Admin.
            cc: tipo === "taller" ? cc : [],
            sede: NOMBRES_SUCURSAL[sede] || String(sede),
            casos: lista.map((c) => filaCaso(c, base)),
            link_panel: `${base}/es/rma`,
          },
        },
        marcas: nuevos[tipo].filter((x) => (x.caso.company_id ?? 9) === sede).map((x) => ({ caseId: x.caso.id, tipo, vence: x.vence })),
      });
    }
  }
  return envios;
}

export async function enviarAlertasPlazos(opciones: {
  modo: ModoAviso;
  base: string;
  dry?: boolean;
}): Promise<{ correos: number; enviados: number; motivo?: string; payloads?: unknown[] }> {
  const base = opciones.base.replace(/\/+$/, "");
  const url = urlWebhookRma();
  if (!url && !opciones.dry) return { correos: 0, enviados: 0, motivo: "N8N_RMA_WEBHOOK_URL sin configurar" };

  const envios = await armarEnvios(opciones.modo, base);
  if (opciones.dry) return { correos: envios.length, enviados: 0, payloads: envios.map((e) => e.payload) };

  let enviados = 0;
  for (const e of envios) {
    // Primero la marca: si otra pasada corre a la vez, solo una lo manda.
    const propias: Envio["marcas"] = [];
    for (const m of e.marcas) if (await marcar(m.caseId, m.tipo, m.vence)) propias.push(m);
    if (e.marcas.length && !propias.length) continue;

    let ok = false;
    try {
      const r = await fetch(url!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e.payload),
      });
      ok = r.ok;
      if (!ok) console.error(`[rma/alertasCorreo] n8n respondió ${r.status} (${e.payload.evento})`);
    } catch (err: any) {
      console.error(`[rma/alertasCorreo] n8n webhook error (${e.payload.evento}):`, err?.message);
    }
    if (ok) enviados++;
    else for (const m of propias) await desmarcar(m.caseId, m.tipo, m.vence);
  }
  return { correos: envios.length, enviados };
}
