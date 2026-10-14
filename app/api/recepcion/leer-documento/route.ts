import { requireRoles } from "@/lib/auth/roles";
import { MAX_PRECINTOS, limpiarPrecintos } from "@/lib/recepcion/flujo";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/recepcion/leer-documento  (multipart: archivo)
 *
 * Lee un packing list en PDF o foto y devuelve lo que trae adentro:
 * renglones, numero de contenedor, precintos, proveedor y referencia. Los
 * Excel NO pasan por aca: esos los lee la pantalla sola (lib/recepcion/leerExcel).
 *
 * Es una ayuda para no transcribir a mano: lo leido cae en la grilla y
 * Compras lo revisa antes de guardar. Nada se guarda desde esta ruta.
 *
 * Lo lee Claude: RECEPCION_IA_MODELO, o el del Agente IA (AGENTE_IA_MODELO), o
 * claude-opus-5-5. Necesita ANTHROPIC_API_KEY.
 */

const MODELO =
  process.env.RECEPCION_IA_MODELO?.trim() || process.env.AGENTE_IA_MODELO?.trim() || "claude-opus-5-5";
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

// El cliente se crea al usarlo: asi el build no necesita ANTHROPIC_API_KEY y, si
// falta en runtime, falla solo esta ruta con un error claro.
let cliente: Anthropic | null = null;
// Una API key que no pertenece a un workspace exige decir cual usar.
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
const anthropic = () =>
  (cliente ??= new Anthropic(WORKSPACE ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE } } : {}));

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Falta configurar ANTHROPIC_API_KEY en el servidor" },
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

    const datos = Buffer.from(await archivo.arrayBuffer()).toString("base64");
    const documento: Anthropic.ContentBlockParam =
      clase === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: datos } }
        : {
            type: "image",
            source: { type: "base64", media_type: archivo.type as "image/jpeg" | "image/png" | "image/webp", data: datos },
          };

    // En streaming: un packing list largo (300 renglones) puede pasar del
    // tiempo de una llamada normal.
    const respuesta = await anthropic()
      .messages.stream({
        model: MODELO,
        max_tokens: 64000,
        system: INSTRUCCIONES,
        output_config: { format: { type: "json_schema", schema: ESQUEMA as any }, effort: "medium" },
        messages: [
          { role: "user", content: [documento, { type: "text", text: "Lee este documento y devuelve sus datos." }] },
        ],
      })
      .finalMessage();

    if (respuesta.stop_reason === "refusal") {
      return NextResponse.json({ error: "El documento no se pudo leer" }, { status: 422 });
    }
    if (respuesta.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "El documento es demasiado largo para leerlo de una vez" },
        { status: 422 },
      );
    }

    let leido: any = {};
    try {
      leido = JSON.parse(
        respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join("") || "{}",
      );
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
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json(
        { error: "La IA no está configurada en el servidor (falta o no sirve ANTHROPIC_API_KEY)" },
        { status: 503 },
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "La IA está recibiendo demasiadas consultas. Intenta de nuevo en un minuto." },
        { status: 429 },
      );
    }
    console.error("[recepcion] no se pudo leer el documento:", e?.status, e?.message);
    return NextResponse.json({ error: "No se pudo leer el documento" }, { status: 502 });
  }
}
