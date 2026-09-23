import { NextRequest, NextResponse } from "next/server";
import { accesoPlanificacion, asesoresDeSede } from "@/lib/visitas/acceso";
import { guardarPlan, leerPlan, lunesDe, planVacio, semanaISO, type Plan } from "@/lib/visitas/planificacion";

export const dynamic = "force-dynamic";

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Resuelve el asesor pedido según el rol: el vendedor solo el suyo. */
async function asesorPedido(acceso: Awaited<ReturnType<typeof accesoPlanificacion>> & { error?: undefined }, userIdParam: string | null) {
  const asesores = await asesoresDeSede(acceso.companyId);
  if (acceso.rol === "vendedor") {
    const yo = asesores.find((a) => a.userId === acceso.uid);
    return { asesores: yo ? [yo] : [], asesor: yo ?? null };
  }
  const pedido = Number(userIdParam);
  return { asesores, asesor: asesores.find((a) => a.userId === pedido) ?? asesores[0] ?? null };
}

/** GET ?semana=YYYY-MM-DD&user_id= → plan de esa semana (o uno vacío). */
export async function GET(request: NextRequest) {
  const acceso = await accesoPlanificacion(request);
  if (acceso.error) return acceso.error;
  try {
    const sp = request.nextUrl.searchParams;
    const semana = lunesDe(/^\d{4}-\d{2}-\d{2}$/.test(sp.get("semana") || "") ? sp.get("semana")! : hoyISO());
    const { asesores, asesor } = await asesorPedido(acceso, sp.get("user_id"));
    if (!asesor) {
      return NextResponse.json({ success: true, data: { rol: acceso.rol, asesores, plan: null } });
    }
    const plan = (await leerPlan(acceso.companyId, asesor.userId, semana))
      ?? planVacio(acceso.companyId, asesor.userId, asesor.nombre, semana);
    return NextResponse.json({ success: true, data: { rol: acceso.rol, asesores, plan } });
  } catch (error: any) {
    console.error("Error leyendo planificación:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/** PUT { plan } → guarda encabezado, matriz y cronograma. */
export async function PUT(request: NextRequest) {
  const acceso = await accesoPlanificacion(request);
  if (acceso.error) return acceso.error;
  if (acceso.rol === "lectura") return NextResponse.json({ error: "Solo lectura" }, { status: 403 });
  try {
    const body = await request.json();
    const p = body?.plan as Plan;
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.semanaInicio))) {
      return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
    }
    const { asesor } = await asesorPedido(acceso, String(p.userId));
    if (!asesor || asesor.userId !== Number(p.userId)) {
      return NextResponse.json({ error: "Asesor no válido" }, { status: 403 });
    }
    const semana = lunesDe(p.semanaInicio);
    await guardarPlan({
      companyId: acceso.companyId,
      userId: asesor.userId,
      vendedor: asesor.nombre,
      semanaInicio: semana,
      semanaNumero: Number(p.semanaNumero) || semanaISO(semana),
      zonaRuta: String(p.zonaRuta || ""),
      marcasPriorizadas: String(p.marcasPriorizadas || ""),
      matriz: Array.isArray(p.matriz) ? p.matriz : [],
      items: (Array.isArray(p.items) ? p.items : []).map((it: any) => ({
        id: it.id ? Number(it.id) : undefined,
        fecha: String(it.fecha || "").slice(0, 10),
        bloque: it.bloque === "tarde" ? "tarde" : "manana",
        zona: String(it.zona || ""),
        cliente: String(it.cliente || ""),
        tema: String(it.tema || ""),
        objetivo: String(it.objetivo || ""),
        foranea: it.foranea !== false,
        estado: "planificada",
        nota: "",
      })),
    }, acceso.usuario);
    const plan = await leerPlan(acceso.companyId, asesor.userId, semana);
    return NextResponse.json({ success: true, data: { plan } });
  } catch (error: any) {
    console.error("Error guardando planificación:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
