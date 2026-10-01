import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { menorRotacion } from "@/lib/compras/reportes";
import { calcularSugerido, nivelAlerta } from "@/lib/compras/sugeridos";
import { leerSugeridos } from "@/lib/compras/sugeridosDatos";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/dashboard?sede=9 — resumen de /compras. Cada tarjeta sale
 * de lo mismo que la pantalla a la que lleva:
 * - Valor a comprar, ABC y SKUs activos: Sugeridos (lib/compras/sugeridos.ts).
 * - En quiebre / en riesgo: Mayor rotación (`nivelAlerta`, mismo cálculo).
 * - Capital inmovilizado: Menor rotación (`menorRotacion`, 30+ días sin venta).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const [{ data }, estancados] = await Promise.all([leerSugeridos(sedeId), menorRotacion(sedeId)]);

    let totalSugeridos = 0;
    let valorTotalComprar = 0;
    let enQuiebre = 0;
    let enRiesgo = 0;
    let clasA = 0;
    let clasB = 0;
    let clasC = 0;
    for (const fila of data) {
      const c = calcularSugerido(fila);
      if (c.abc === "A") clasA++;
      else if (c.abc === "B") clasB++;
      else clasC++;
      if (c.compraFinal > 0) {
        totalSugeridos++;
        valorTotalComprar += c.valorAComprar;
      }
      const nivel = nivelAlerta(fila, c);
      if (nivel === "quiebre") enQuiebre++;
      else if (nivel === "riesgo") enRiesgo++;
    }

    const capitalEstancado = estancados.reduce((s, p) => s + p.stockDisponible * p.costo, 0);

    return NextResponse.json({
      success: true,
      data: {
        totalSugeridos,
        valorTotalComprar: Math.round(valorTotalComprar),
        enQuiebre,
        enRiesgo,
        totalEstancados: estancados.length,
        capitalEstancado: Math.round(capitalEstancado),
        totalSkusActivos: data.length,
        clasA,
        clasB,
        clasC,
      },
    });
  } catch (error: any) {
    console.error("❌ Error en API Dashboard Compras:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
