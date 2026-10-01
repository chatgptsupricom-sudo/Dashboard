import { query } from "@/lib/db";

/**
 * Catálogo de personal de Seguridad y RMA (#50).
 *
 * De acá salen los dos selects "Recibió por Seguridad" / "Recibió por RMA" del
 * formulario de ingreso. Mismo patrón que seguridad_catalogo_almacenistas.
 */

export const ROLES_PERSONAL = ["seguridad", "rma"] as const;
export type RolPersonal = (typeof ROLES_PERSONAL)[number];

export function esRolPersonal(v: unknown): v is RolPersonal {
  return typeof v === "string" && (ROLES_PERSONAL as readonly string[]).includes(v);
}

/**
 * Qué lista de personal puede ADMINISTRAR (alta, baja, reactivar) la sesión.
 *
 * Cada rol registra solo a su propia gente: Seguridad la de Seguridad, RMA la
 * de RMA. Antes Seguridad cargaba las dos. `superadmin` puede con ambas
 * (devuelve null = "cualquiera"); cualquier otro rol no administra ninguna.
 */
export function rolPersonalAdministrable(
  payload: any,
): RolPersonal | null | false {
  const rol = String(payload?.role || "").toLowerCase().trim();
  if (rol === "superadmin") return null;
  return esRolPersonal(rol) ? rol : false;
}

// Best-effort e idempotente: crea la tabla y agrega las columnas del ingreso si
// esta base todavía no las tiene. Se corre una sola vez por proceso. La
// migración "de verdad" para producción es
// sql/alter_seguridad_catalogo_personal.sql (MySQL de prod con allowlist por IP).
let esquemaListo: Promise<void> | null = null;
export function asegurarEsquemaPersonal(): Promise<void> {
  if (!esquemaListo) {
    esquemaListo = (async () => {
      try {
        await query(
          `CREATE TABLE IF NOT EXISTS seguridad_catalogo_personal (
             id INT AUTO_INCREMENT PRIMARY KEY,
             nombre VARCHAR(200) NOT NULL,
             rol ENUM('seguridad','rma') NOT NULL,
             cids INT DEFAULT NULL,
             activo TINYINT(1) NOT NULL DEFAULT 1,
             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
             UNIQUE KEY uq_nombre_rol_cids (nombre, rol, cids),
             INDEX idx_rol_cids (rol, cids)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
        );
      } catch (e: any) {
        console.warn("seguridad_catalogo_personal no pudo crearse:", e?.message);
      }
      for (const col of ["recibido_seguridad_nombre", "recibido_rma_nombre"]) {
        try {
          await query(
            `ALTER TABLE seguridad_ingresos ADD COLUMN ${col} VARCHAR(200) DEFAULT NULL`,
          );
        } catch (e: any) {
          // "Duplicate column" cuando ya existe: normal, no se registra.
          if (!/duplicate column/i.test(e?.message || "")) {
            console.warn(`No se pudo agregar ${col}:`, e?.message);
          }
        }
      }
    })();
  }
  return esquemaListo;
}
