import { query } from "@/lib/db";

/**
 * `seguridad_despachos.cedula_retira` (lib/seguridad/cedulaRetira.ts) se
 * agrega sola la primera vez que algo la necesita: en el phpMyAdmin de
 * producción no se puede leer information_schema, así que se mira con
 * `SHOW COLUMNS`. Si falla se reintenta en la próxima llamada.
 */
let lista: Promise<void> | null = null;

export function asegurarColumnaCedula(): Promise<void> {
  if (!lista) {
    lista = (async () => {
      const r = await query("SHOW COLUMNS FROM seguridad_despachos LIKE 'cedula_retira'");
      if ((r.rows as any[]).length) return;
      try {
        await query(
          "ALTER TABLE seguridad_despachos ADD COLUMN cedula_retira VARCHAR(20) DEFAULT NULL AFTER cliente_retira",
        );
      } catch (e: any) {
        if (!String(e?.message || "").includes("Duplicate")) throw e;
      }
    })().catch((e) => {
      console.error("[seguridad] no se pudo agregar seguridad_despachos.cedula_retira:", e?.message);
      lista = null;
      throw e;
    });
  }
  return lista;
}
