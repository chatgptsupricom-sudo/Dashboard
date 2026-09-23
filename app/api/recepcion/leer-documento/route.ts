import { requireRoles } from "@/lib/auth/roles";
import { MAX_PRECINTOS, limpiarPrecintos } from "@/lib/recepcion/flujo";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/recepcion/leer-documento  (multipart: archivo)
 *
 * Lee un packing list en PDF o foto y devuelve lo que trae adentro:
 * renglones, numero de contenedor, precintos, proveedor y referencia. Los
 * Excel NO pasan por aca: esos los lee la pantalla sola (lib/recepcion/leerExcel).
 *
 * Es una ayuda para no transcribir a mano: lo leido cae en la grilla y
 * Compras lo revisa antes de guardar. Nada se guarda desde esta ruta.
 */

const MODELO = process.env.OPENAI_VISION_MODEL || "gpt-4o";
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_RENGLONES = 300;
const TIPOS: Record<string, "pdf" | "imagen"> = {
  "application/pdf": "pdf",
  "image/jpeg": "imagen",
  "image/png": "imagen",
  "image/webp": "imagen",
};

const INSTRUCCIONES =
  "Eres un asistente de la gente de Compras de una empresa que importa equipos. " +
  "Te dan un packing list, una factura o un documento de embarque. " +
  "Devuelve SOLO los datos que estan en el documento, sin inventar ni completar nada: " +
  "si un dato no aparece, dejalo vacio. " +
  "renglones: una fila por producto, con su codigo (la columna CODE/CODIGO/SKU, vacio si no hay), " +
  "la descripcion tal cual, la cantidad (QTY) y las cajas si el documento las separa (0 si no). " +
  "No incluyas totales, fletes, subtotales ni lineas que no sean productos. " +
  "contenedor: el numero de contenedor (CONTAINER NUMBER), en mayusculas. " +
  "precintos: los numeros de precinto (SEAL NUMBER). Si vienen varios en el mismo campo, " +
  "separados por espacio o coma, devuelvelos como elementos distintos de la lista. " +
  "proveedor: quien emite el documento. referencia: el numero de packing list, factura o BL.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proveedor", "referencia", "contenedor", "precintos", "renglones"],
  properties: {
    proveedor: { type: "string" },
    referencia: { type: "string" },
    contenedor: { type: "string" },
    precintos: { type: "array", items: { type: "string" } },
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "producto", "cantidad", "cajas"],
        properties: {
          codigo: { type: "string" },
          producto: { type: "string" },
          cantidad: { type: "number" },
          cajas: { type: "number" },
        },
      },
    },
  },
} as const;

// El cliente se crea al usarlo: asi el build no necesita OPENAI_API_KEY y, si
// falta en runtime, falla solo esta ruta con un error claro.
let cliente: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!cliente) cliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return cliente;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar OPENAI_API_KEY en el servidor" },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo pesa mas de 15 MB" }, { status: 413 });
    }
    const clase = TIPOS[archivo.type];
    if (!clase) {
      return NextResponse.json(
        { error: "Solo se puede leer un PDF o una foto (JPG, PNG o WEBP)" },
        { status: 415 },
      );
    }

    const datos = `data:${archivo.type};base64,${Buffer.from(await archivo.arrayBuffer()).toString("base64")}`;
    const contenido: any[] = [
      { type: "input_text", text: "Lee este documento y devuelve sus datos." },
      clase === "pdf"
        ? { type: "input_file", filename: archivo.name || "packing-list.pdf", file_data: datos }
        : { type: "input_image", image_url: datos },
    ];

    const respuesta = await getOpenAI().responses.create({
      model: MODELO,
      instructions: INSTRUCCIONES,
      input: [{ role: "user", content: contenido }],
      text: {
        format: { type: "json_schema", name: "packing_list", strict: true, schema: ESQUEMA as any },
      },
    });

    let leido: any = {};
    try {
      leido = JSON.parse(respuesta.output_text || "{}");
    } catch {
      return NextResponse.json({ error: "El documento no se pudo leer" }, { status: 422 });
    }

    // Se limpia aca lo que devuelve el modelo: la pantalla recibe siempre lo
    // mismo que escribiria una persona a mano.
    const renglones = (Array.isArray(leido.renglones) ? leido.renglones : [])
      .map((r: any) => ({
        codigo: texto(r?.codigo, 100),
        producto: texto(r?.producto, 300),
        cantidad_esperada: Number(r?.cantidad),
        cajas_esperadas: Number(r?.cajas) > 0 ? Math.round(Number(r.cajas)) : null,
      }))
      .filter((r: any) => r.producto && Number.isFinite(r.cantidad_esperada) && r.cantidad_esperada >= 0)
      .slice(0, MAX_RENGLONES);

    return NextResponse.json({
      success: true,
      datos: {
        proveedor: texto(leido.proveedor, 200),
        referencia: texto(leido.referencia, 100),
        contenedor: texto(leido.contenedor, 50).toUpperCase(),
        precintos: limpiarPrecintos(leido.precintos).slice(0, MAX_PRECINTOS),
        renglones,
      },
    });
  } catch (e: any) {
    console.error("[recepcion] no se pudo leer el documento:", e?.message);
    return NextResponse.json({ error: "No se pudo leer el documento" }, { status: 502 });
  }
}
