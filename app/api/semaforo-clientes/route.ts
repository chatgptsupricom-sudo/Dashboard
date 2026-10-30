import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { SEDES_VALIDAS, sedeDelToken } from "@/lib/auth/sedeRol";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { OdooUnreachableError } from "@/lib/odoo";
import { ROLES_SEMAFORO, esVendedor } from "@/lib/semaforo-clientes/acceso";
import { fotoAnterior, guardarFoto, leerConfig, semaforoDeSede } from "@/lib/semaforo-clientes/datos";
import { VENTANAS, type FilaSemaforo, type RespuestaSemaforo, type Ventana } from "@/lib/semaforo-clientes/tipos";

export const dynamic = "force-dynamic";

/**
 * GET /api/semaforo-clientes?sede=9|10|7|todas&ventana=30|60|90
 * Semáforo de la cartera (lib/semaforo-clientes). El vendedor recibe solo sus
 * clientes; la Gerencia de Ventas, su sede; SuperAdmin y BI eligen sede.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SEMAFORO);
  if (auth.error) return auth.error;
  const payload = auth.payload!;
  const rol = String(payload.role || "").toLowerCase().trim();
  const sp = request.nextUrl.searchParams;

  let sedes: number[];
  if (veTodasLasSedes(rol)) {
    const pedida = sp.get("sede") || "9";
    sedes = pedida === "todas" ? [...SEDES_VALIDAS] : SEDES_VALIDAS.includes(Number(pedida)) ? [Number(pedida)] : [];
    if (!sedes.length) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  } else {
    const sede = sedeDelToken(payload);
    if (sede) sedes = [sede];
    // Un vendedor sin sede ve su cartera en las tres; la gerencia necesita su sede.
    else if (esVendedor(rol)) sedes = [...SEDES_VALIDAS];
    else return NextResponse.json({ error: "Tu usuario no tiene sede asignada" }, { status: 403 });
  }

  const soloCartera = esVendedor(rol);
  const uid = Number(payload.uid) || null;
  if (soloCartera && !uid) return NextResponse.json({ error: "Tu usuario no tiene vendedor en Odoo" }, { status: 403 });

  const { config } = await leerConfig();
  const pedidaVentana = Number(sp.get("ventana"));
  const ventana: Ventana = (VENTANAS as readonly number[]).includes(pedidaVentana) ? (pedidaVentana as Ventana) : config.ventanaDias;
  // La foto semanal y la comparación contra ella usan solo la ventana de la configuración.
  const conFoto = ventana === config.ventanaDias;

  try {
    let sinSmartbit = false;
    let semanaAnterior: string | null = null;
    let fotoEstaSemana = conFoto;
    const porSede = await Promise.all(
      sedes.map(async (cid) => {
        const s = await semaforoDeSede(cid, ventana, config);
        sinSmartbit ||= s.sinSmartbit;
        if (!conFoto) return s.filas;
        await guardarFoto(cid, ventana, s.filas).catch((e) => {
          fotoEstaSemana = false;
          console.error("[semaforo-clientes] foto:", e?.message);
        });
        const anterior = await fotoAnterior(cid);
        if (anterior.semana && (!semanaAnterior || anterior.semana > semanaAnterior)) semanaAnterior = anterior.semana;
        return s.filas.map((f) => ({ ...f, estadoAnterior: anterior.estados.get(f.id) ?? null }));
      }),
    );
    let filas: FilaSemaforo[] = porSede.flat();
    if (soloCartera) filas = filas.filter((f) => f.vendedorId === uid);

    const respuesta: RespuestaSemaforo = {
      hoy: hoyCaracas(),
      ventana,
      config,
      sedes,
      filas,
      fotoAnterior: semanaAnterior,
      fotoEstaSemana,
      sinSmartbit,
      puedeConfigurar: rol === "superadmin",
      soloCartera,
      eligeSede: veTodasLasSedes(rol),
    };
    return NextResponse.json(respuesta);
  } catch (e: any) {
    console.error("[semaforo-clientes]", e?.message);
    return NextResponse.json(
      { error: "No se pudo leer Odoo. Intenta de nuevo.", odooCaido: e instanceof OdooUnreachableError },
      { status: 502 },
    );
  }
}
