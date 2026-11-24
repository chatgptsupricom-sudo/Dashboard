import { NextRequest, NextResponse } from "next/server";
import { alcanceRotacion, puedeVerSolicitud } from "@/lib/rotacion-inventario/alcance";
import { excelSolicitud, leerSolicitud } from "@/lib/rotacion-inventario/solicitudes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — el Excel que se le manda a la marca (el mismo que adjunta el correo). */
export async function GET(request: NextRequest, ctx: Ctx) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const id = Number((await ctx.params).id);
  const s = id > 0 ? await leerSolicitud(id) : null;
  if (!s || !puedeVerSolicitud(a, s)) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  const { archivo, buffer } = await excelSolicitud(s.id);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
    },
  });
}
