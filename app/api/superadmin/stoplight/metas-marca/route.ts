import { NextRequest, NextResponse } from "next/server";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { accesoStoplight } from "@/lib/stoplight/acceso";
import { obtenerLineasMargen } from "@/lib/stoplight/margen";
import { calcularCoberturaMarcas, guardarMetaMarca, leerMetasMarca } from "@/lib/stoplight/metasMarca";

export const maxDuration = 60;

const mesValido = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? m : null);
const moverMes = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

/**
 * Metas de venta por marca de Cobertura de marcas (lib/stoplight/metasMarca).
 * GET: metas del mes con su cumplimiento, la cobertura resultante, y la venta
 * promedio de los 3 meses anteriores por marca (para fijar metas).
 */
export async function GET(request: NextRequest) {
  const acceso = await accesoStoplight(request);
  if (acceso.error) return acceso.error;
  const { companyId } = acceso;

  try {
    const now = new Date();
    const mes = mesValido(request.nextUrl.searchParams.get("mes"))
      || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anio, mesNum] = mes.split("-").map(Number);
    const desde3 = `${moverMes(mes, -3)}-01`;
    const hasta3 = finDeMes(moverMes(mes, -1));

    const [metas, lineasMes, lineas3] = await Promise.all([
      leerMetasMarca(companyId, mes),
      obtenerLineasMargen(companyId, `${mes}-01`, finDeMes(mes)),
      obtenerLineasMargen(companyId, desde3, hasta3),
    ]);

    const cobertura = calcularCoberturaMarcas(metas, lineasMes, obtenerSemanasDelMes(anio, mesNum), anio, mesNum, 1, now);

    // Venta promedio mensual por marca, 3 meses anteriores (sin IVA).
    const hist = new Map<number, { marca: string; total: number }>();
    for (const l of lineas3) {
      if (l.marcaId == null) continue;
      const h = hist.get(l.marcaId) ?? { marca: l.marca, total: 0 };
      h.total += l.ingreso;
      hist.set(l.marcaId, h);
    }
    const vendidoMes = new Map<number, number>();
    for (const l of lineasMes) {
      if (l.marcaId != null) vendidoMes.set(l.marcaId, (vendidoMes.get(l.marcaId) || 0) + l.ingreso);
      if (l.marcaId != null && !hist.has(l.marcaId)) hist.set(l.marcaId, { marca: l.marca, total: 0 });
    }
    const marcas = [...hist.entries()]
      .map(([marcaId, h]) => ({
        marcaId,
        marca: h.marca,
        promedio3m: Math.round((h.total / 3) * 100) / 100,
        vendidoMes: Math.round((vendidoMes.get(marcaId) || 0) * 100) / 100,
      }))
      .filter((m) => m.promedio3m > 0 || m.vendidoMes > 0)
      .sort((a, b) => b.promedio3m - a.promedio3m);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        companyId,
        cobertura: { mes: metas.length ? cobertura.mes : null, semanas: cobertura.semanas },
        metas: cobertura.porMarca,
        marcas,
      },
    });
  } catch (error: any) {
    console.error("Error en metas-marca GET:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * POST (solo superadmin, como la columna META):
 *  { company_id, mes, marca_id, marca, meta }  → guarda (meta 0 borra)
 *  { company_id, mes, accion: "copiar" }       → copia las metas del mes anterior
 */
export async function POST(request: NextRequest) {
  const acceso = await accesoStoplight(request, []);
  if (acceso.error) return acceso.error;

  try {
    const body = await request.json();
    const companyId = Number(body.company_id) || acceso.companyId;
    const mes = mesValido(body.mes);
    if (!mes) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    const usuario = String(acceso.payload.email || acceso.payload.name || acceso.payload.uid || "");

    if (body.accion === "copiar") {
      const anteriores = await leerMetasMarca(companyId, moverMes(mes, -1));
      for (const m of anteriores) await guardarMetaMarca(companyId, mes, m.marcaId, m.marca, m.meta, usuario);
      return NextResponse.json({ success: true, copiadas: anteriores.length });
    }

    const marcaId = Number(body.marca_id);
    const meta = Number(body.meta) || 0;
    if (!marcaId || !body.marca) return NextResponse.json({ error: "Falta la marca" }, { status: 400 });
    await guardarMetaMarca(companyId, mes, marcaId, String(body.marca), meta, usuario);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en metas-marca POST:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
