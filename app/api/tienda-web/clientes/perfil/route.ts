import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { datosAcceso } from "@/lib/tienda-web/clientes/cuentas";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { perfilDe } from "@/lib/tienda-web/clientes/odoo";
import { guardarPerfil, perfilEditable } from "@/lib/tienda-web/clientes/perfil";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * GET /api/tienda-web/clientes/perfil — su vendedor, plazo y cupo por sede (Odoo), los datos de su acceso y
 * `editable`: el perfil que escribe el cliente (nombre, logo, redes, razones sociales con sus sucursales;
 * lib/tienda-web/clientes/perfil.ts).
 */
export async function GET(request: Request) {
  return conSesion(request, "perfil", async (s) => {
    const [perfil, acceso, editable] = await Promise.all([perfilDe(s.cliente), datosAcceso(s.id), perfilEditable(s.cliente)]);
    return jsonTienda({ ...perfil, acceso: { correo: s.correo, ...acceso }, editable });
  });
}

/**
 * POST /api/tienda-web/clientes/perfil {version, nombre, razones, redes, logo?} — guarda el perfil editable.
 * `logo`: data URL (PNG/JPG/WebP, ≤ 400 KB), null para quitarlo, sin el campo para dejarlo como está.
 * 409 si alguien de su empresa lo cambió mientras lo editaba.
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-perfil-guardar", [{ max: 30, ventanaSegundos: 3600 }]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "perfil-guardar", async (s) => {
    const cuerpo = await cuerpoJson(request);
    if (!cuerpo) return jsonTienda({ error: "No pudimos leer los datos del perfil" }, { status: 400 });
    const r = await guardarPerfil(s.cliente, s.correo, cuerpo);
    if (!r.ok) return jsonTienda({ error: r.error, campo: r.campo }, { status: r.status });
    return jsonTienda({ ok: true, editable: r.perfil });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
