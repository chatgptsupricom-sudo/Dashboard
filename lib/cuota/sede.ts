import { query } from "@/lib/db";
import { cuotasVigentes } from "@/lib/cuota/rango";
import { esVendedorRetirado } from "@/lib/vendedores/retirados";

/**
 * Cuota mensual de ventas de una sede, con de dónde salió (para dejarlo
 * anotado donde se use, como el reparto de un packing list entre sedes).
 *
 * 1. La meta de la sede que fija el SuperAdmin en el Stoplight
 *    (`kpi_targets`, `cumplimiento_cuota_ventas`, ese mes), si es > 0.
 * 2. Si no, la suma de las cuotas de sus vendedores vigentes al cierre del
 *    mes (`cuota` + `sellers.cids`), sin retirados ni la vendedora que la
 *    pantalla Cuota deja fuera: el "Total" de la sección Cuota.
 */
export type FuenteCuota = "meta_sede" | "suma_vendedores" | "sin_cuota";

export interface CuotaSede {
  cids: number;
  monto: number;
  fuente: FuenteCuota;
}

/** Misma exclusión por nombre que las rutas de Cuota (superadmin, gerente_venta, gerente_operaciones). */
const EXCLUIDA_DE_CUOTA = "MARIA AUXILIADORA TOVAR CARO";

const MES = /^\d{4}-\d{2}$/;

function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
}

export async function cuotaDeSedes(sedes: number[], mes: string): Promise<Map<number, CuotaSede>> {
  if (!MES.test(mes)) throw new Error(`Mes inválido: ${mes}`);
  const ids = [...new Set(sedes.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const res = new Map<number, CuotaSede>();
  if (!ids.length) return res;
  const marcas = ids.map(() => "?").join(",");

  // 1. Meta de la sede (puede no existir la tabla en una base nueva).
  const metas = new Map<number, number>();
  try {
    const r = await query(
      `SELECT company_id, meta_mensual FROM kpi_targets
        WHERE kpi_key = 'cumplimiento_cuota_ventas' AND mes = ? AND company_id IN (${marcas})`,
      [mes, ...ids],
    );
    for (const f of r.rows as any[]) {
      const v = Number(f.meta_mensual) || 0;
      if (v > 0) metas.set(Number(f.company_id), v);
    }
  } catch (e: any) {
    console.warn("cuotaDeSedes: sin kpi_targets:", e?.message || e);
  }

  // 2. Suma de vendedores (solo para las sedes sin meta propia).
  const faltan = ids.filter((c) => !metas.has(c));
  const sumas = new Map<number, number>();
  if (faltan.length) {
    const marcasF = faltan.map(() => "?").join(",");
    const vendedores = await query(
      `SELECT id, name, user_id, cids FROM sellers WHERE cids IN (${marcasF})`,
      faltan,
    );
    const validos = (vendedores.rows as any[]).filter(
      (s) => String(s.name || "").toUpperCase().trim() !== EXCLUIDA_DE_CUOTA && !esVendedorRetirado(s),
    );
    if (validos.length) {
      const cuotas = await query(
        `SELECT seller_id, cuota, created_at FROM cuota WHERE seller_id IN (${validos.map(() => "?").join(",")})`,
        validos.map((s) => s.id),
      );
      const vigentes = cuotasVigentes(cuotas.rows as any[], finDeMes(mes));
      for (const s of validos) {
        const c = Number(s.cids);
        sumas.set(c, (sumas.get(c) ?? 0) + (vigentes.get(Number(s.id)) ?? 0));
      }
    }
  }

  for (const c of ids) {
    if (metas.has(c)) res.set(c, { cids: c, monto: metas.get(c)!, fuente: "meta_sede" });
    else {
      const monto = Math.round((sumas.get(c) ?? 0) * 100) / 100;
      res.set(c, { cids: c, monto, fuente: monto > 0 ? "suma_vendedores" : "sin_cuota" });
    }
  }
  return res;
}
