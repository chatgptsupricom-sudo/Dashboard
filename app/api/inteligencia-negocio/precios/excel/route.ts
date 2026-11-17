import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { leerCarga } from "@/lib/inteligencia-negocio/precios/datos";
import { csvOrdenado, excelOrdenado } from "@/lib/inteligencia-negocio/precios/excel";

export const dynamic = "force-dynamic";

/**
 * La lista ordenada con el formato del Excel de ejemplo.
 * GET ?carga=<id>   esa lista tal como quedó
 * GET ?fecha=YYYY-MM-DD   todo el corte, consolidado (precio más bajo por mayorista)
 * GET (sin nada)    todo lo cargado, consolidado
 * &formato=csv      CSV separado por punto y coma en vez de Excel
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;
  const sp = request.nextUrl.searchParams;
  const cargaId = Number(sp.get("carga")) || undefined;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("fecha") || "") ? sp.get("fecha")! : undefined;
  let nombre = "lista_ordenada_consolidada";
  if (cargaId) {
    const c = await leerCarga(cargaId);
    if (!c) return NextResponse.json({ error: "No existe esa carga." }, { status: 404 });
    nombre = `lista_ordenada_${c.mayorista.replace(/\W+/g, "_")}_${c.fecha_corte}`;
  } else if (fecha) nombre = `lista_ordenada_corte_${fecha}`;
  try {
    if (sp.get("formato") === "csv") {
      return new NextResponse(await csvOrdenado({ cargaId, fecha }), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nombre}.csv"`,
        },
      });
    }
    const buf = await excelOrdenado({ cargaId, fecha });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
      },
    });
  } catch (e: any) {
    console.error("[precios/excel]", e?.message);
    return NextResponse.json({ error: "No se pudo armar el Excel." }, { status: 502 });
  }
}
