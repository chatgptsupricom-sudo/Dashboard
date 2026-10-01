import { query } from "@/lib/db";

// La columna `peso` se agregó a `kpi_targets` después de crear la tabla
// (issue #131). Varios routes del Stoplight leen `peso` en su SELECT, así que
// cada uno se asegura de que exista antes de consultar. El flag evita repetir
// el round-trip en una instancia caliente.
//
// Semántica de `peso`:
//  - NULL = sin peso propio: se usa el valor por defecto del componente.
//  - 0    = el KPI NO cuenta para el puntaje (se puede poner a propósito).
//  - > 0  = ese peso.
// Al principio la columna era NOT NULL DEFAULT 0 y 0 significaba "por
// defecto", así que no había forma de sacar un KPI del puntaje. La primera
// vez se pasa a NULL y los 0 viejos se convierten en NULL (no cambia nada de
// lo que ya se veía). Si el usuario de la base no puede hacer el ALTER, se
// sigue con la semántica vieja (0 = por defecto) y se registra el error.
let ensured = false;
let pesoAdmiteNull = false;

export async function ensureKpiTargetsPeso(): Promise<void> {
  if (ensured) return;
  try {
    await query(`ALTER TABLE kpi_targets ADD COLUMN peso DECIMAL(5,2) NULL DEFAULT NULL`);
  } catch (e: any) {
    if (!e?.message?.includes("Duplicate") && !e?.message?.includes("exists")) {
      console.error("ensureKpiTargetsPeso (add):", e?.message);
    }
  }
  try {
    const col = await query(`SHOW COLUMNS FROM kpi_targets LIKE 'peso'`);
    const fila = (col.rows as any[])[0];
    if (fila && String(fila.Null).toUpperCase() === "NO") {
      await query(`ALTER TABLE kpi_targets MODIFY peso DECIMAL(5,2) NULL DEFAULT NULL`);
      await query(`UPDATE kpi_targets SET peso = NULL WHERE peso = 0`);
    }
    pesoAdmiteNull = true;
  } catch (e: any) {
    console.error("ensureKpiTargetsPeso (null):", e?.message);
    pesoAdmiteNull = false;
  }
  await asegurarClaveUnica();
  ensured = true;
}

/**
 * `kpi_targets` necesita la clave única (kpi_key, company_id, mes): los
 * guardados de meta y de peso son `INSERT ... ON DUPLICATE KEY UPDATE`. Si la
 * tabla se creó sin ella (bases viejas), cada guardado INSERTA una fila nueva
 * y la lectura se puede quedar con una vieja: la meta o el peso "se reinician"
 * al recargar.
 *
 * Si falta: se consolidan los duplicados en una sola fila por combinación (la
 * meta y el peso más recientes que no estén vacíos) y se crea la clave.
 */
async function asegurarClaveUnica() {
  try {
    const idx = await query("SHOW INDEX FROM kpi_targets WHERE Key_name = 'unique_kpi'");
    if ((idx.rows as any[]).length > 0) return;

    const dup = await query(
      `SELECT kpi_key, company_id, mes, COUNT(*) n FROM kpi_targets
        GROUP BY kpi_key, company_id, mes HAVING COUNT(*) > 1`,
    );
    for (const d of dup.rows as any[]) {
      const filas = await query(
        "SELECT id, meta_mensual, peso FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ? ORDER BY id DESC",
        [d.kpi_key, d.company_id, d.mes],
      );
      const rows = filas.rows as any[];
      const meta = rows.find((r) => Number(r.meta_mensual) > 0)?.meta_mensual ?? rows[0].meta_mensual ?? 0;
      const peso = rows.find((r) => r.peso !== null && r.peso !== undefined)?.peso ?? null;
      await query("UPDATE kpi_targets SET meta_mensual = ?, peso = ? WHERE id = ?", [meta, peso, rows[0].id]);
      await query(
        "DELETE FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ? AND id <> ?",
        [d.kpi_key, d.company_id, d.mes, rows[0].id],
      );
    }
    await query("ALTER TABLE kpi_targets ADD UNIQUE KEY unique_kpi (kpi_key, company_id, mes)");
    console.log(`[kpi_targets] clave única creada${(dup.rows as any[]).length ? ` tras consolidar ${(dup.rows as any[]).length} combinación(es) duplicada(s)` : ""}`);
  } catch (e: any) {
    console.error("asegurarClaveUnica:", e?.message);
  }
}

/**
 * Peso guardado de una fila de `kpi_targets`, o `null` si no tiene (usar el
 * valor por defecto). Llamar después de `ensureKpiTargetsPeso()`.
 */
export function pesoDeFila(valor: any): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0 && !pesoAdmiteNull) return null;
  return n;
}

/** Valor a guardar: `null`/"" vuelve al peso por defecto. */
export function pesoParaGuardar(valor: any): number | null {
  if (valor === null || valor === undefined || valor === "") return pesoAdmiteNull ? null : 0;
  const n = Math.max(0, Number(valor) || 0);
  return Math.min(n, 999.99);
}
