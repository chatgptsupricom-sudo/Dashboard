import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { ROLES_ADMINISTRACION } from "@/lib/auth/sedeRol";
import { companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { fotoDelDia, historialCredito } from "@/lib/cxc/historialCredito";
import { hoyCaracas, sumarDias } from "@/lib/compras/datosOdoo";
import { NextRequest, NextResponse } from "next/server";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";

// Historial del crédito (lib/cxc/historialCredito.ts): cambios de cupo y
// excesos entre `desde` y `hasta` (default: últimos 30 días), o con `fecha`
// el cupo y la deuda de cada cliente ese día. Mismos roles que Sobregiro.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, ROL_BI, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const sp = new URL(request.url).searchParams;
    const companyIds = companyIdsEnAlcance(auth.payload, sp.get("empresa") || "");
    if (companyIds.length === 0) {
      return NextResponse.json({ error: "No tienes acceso a esa sede" }, { status: 403 });
    }

    const fecha = sp.get("fecha") || "";
    if (fecha) {
      if (!FECHA.test(fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
      return NextResponse.json({ success: true, data: { fecha, clientes: await fotoDelDia(companyIds, fecha) } });
    }

    const hoy = hoyCaracas();
    const hasta = FECHA.test(sp.get("hasta") || "") ? sp.get("hasta")! : hoy;
    const desde = FECHA.test(sp.get("desde") || "") ? sp.get("desde")! : sumarDias(hasta, -30);
    if (desde > hasta) return NextResponse.json({ error: "La fecha inicial es posterior a la final" }, { status: 400 });

    const data = await historialCredito(companyIds, desde, hasta);
    return NextResponse.json({ success: true, data: { ...data, desde, hasta } });
  } catch (error: any) {
    console.error("Error historial de crédito:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Inteligencia de Negocio: sin intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);
