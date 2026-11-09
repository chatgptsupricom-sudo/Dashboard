import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { SEDES_CLIENTES, validarCliente } from "@/lib/clientes-odoo/validar";
import {
  buscarPorRif,
  ClienteDuplicado,
  crearCliente,
  estadosVenezuela,
  urlContacto,
  vendedoresDeSede,
} from "@/lib/clientes-odoo/odoo";

/**
 * Crear clientes en Odoo desde el panel (lib/clientes-odoo). Por ahora solo
 * el Asistente de Ventas (y el SuperAdmin). El asistente crea en la sede de su
 * `cids`; el SuperAdmin elige Valencia o Caracas.
 *
 *  GET ?sede=            → estados, vendedores de la sede y la sede fija.
 *  GET ?rif=             → fichas de Valencia/Caracas con ese RIF.
 *  POST {ClienteNuevo}   → valida y crea.
 */
const ROLES = ["asistente de ventas"];

function sedeDeSesion(payload: any, pedida: unknown): { sede?: number; fija: boolean; error?: NextResponse } {
  const rol = String(payload?.role || "").toLowerCase().trim();
  const valida = (n: number) => SEDES_CLIENTES.some((s) => s.id === n);
  if (rol === "superadmin") {
    const n = Number(pedida);
    return { sede: valida(n) ? n : SEDES_CLIENTES[0].id, fija: false };
  }
  const cids = Number(payload?.cids);
  if (!valida(cids)) {
    return { fija: true, error: NextResponse.json({ error: "Tu usuario no tiene sede de Venezuela asignada" }, { status: 403 }) };
  }
  return { sede: cids, fija: true };
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const s = sedeDeSesion(auth.payload, params.get("sede"));
  if (s.error) return s.error;

  try {
    const rif = params.get("rif");
    if (rif !== null) return NextResponse.json({ coincidencias: await buscarPorRif(rif) });

    const [estados, vendedores] = await Promise.all([estadosVenezuela(), vendedoresDeSede(s.sede!)]);
    return NextResponse.json({ sede: s.sede, sedeFija: s.fija, sedes: SEDES_CLIENTES, estados, vendedores });
  } catch (e: any) {
    console.error("[clientes-odoo] GET:", e);
    return NextResponse.json({ error: e?.message || "No se pudo leer Odoo" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const s = sedeDeSesion(auth.payload, body.sede);
  if (s.error) return s.error;
  const { errores, valores } = validarCliente({ ...body, sede: s.sede });
  if (Object.keys(errores).length) return NextResponse.json({ error: "Revisa los campos marcados", errores }, { status: 400 });

  try {
    // El vendedor tiene que ser de la sede (no un uid cualquiera mandado a mano).
    const vendedores = await vendedoresDeSede(valores.sede);
    if (!vendedores.some((v) => v.id === valores.vendedorId)) {
      return NextResponse.json({ error: "Revisa los campos marcados", errores: { vendedorId: "Ese vendedor no es de la sede" } }, { status: 400 });
    }
    const p = auth.payload as any;
    const id = await crearCliente(valores, { nombre: String(p?.name || p?.nombre || ""), email: String(p?.email || "") });
    return NextResponse.json({ id, url: urlContacto(id) });
  } catch (e: any) {
    if (e instanceof ClienteDuplicado) {
      return NextResponse.json({ error: e.message, coincidencias: e.coincidencias }, { status: 409 });
    }
    console.error("[clientes-odoo] POST:", e);
    return NextResponse.json({ error: e?.message || "Odoo no pudo crear el cliente" }, { status: 502 });
  }
}
