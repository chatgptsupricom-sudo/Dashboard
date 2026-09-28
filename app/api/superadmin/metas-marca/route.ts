import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError, callOdooRPC } from "@/lib/odoo";
import { calcularMetasMarca } from "@/lib/metas-marca/calculo";
import { claveMarca, esMarcaGenerica, SIN_MARCA } from "@/lib/metas-marca/marcas";
import { guardarMeta, leerMetas } from "@/lib/metas-marca/metas";
import { esSedeValida, nombreSede } from "@/lib/metas-marca/odoo";
import { historialMarcas, mesActual, mesValido, moverMes, sedesDe, ventasDelMes } from "@/lib/metas-marca/servicio";

export const maxDuration = 60;

/**
 * Metas por marca (SuperAdmin): meta de venta mensual por marca y sede, y
 * cuánto se lleva vendido de cada una contra su meta. Cálculo en
 * lib/metas-marca/calculo.ts; lectura de Odoo en lib/metas-marca/odoo.ts.
 *
 * GET ?company_id=9|10|7|todas&mes=YYYY-MM&ic=1&refrescar=1
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDe(sp.get("company_id"));
  if (!sedes) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const mes = mesValido(sp.get("mes")) || mesActual();
  const incluirIC = sp.get("ic") === "1";
  const refrescar = sp.get("refrescar") === "1";

  try {
    const [ventas, historial, metas, metasAnterior, marcasOdoo] = await Promise.all([
      Promise.all(sedes.map((s) => ventasDelMes(s, mes, refrescar))),
      historialMarcas(sedes, mes, 6, incluirIC),
      leerMetas(sedes, mes),
      leerMetas(sedes, moverMes(mes, -1)),
      callOdooRPC<any[]>("spiff.brand", "search_read", [[]], { fields: ["name"], limit: 0 }),
    ]);

    const lineas = ventas.flatMap((v) => v.lineas).filter((l) => incluirIC || !l.intercompania);
    const resumen = calcularMetasMarca(mes, metas, lineas, historial);

    const montoIC = ventas.flatMap((v) => v.lineas).filter((l) => l.intercompania).reduce((s, l) => s + l.ingreso, 0);
    const actualizado = metas.reduce<{ por: string | null; fecha: string | null }>(
      (acc, m) => (m.actualizado && (!acc.fecha || m.actualizado > acc.fecha) ? { por: m.actualizadoPor, fecha: m.actualizado } : acc),
      { por: null, fecha: null },
    );

    // Marcas de Odoo a las que se les puede poner meta aunque no hayan vendido.
    const catalogo = new Map<string, string>();
    for (const b of marcasOdoo || []) {
      const clave = claveMarca(b.name);
      if (clave !== SIN_MARCA && !esMarcaGenerica(clave) && !catalogo.has(clave)) catalogo.set(clave, String(b.name).trim());
    }

    return NextResponse.json({
      success: true,
      data: {
        ...resumen,
        sedes: sedes.map((id) => ({ id, nombre: nombreSede(id) })),
        editable: sedes.length === 1,
        incluyeIntercompania: incluirIC,
        intercompania: Math.round(montoIC * 100) / 100,
        metasMesAnterior: metasAnterior.length,
        actualizado,
        catalogo: [...catalogo.entries()].map(([clave, marca]) => ({ clave, marca })).sort((a, b) => a.marca.localeCompare(b.marca)),
        generado: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error en metas-marca GET:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}

/**
 * POST (solo superadmin):
 *  { accion: "guardar", company_id, mes, metas: [{ marca, meta }] }  meta 0 borra
 *  { accion: "copiar", company_id, mes }  copia las metas del mes anterior a las marcas sin meta
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => null);
    const companyId = Number(body?.company_id);
    const mes = mesValido(body?.mes);
    if (!esSedeValida(companyId)) return NextResponse.json({ error: "Elige una sede" }, { status: 400 });
    if (!mes) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    const usuario = String(auth.payload?.email || auth.payload?.name || auth.payload?.uid || "");

    if (body.accion === "copiar") {
      const [anteriores, actuales] = await Promise.all([leerMetas([companyId], moverMes(mes, -1)), leerMetas([companyId], mes)]);
      const ya = new Set(actuales.map((m) => m.clave));
      const nuevas = anteriores.filter((m) => !ya.has(m.clave));
      for (const m of nuevas) await guardarMeta(companyId, mes, m.clave, m.marca, m.meta, usuario);
      return NextResponse.json({ success: true, copiadas: nuevas.length });
    }

    if (body.accion === "guardar" && Array.isArray(body.metas)) {
      if (body.metas.length > 500) return NextResponse.json({ error: "Demasiadas metas" }, { status: 400 });
      let guardadas = 0;
      for (const x of body.metas) {
        const marca = String(x?.marca ?? "").trim().slice(0, 255);
        const clave = claveMarca(marca);
        const meta = Number(x?.meta);
        if (!marca || clave === SIN_MARCA || !Number.isFinite(meta) || meta < 0 || meta > 1e10) continue;
        await guardarMeta(companyId, mes, clave.slice(0, 150), marca, meta, usuario);
        guardadas++;
      }
      return NextResponse.json({ success: true, guardadas });
    }

    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error: any) {
    console.error("Error en metas-marca POST:", error?.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
