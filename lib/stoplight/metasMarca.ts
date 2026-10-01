import { query } from "@/lib/db";
import { contarDiasUtiles } from "@/lib/feriados";

/**
 * Cobertura de marcas con meta de venta por marca (tabla de KPIs de Ventas del
 * gerente: "Venta real en valor de cada marca / % de peso de venta esperado de
 * cada marca", peso 2%, mínimo 70% desde oct-2026).
 *
 * - El superadmin carga, por sede y mes, una meta en $ (sin IVA) por marca
 *   (`spiff.brand` de Odoo), desde el detalle de Cobertura de marcas del
 *   Stoplight, igual que hoy carga las metas de la columna META.
 * - Peso de cada marca = su meta ÷ la suma de metas de la sede.
 * - Cumplimiento de una marca = venta real ÷ meta, con TOPE de 100%: vender de
 *   más una marca no tapa otra que no se vendió.
 * - Cobertura = Σ peso × cumplimiento (promedio ponderado).
 * - La meta se prorratea por días hábiles: por semana, meta × días hábiles de
 *   la semana ÷ días hábiles del mes; el valor del mes se mide contra lo que
 *   debería llevarse a hoy (igual que el "avance del mes" de la cuota).
 * - Para un vendedor, la meta de cada marca se multiplica por su parte de la
 *   cuota de la sede.
 *
 * Si el mes no tiene metas por marca, el KPI sigue con la fórmula anterior
 * (cantidad de marcas distintas vendidas contra la meta de la columna META).
 */

export interface MetaMarca {
  marcaId: number;
  marca: string;
  meta: number;
}

export interface VentaMarca {
  marcaId: number | null;
  ingreso: number;
  fecha: Date;
}

export interface CumplimientoMarca extends MetaMarca {
  peso: number;
  /** Meta prorrateada a hoy (o completa en meses cerrados). */
  metaAlDia: number;
  real: number;
  /** real ÷ metaAlDia × 100, sin tope (el tope se aplica al promediar). */
  cumplimiento: number | null;
}

export interface CoberturaMarcas {
  /** % por semana (null = futura). */
  semanas: (number | null)[];
  /** % del mes contra la meta prorrateada a hoy. */
  mes: number;
  porMarca: CumplimientoMarca[];
}

let tablaLista = false;
export async function asegurarTablaMetasMarca() {
  if (tablaLista) return;
  await query(
    `CREATE TABLE IF NOT EXISTS kpi_metas_marca (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      mes VARCHAR(7) NOT NULL,
      marca_id INT NOT NULL,
      marca VARCHAR(255) NOT NULL,
      meta DECIMAL(14,2) NOT NULL DEFAULT 0,
      updated_by VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_meta_marca (company_id, mes, marca_id)
    )`,
    [],
  );
  tablaLista = true;
}

export async function leerMetasMarca(companyId: number, mes: string): Promise<MetaMarca[]> {
  await asegurarTablaMetasMarca();
  const r = await query(
    "SELECT marca_id, marca, meta FROM kpi_metas_marca WHERE company_id = ? AND mes = ? AND meta > 0 ORDER BY meta DESC",
    [companyId, mes],
  );
  return (r.rows as any[]).map((x) => ({ marcaId: Number(x.marca_id), marca: x.marca, meta: Number(x.meta) || 0 }));
}

/** meta 0 (o vacía) borra la meta de esa marca. */
export async function guardarMetaMarca(
  companyId: number, mes: string, marcaId: number, marca: string, meta: number, usuario: string,
) {
  await asegurarTablaMetasMarca();
  if (!(meta > 0)) {
    await query("DELETE FROM kpi_metas_marca WHERE company_id = ? AND mes = ? AND marca_id = ?", [companyId, mes, marcaId]);
    return;
  }
  await query(
    `INSERT INTO kpi_metas_marca (company_id, mes, marca_id, marca, meta, updated_by) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE marca = VALUES(marca), meta = VALUES(meta), updated_by = VALUES(updated_by)`,
    [companyId, mes, marcaId, marca, meta, usuario],
  );
}

/**
 * Cobertura con metas por marca. `factor` escala las metas (1 = sede; para un
 * vendedor, su cuota ÷ la cuota total de la sede). `ventas` ya filtradas al
 * alcance (sede o vendedor).
 */
export function calcularCoberturaMarcas(
  metas: MetaMarca[],
  ventas: VentaMarca[],
  semanas: { inicio: Date; fin: Date }[],
  anio: number,
  mes: number,
  factor = 1,
  hoy = new Date(),
): CoberturaMarcas {
  const inicioMes = new Date(anio, mes - 1, 1);
  const finMes = new Date(anio, mes, 0);
  const duMes = Math.max(1, contarDiasUtiles(inicioMes, finMes));
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const corte = hoySinHora < finMes ? hoySinHora : finMes;
  const duTranscurridos = corte < inicioMes ? 0 : contarDiasUtiles(inicioMes, corte);

  const totalMeta = metas.reduce((s, m) => s + m.meta, 0);
  const realMes = new Map<number, number>();
  const realSemana = semanas.map(() => new Map<number, number>());
  for (const v of ventas) {
    if (v.marcaId == null) continue;
    realMes.set(v.marcaId, (realMes.get(v.marcaId) || 0) + v.ingreso);
    const i = semanas.findIndex((s) => v.fecha >= s.inicio && v.fecha <= s.fin);
    if (i !== -1) realSemana[i].set(v.marcaId, (realSemana[i].get(v.marcaId) || 0) + v.ingreso);
  }

  // Promedio ponderado con tope de 100% por marca.
  const ponderar = (real: Map<number, number>, proporcion: number): number | null => {
    if (totalMeta <= 0 || proporcion <= 0) return null;
    let acc = 0;
    for (const m of metas) {
      const esperado = m.meta * factor * proporcion;
      if (esperado <= 0) continue;
      acc += (m.meta / totalMeta) * Math.min(Math.max((real.get(m.marcaId) || 0) / esperado, 0), 1);
    }
    return Math.round(acc * 100);
  };

  const semanasPct = semanas.map((s, i) => {
    if (s.inicio > hoy) return null;
    return ponderar(realSemana[i], contarDiasUtiles(s.inicio, s.fin) / duMes);
  });

  const proporcionAlDia = duTranscurridos / duMes;
  const porMarca: CumplimientoMarca[] = metas.map((m) => {
    const metaAlDia = m.meta * factor * proporcionAlDia;
    const real = realMes.get(m.marcaId) || 0;
    return {
      ...m,
      meta: Math.round(m.meta * factor * 100) / 100,
      peso: totalMeta > 0 ? Math.round((m.meta / totalMeta) * 1000) / 10 : 0,
      metaAlDia: Math.round(metaAlDia * 100) / 100,
      real: Math.round(real * 100) / 100,
      cumplimiento: metaAlDia > 0 ? Math.round((real / metaAlDia) * 100) : null,
    };
  });

  return { semanas: semanasPct, mes: ponderar(realMes, proporcionAlDia) ?? 0, porMarca };
}
