/**
 * Correo de bienvenida al darle (o cambiarle) el rol del panel a alguien, por
 * el flujo de n8n "Usuarios - Rol asignado" (webhook `usuario-rol`, en
 * `N8N_USUARIO_WEBHOOK_URL`; sin ella no se avisa). Importable desde
 * `scripts/n8n-usuario-rol-asignado.json`.
 *
 * Como en notas de crédito y solicitudes de personal, el webhook es público:
 * el panel no le manda direcciones ni texto, solo `{evento, aviso_id}`. Lo que
 * dice el correo (URL, rol, resumen y secciones) queda antes en la fila de
 * `usuarios_avisos_rol` (se crea sola), y n8n la lee de la MySQL junto con el
 * correo de `users_config` — solo si la persona sigue teniendo ese mismo rol,
 * si la fila tiene menos de un día y si todavía no se mandó (`enviado_at`, que
 * n8n marca al enviar). Así el webhook no sirve para escribirle a cualquiera
 * ni para mandar dos veces el mismo aviso. La tabla queda además como
 * historial de quién le dio qué rol a quién.
 *
 * Fire-and-forget: si la MySQL o n8n fallan, el rol queda asignado igual.
 */
import { db } from "@/lib/db";
import { describirRol } from "@/lib/usuarios/descripcionRol";

const PANEL_PUBLICO = "https://panel.supricom.com.ve";

export function urlPanel(): string {
  return (process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || PANEL_PUBLICO).replace(/\/+$/, "");
}

let tablaLista: Promise<void> | null = null;

function asegurarTabla(): Promise<void> {
  if (!tablaLista) {
    tablaLista = db
      .query(
        `CREATE TABLE IF NOT EXISTS usuarios_avisos_rol (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          email VARCHAR(255) NOT NULL,
          nombre VARCHAR(255) NULL,
          rol VARCHAR(100) NOT NULL,
          rol_nombre VARCHAR(150) NULL,
          rol_anterior VARCHAR(150) NULL,
          resumen TEXT NULL,
          secciones_json TEXT NULL,
          url_panel VARCHAR(255) NOT NULL,
          asignado_por VARCHAR(255) NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          enviado_at DATETIME NULL,
          INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      )
      .then(() => undefined)
      .catch((e) => {
        tablaLista = null;
        throw e;
      });
  }
  return tablaLista;
}

export type RolAsignado = {
  userId: number;
  email: string;
  nombre: string;
  /** `roles.name` (el técnico, el que compara el middleware). */
  rol: string;
  /** `roles.display_name`. */
  rolNombre: string | null;
  /** display_name del rol que tenía antes; null = no tenía rol en el panel. */
  rolAnterior: string | null;
  /** Correo de quien lo asignó. */
  asignadoPor: string | null;
};

export function avisarRolAsignado(datos: RolAsignado): void {
  const url = process.env.N8N_USUARIO_WEBHOOK_URL;
  if (!url) return;

  void (async () => {
    try {
      await asegurarTabla();
      const { resumen, grupos } = describirRol(datos.rol);
      const [res]: any = await db.execute(
        `INSERT INTO usuarios_avisos_rol
          (user_id, email, nombre, rol, rol_nombre, rol_anterior, resumen, secciones_json, url_panel, asignado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          datos.userId,
          datos.email,
          datos.nombre,
          datos.rol,
          datos.rolNombre,
          datos.rolAnterior,
          resumen,
          JSON.stringify(grupos),
          urlPanel(),
          datos.asignadoPor,
        ],
      );
      const avisoId = Number(res?.insertId);
      if (!avisoId) return;

      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento: "usuario_rol", aviso_id: avisoId }),
      });
      if (!r.ok) console.error(`[usuarios/avisoRol] aviso ${avisoId} (usuario ${datos.userId}): n8n respondió ${r.status}`);
    } catch (e: any) {
      console.error(`[usuarios/avisoRol] usuario ${datos.userId}:`, e?.message);
    }
  })();
}
