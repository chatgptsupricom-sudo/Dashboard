/**
 * Solicitudes de cuenta de distribuidor de la tienda web: se guardan en `tienda_solicitudes_cuenta`
 * (se crea sola) y se avisa a n8n solo `{ evento, solicitud_id }` (flujo "Tienda web - Solicitud de cuenta",
 * webhook `tienda-cuenta`, en `N8N_TIENDA_CUENTA_WEBHOOK_URL`; importable desde
 * `scripts/n8n-tienda-solicitud-cuenta.json`; sin ella no se avisa). n8n lee la fila (el webhook es
 * público: ningún dato ni destinatario viaja en él), le manda el correo a quien corresponde por sede
 * (`destinatarios`, guardado aquí) con «Responder a» el cliente y marca `enviado_at`.
 */
import { db } from "@/lib/db";
import { correosDeSede, type SolicitudCuenta } from "./cuentaTipos";

let tablaLista: Promise<void> | null = null;
function asegurarTabla(): Promise<void> {
  if (!tablaLista) {
    tablaLista = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_solicitudes_cuenta (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sede VARCHAR(20) NOT NULL,
          compra_mayor TINYINT(1) NOT NULL DEFAULT 1,
          nombre VARCHAR(80) NOT NULL,
          apellido VARCHAR(80) NOT NULL,
          telefono VARCHAR(30) NOT NULL,
          correo VARCHAR(160) NOT NULL,
          empresa VARCHAR(160) NOT NULL,
          documento VARCHAR(30) NOT NULL,
          estado VARCHAR(60) NOT NULL,
          direccion VARCHAR(300) NOT NULL,
          tipo_negocio VARCHAR(60) NULL,
          comentario TEXT NULL,
          destinatarios VARCHAR(500) NOT NULL,
          pagina VARCHAR(300) NULL,
          ip VARCHAR(64) NULL,
          creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          enviado_at TIMESTAMP NULL,
          KEY idx_documento (documento, sede, creado_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => { tablaLista = null; throw e; });
  }
  return tablaLista;
}

/**
 * Guarda la solicitud y avisa. Si la misma empresa (documento) ya pidió cuenta en esa sede en las
 * últimas 24 h, no se guarda otra ni se vuelve a avisar: la persona ve igual que se recibió.
 */
export async function registrarSolicitud(s: SolicitudCuenta, extra: { pagina: string; ip: string }): Promise<{ id: number; repetida: boolean }> {
  await asegurarTabla();
  const [previas]: any = await db.execute(
    "SELECT id FROM tienda_solicitudes_cuenta WHERE documento = ? AND sede = ? AND creado_at > NOW() - INTERVAL 1 DAY LIMIT 1",
    [s.documento, s.sede],
  );
  if (Array.isArray(previas) && previas[0]) return { id: Number(previas[0].id), repetida: true };

  const destinatarios = correosDeSede(s.sede, process.env.TIENDA_CUENTA_CORREOS).join(",");
  const [res]: any = await db.execute(
    `INSERT INTO tienda_solicitudes_cuenta
      (sede, compra_mayor, nombre, apellido, telefono, correo, empresa, documento, estado, direccion, tipo_negocio, comentario, destinatarios, pagina, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.sede, s.compraMayor ? 1 : 0, s.nombre, s.apellido, s.telefono, s.correo, s.empresa, s.documento, s.estado,
      s.direccion, s.tipoNegocio || null, s.comentario || null, destinatarios, extra.pagina.slice(0, 300) || null, extra.ip.slice(0, 64),
    ],
  );
  const id = Number(res?.insertId);
  if (id) avisar(id);
  return { id, repetida: false };
}

function avisar(id: number): void {
  const url = process.env.N8N_TIENDA_CUENTA_WEBHOOK_URL;
  if (!url) {
    console.warn(`[tienda-web/cuenta] solicitud ${id} guardada sin aviso: falta N8N_TIENDA_CUENTA_WEBHOOK_URL`);
    return;
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "tienda_cuenta", solicitud_id: id }),
    signal: AbortSignal.timeout(10000),
  })
    .then((r) => { if (!r.ok) console.error(`[tienda-web/cuenta] solicitud ${id}: n8n respondió ${r.status}`); })
    .catch((e) => console.error(`[tienda-web/cuenta] solicitud ${id}:`, e?.message));
}
