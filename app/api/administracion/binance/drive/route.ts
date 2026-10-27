import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import {
  completarConexion,
  ErrorDrive,
  estadoDrive,
  idDeEnlace,
  iniciarConexion,
  listarCarpeta,
} from "@/lib/administracion/googleDrive";
import { getPublicOrigin } from "@/lib/publicOrigin";

// Google Drive de la Conciliación Binance (lib/administracion/googleDrive.ts).
//
//   GET ?estado=1    -> { configurado, conectado, correo }
//   GET              -> redirige al consentimiento de Google
//   GET ?code&state  -> vuelta de Google: guarda el acceso y regresa a la pantalla
//   POST {url}       -> fotos y PDF de la carpeta: { carpeta, archivos: [{id, nombre, carpeta}] }
//
// La redirección que hay que registrar en el cliente OAuth de Google es
// <panel>/api/administracion/binance/drive.

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const p = request.nextUrl.searchParams;
  if (p.has("estado")) return NextResponse.json(await estadoDrive());
  const origen = getPublicOrigin(request);
  const vuelta = `${origen}/api/administracion/binance/drive`;
  try {
    const code = p.get("code");
    if (code) {
      await completarConexion(code, p.get("state") || "", vuelta, String(auth.payload?.email || ""));
      return NextResponse.redirect(`${origen}/administracion/binance`);
    }
    if (p.has("error")) throw new ErrorDrive(`Google no autorizó la conexión (${p.get("error")})`);
    return NextResponse.redirect(iniciarConexion(vuelta));
  } catch (e: any) {
    console.error("[binance] drive oauth:", e?.message);
    return NextResponse.json({ error: e?.message || "No se pudo conectar Google Drive" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const b = await request.json().catch(() => ({}));
  const id = idDeEnlace(String(b?.url || ""));
  if (!id) return NextResponse.json({ error: "Pega el enlace de una carpeta de Google Drive" }, { status: 400 });
  try {
    const { nombre, archivos } = await listarCarpeta(id);
    return NextResponse.json({ success: true, carpeta: nombre, archivos });
  } catch (e: any) {
    if (e instanceof ErrorDrive) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[binance] drive listar:", e?.message);
    return NextResponse.json({ error: "No se pudo leer la carpeta de Drive" }, { status: 500 });
  }
}
