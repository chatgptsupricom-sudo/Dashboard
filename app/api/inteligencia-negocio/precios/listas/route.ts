import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { cargarArchivo } from "@/lib/inteligencia-negocio/precios/cargar";
import { estadoClasificacion, iniciarClasificacion } from "@/lib/inteligencia-negocio/precios/clasificar";
import { borrarCarga, listarCargas } from "@/lib/inteligencia-negocio/precios/datos";
import { hayIA } from "@/lib/inteligencia-negocio/clasificacion/ia";
import { consolidado } from "@/lib/inteligencia-negocio/precios/mercado";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ARCHIVO = 15 * 1024 * 1024;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Listas de precios de los mayoristas (lib/inteligencia-negocio/precios/cargar.ts).
 * GET: las cargas con su resumen y el avance de la clasificación.
 * POST multipart: archivo_0..n, mayorista_0..n, iva_0..n ("si"/"no"/""), fecha_corte.
 * DELETE ?id=: borra una carga.
 * Inteligencia de Negocio escribe aquí: las listas son suyas (`escribeBI`).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;
  try {
    const [cargas, { porCarga }] = await Promise.all([listarCargas(), consolidado()]);
    // Una clasificación que se cortó (reinicio del servidor) se retoma sola.
    if (!estadoClasificacion().corriendo && cargas.some((c) => c.estado === "clasificando" && (c.pendientes || 0) > 0)) {
      iniciarClasificacion(auth.payload?.email);
    }
    return NextResponse.json({
      success: true,
      data: {
        cargas: cargas.map((c) => ({ ...c, comparacion: porCarga.get(c.id) || null })),
        estado: estadoClasificacion(),
        hayIA: hayIA(),
      },
    });
  } catch (e: any) {
    console.error("[precios/listas GET]", e?.message);
    return NextResponse.json({ error: "No se pudieron leer las listas." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Envía los archivos como formulario." }, { status: 400 });
  const fechaCorte = String(form.get("fecha_corte") || "");
  if (!FECHA.test(fechaCorte)) return NextResponse.json({ error: "Elige la fecha de corte." }, { status: 400 });
  const resultados: any[] = [];
  for (let i = 0; i < 30; i++) {
    const archivo = form.get(`archivo_${i}`);
    if (!archivo || typeof archivo === "string") continue;
    const nombre = (archivo as File).name || `lista_${i + 1}.xlsx`;
    if ((archivo as File).size > MAX_ARCHIVO) {
      resultados.push({ archivo: nombre, error: "El archivo pasa de 15 MB." });
      continue;
    }
    const iva = String(form.get(`iva_${i}`) || "");
    try {
      const buffer = Buffer.from(await (archivo as File).arrayBuffer());
      resultados.push(
        await cargarArchivo(buffer, nombre, {
          mayorista: String(form.get(`mayorista_${i}`) || "").trim() || undefined,
          fechaCorte,
          ivaIncluido: iva === "si" ? true : iva === "no" ? false : undefined,
          usuario: auth.payload?.email || null,
        }),
      );
    } catch (e: any) {
      console.error("[precios/listas POST]", nombre, e?.message);
      resultados.push({ archivo: nombre, error: e?.message || "No se pudo leer el archivo." });
    }
  }
  if (!resultados.length) return NextResponse.json({ error: "No llegó ningún archivo." }, { status: 400 });
  return NextResponse.json({ success: true, data: { resultados, estado: estadoClasificacion(), hayIA: hayIA() } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta la carga." }, { status: 400 });
  const ok = await borrarCarga(id);
  return ok ? NextResponse.json({ success: true }) : NextResponse.json({ error: "No existe esa carga." }, { status: 404 });
}
