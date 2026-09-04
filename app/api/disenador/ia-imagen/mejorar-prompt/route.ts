import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// "Mejorar con IA": GPT-4o (con visión) mira la imagen fuente + la idea en
// borrador del diseñador y devuelve un prompt más específico para Seedream.
// No genera ni edita imágenes — solo redacta la instrucción.
const OPENAI_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const SYSTEM_PROMPT =
  "Eres un asistente para diseñadores gráficos que preparan prompts para un modelo de edición de imágenes por IA (Seedream). " +
  "Te dan una imagen y la idea del diseñador (puede venir vaga, incompleta o en spanglish). " +
  "Devuelve ÚNICAMENTE el prompt final en español: una instrucción específica, concreta y accionable que describa " +
  "exactamente qué cambiar en la imagen y qué mantener igual (pose, encuadre, marca, texto, etc. si aplica). " +
  "Sin explicaciones, sin comillas, sin markdown, sin prefijos como 'Prompt:'. Máximo 3 frases.";

// El cliente se crea al usarlo, no al importar el módulo: así el build no
// necesita OPENAI_API_KEY presente (new OpenAI({apiKey: undefined}) lanza al
// instante) y, si falta en runtime, falla solo esta ruta con un error claro.
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// FormData: draft (opcional) + image (File) ó source_design_id.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const draft = ((formData.get("draft") as string) || "").trim();
    const image = formData.get("image") as File | null;
    const sourceDesignId = formData.get("source_design_id") as string | null;

    let buffer: Buffer;
    let mime: string;

    if (image && image.size > 0) {
      buffer = Buffer.from(await image.arrayBuffer());
      mime = image.type || "image/png";
    } else if (sourceDesignId) {
      const r = await query(`SELECT image_data, image_mime FROM designer_designs WHERE id = ?`, [sourceDesignId]);
      const row = r.rows?.[0];
      if (!row?.image_data) {
        return NextResponse.json({ success: false, error: "El diseño de origen no existe" }, { status: 200 });
      }
      buffer = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
      mime = row.image_mime || "image/png";
    } else {
      return NextResponse.json({ success: false, error: "Falta la imagen" }, { status: 200 });
    }

    if (!IMAGE_TYPES.includes(mime)) {
      return NextResponse.json(
        { success: false, error: "Formato de imagen no soportado para el asistente (usa PNG, JPG, WEBP o GIF)" },
        { status: 200 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Falta configurar OPENAI_API_KEY en el servidor" },
        { status: 200 }
      );
    }

    const userText = draft
      ? `Idea del diseñador: "${draft}"`
      : "El diseñador no escribió una idea concreta: mira la imagen y sugiere una edición creativa y razonable.";

    const completion = await getOpenAI().chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}` } },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("El modelo no devolvió texto");

    return NextResponse.json({ success: true, prompt: text });
  } catch (error: any) {
    console.error("POST /api/disenador/ia-imagen/mejorar-prompt:", error.message);
    // 200 a propósito: un 5xx aquí hace que el proxy (Easypanel) reemplace el
    // cuerpo con su página genérica de error en vez de dejar pasar este JSON.
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}
