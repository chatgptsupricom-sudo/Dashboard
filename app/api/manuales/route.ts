import { requireLector, requireProcesos } from "@/lib/manuales/acceso";
import { codigosUsados, guardarManual, listarManuales } from "@/lib/manuales/datos";
import { puedeLeerManual, tipoManual } from "@/lib/manuales/permisos";
import { SEMILLAS } from "@/lib/manuales/semillas";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Manuales y tutoriales (lib/manuales/datos.ts).
//   GET                 -> { manuales, editor }  Procesos: todos, + roles para marcar lectores y
//                          el contenido base (`semillas`) con si ya está cargado. Otro rol: los
//                          publicados para su rol. ?tipo=manual|tutorial filtra.
//   GET ?resumen=1      -> { manual, tutorial }  cuántos publicados tiene el rol (menú).
//   POST {manual}       -> { id }  crea uno (Procesos).
//   POST {semilla: cod} -> { id }  carga el contenido base con ese código, como borrador (Procesos).

export async function GET(request: NextRequest) {
  const auth = await requireLector(request);
  if (auth.error) return auth.error;
  const rol = auth.payload?.role;
  const todos = await listarManuales();
  const visibles = todos.filter((m) => puedeLeerManual(m, rol));

  const sp = request.nextUrl.searchParams;
  if (sp.get("resumen")) {
    // Para el menú: Procesos ya tiene su ítem "Manuales"; no se le suman los del rol.
    const propios = auth.editor ? [] : visibles;
    return NextResponse.json({
      manual: propios.filter((m) => m.tipo === "manual").length,
      tutorial: propios.filter((m) => m.tipo === "tutorial").length,
    });
  }

  const tipo = sp.get("tipo");
  const manuales = tipo ? visibles.filter((m) => m.tipo === tipoManual(tipo)) : visibles;
  if (!auth.editor) return NextResponse.json({ manuales, editor: false });

  const [filas] = await db.execute("SELECT name, display_name FROM roles ORDER BY display_name, name");
  const roles = (filas as any[])
    .map((f) => ({ rol: String(f.name).toLowerCase().trim(), nombre: String(f.display_name || f.name) }))
    .filter((r) => r.rol && r.rol !== "procesos");
  const usados = await codigosUsados();
  const semillas = SEMILLAS.map((s) => ({
    codigo: s.codigo,
    titulo: s.titulo,
    tipo: s.tipo,
    roles: s.roles,
    cargado: usados.has(s.codigo.toUpperCase()),
  }));
  return NextResponse.json({ manuales, editor: true, roles, semillas });
}

export async function POST(request: NextRequest) {
  const auth = await requireProcesos(request);
  if (auth.error) return auth.error;
  const por = String(auth.payload?.email ?? "");
  try {
    const body = await request.json();
    if (body?.semilla) {
      const semilla = SEMILLAS.find((s) => s.codigo === String(body.semilla));
      if (!semilla) return NextResponse.json({ error: "Ese contenido base no existe." }, { status: 404 });
      if ((await codigosUsados()).has(semilla.codigo.toUpperCase()))
        return NextResponse.json({ error: `Ya hay un manual con el código ${semilla.codigo}.` }, { status: 409 });
      const id = await guardarManual(null, { ...semilla, publicado: false }, por);
      return NextResponse.json({ id });
    }
    const id = await guardarManual(null, body, por);
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
