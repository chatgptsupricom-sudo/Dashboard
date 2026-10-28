import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * IA de la Clasificación: texto → JSON con esquema. Como la conciliación de
 * Binance (lib/administracion/binance.ts), usa OpenAI si hay
 * `OPENAI_API_KEY` y si no Claude (oct-2026 la cuenta de Anthropic se quedó
 * sin saldo). Modelo: `CLASIFICACION_IA_MODELO`, si no el de siempre de
 * cada proveedor.
 */

const MODELO_OPENAI = process.env.CLASIFICACION_IA_MODELO?.trim() || "gpt-4o";
const MODELO_CLAUDE =
  process.env.CLASIFICACION_IA_MODELO?.trim() || process.env.AGENTE_IA_MODELO?.trim() || "claude-sonnet-5-5";
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

let openaiCliente: OpenAI | null = null;
let anthropicCliente: Anthropic | null = null;

export const hayIA = () => !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

/** Respuesta de la IA según `esquema` (JSON Schema estricto: todo requerido, sin propiedades extra). */
export async function pedirJSON<T>(sistema: string, pedido: string, esquema: object, maxTokens: number): Promise<T> {
  let texto = "";
  if (process.env.OPENAI_API_KEY) {
    openaiCliente ??= new OpenAI();
    const r = await openaiCliente.chat.completions.create({
      model: MODELO_OPENAI,
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: "json_schema", json_schema: { name: "clasificacion", strict: true, schema: esquema as any } },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: pedido },
      ],
    });
    if (r.choices[0]?.finish_reason === "length") throw new Error("La IA cortó la respuesta");
    texto = r.choices[0]?.message?.content || "";
  } else if (process.env.ANTHROPIC_API_KEY) {
    anthropicCliente ??= new Anthropic(WORKSPACE ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE } } : {});
    const r = await anthropicCliente.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: maxTokens,
      system: sistema,
      output_config: { format: { type: "json_schema", schema: esquema as any }, effort: "low" },
      messages: [{ role: "user", content: pedido }],
    });
    if (r.stop_reason === "max_tokens") throw new Error("La IA cortó la respuesta");
    texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } else {
    throw new Error("No hay IA configurada (OPENAI_API_KEY o ANTHROPIC_API_KEY)");
  }
  return JSON.parse(texto) as T;
}
