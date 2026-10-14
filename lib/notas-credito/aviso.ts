import { query } from "@/lib/db";
import { aprobadores, normCorreo } from "@/lib/notas-credito/datos";
import { NOMBRE_SEDE, type PasoNC, type SolicitudNC } from "@/lib/notas-credito/tipos";
import { urlWebhookRma } from "@/lib/rma/webhook";

/**
 * Correos del flujo de notas de crédito, al flujo de n8n "RMA - Notification"
 * (mismo webhook que los de RMA, evento `nc_flujo`; sale de la cuenta de RMA
 * de la sede). Un correo por destinatario:
 *
 *   preaprobar  → quien preaprueba en la sede (Rangel)         · solicitud de RMA nueva
 *   aprobar     → quien aprueba (Gabriel)                      · preaprobada, o creada directa
 *   procesar    → quien hace la NC (Victor), copia a quien la pidió · aprobada
 *   rechazada   → quien la pidió (y quien la preaprobó, si la rechazó Gabriel)
 *   procesada   → quien la pidió                               · la NC quedó publicada en Odoo
 *
 * Fire-and-forget: si n8n falla, la solicitud igual avanza en el panel.
 */
export type AvisoNC = "preaprobar" | "aprobar" | "procesar" | "rechazada" | "procesada";

export function avisarNC(aviso: AvisoNC, sol: SolicitudNC, origenPeticion: string): void {
  procesar(aviso, sol, origenPeticion).catch((e) => {
    console.error(`[notas-credito/aviso] ${aviso} NC-${sol.id}:`, e?.message);
  });
}

async function nombres(correos: string[]): Promise<Map<string, string>> {
  if (!correos.length) return new Map();
  const r = await query(
    `SELECT LOWER(TRIM(email)) AS email, name FROM users_config WHERE LOWER(TRIM(email)) IN (${correos.map(() => "?").join(",")})`,
    correos,
  );
  return new Map((r.rows as any[]).map((f) => [f.email, f.name || ""]));
}

async function destinatarios(aviso: AvisoNC, sol: SolicitudNC): Promise<{ para: string[]; cc: string[] }> {
  const pasos = (await aprobadores())[sol.company_id];
  const de = (p: PasoNC) => pasos?.[p] ?? [];
  const creador = sol.creado_email ? [normCorreo(sol.creado_email)] : [];
  switch (aviso) {
    case "preaprobar":
      return { para: de("preaprueba"), cc: [] };
    case "aprobar":
      return { para: de("aprueba"), cc: [] };
    case "procesar":
      return { para: de("procesa"), cc: creador };
    case "rechazada":
      return {
        para: creador.length ? creador : de("preaprueba"),
        cc: sol.rechazado_paso === "aprueba" && sol.origen === "rma" ? de("preaprueba") : [],
      };
    case "procesada":
      return { para: creador, cc: [] };
  }
}

async function procesar(aviso: AvisoNC, sol: SolicitudNC, origenPeticion: string): Promise<void> {
  const url = urlWebhookRma();
  if (!url) return;
  const { para, cc } = await destinatarios(aviso, sol);
  if (!para.length) {
    console.warn(`[notas-credito/aviso] ${aviso} NC-${sol.id}: no hay a quién avisar en la sede ${sol.company_id}`);
    return;
  }
  const quien = await nombres([...new Set(para)]);
  const link = `${origenPeticion.replace(/\/+$/, "")}/es/notas-credito?id=${sol.id}`;

  for (const destinatario of new Set(para)) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: "nc_flujo",
        company_id: sol.company_id,
        correo: {
          aviso,
          destinatario,
          cc: cc.filter((c) => c !== destinatario),
          nombre_cliente: quien.get(destinatario) || "",
          numero: `NC-${sol.id}`,
          sede: NOMBRE_SEDE[sol.company_id] || "",
          origen: sol.origen,
          case_number: sol.case_number || null,
          cliente: sol.cliente || "",
          factura: sol.factura_nombre || "",
          producto: sol.producto || "",
          serial: sol.serial || null,
          monto: sol.monto,
          moneda: sol.moneda || "USD",
          motivo: sol.motivo,
          solicitado_por: sol.creado_por || "",
          preaprobado_por: sol.preaprobado_por || "",
          aprobado_por: sol.aprobado_por || "",
          rechazado_por: sol.rechazado_por || "",
          motivo_rechazo: sol.motivo_rechazo || "",
          nota_odoo: sol.odoo_move_nombre || "",
          link,
        },
      }),
    });
  }
}
