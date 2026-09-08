import { query } from "@/lib/db";

// La columna `peso` se agregó a `kpi_targets` después de crear la tabla
// (issue #131). Varios routes del Stoplight leen `peso` en su SELECT, así que
// cada uno se asegura de que exista antes de consultar. El ALTER falla en
// silencio si ya está. El flag evita repetir el round-trip en una instancia
// caliente.
let ensured = false;

export async function ensureKpiTargetsPeso(): Promise<void> {
  if (ensured) return;
  try {
    await query(`ALTER TABLE kpi_targets ADD COLUMN peso DECIMAL(5,2) NOT NULL DEFAULT 0`);
  } catch (e: any) {
    if (!e?.message?.includes("Duplicate") && !e?.message?.includes("exists")) {
      console.error("ensureKpiTargetsPeso:", e?.message);
    }
  }
  ensured = true;
}
