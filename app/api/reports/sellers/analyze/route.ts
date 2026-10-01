// app/api/reports/sellers/analyze/route.ts
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const auth = await requireRoles(req, ["superadmin", "gerente de operaciones", "gerencia de ventas"]);
  if (auth.error) return auth.error;

  try {
    const { metrics, seller } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Supricom Dashboard",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Eres el Auditor de Inteligencia Artificial Comercial de Supricom. Tu trabajo es evaluar el desempeño de ventas de un vendedor cruzando los datos del mes vivo extraídos de Odoo.

            Debes analizar críticamente:
            1. Rendimiento Diario: Compara "revenueActualDay" (lo que hace por día) contra "revenueTargetDay" (lo que debe hacer por día).
            2. Análisis de Productos: Revisa "productsArray". Identifica cuál es su producto fuerte. Detecta si ha bajado la venta de un producto que solía mover mucho o si el volumen actual es insuficiente para la meta.
            3. Detección de Oportunidades: Evalúa cuál es el producto que MENOS vende (o que está en el fondo de la lista) pero que tiene potencial, para indicarle que debe enfocar su esfuerzo de venta cruzada ahí.

            Entrega tu respuesta estructurada ÚNICAMENTE en este formato JSON:
            {
              "status": "Excelente" | "Estable" | "Bajo Rendimiento Alerta",
              "diagnostic": "Análisis ejecutivo de por qué subió o bajó el rendimiento del mes. Nombra qué producto estrella ha perdido fuerza o cuál se mantiene como pilar.",
              "pointsOfFailure": ["Anomalía diaria de cuota", "Desplome específico en el producto X", "Abandono de la línea Y"],
              "recommendations": ["Recomendación para alcanzar la cuota diaria requerida.", "Estrategia para impulsar el producto de menor venta que está estancado."]
            }`,
            },
            {
              role: "user",
              content: `Auditoría del mes para el asesor: ${seller}. Dataset de Odoo: ${JSON.stringify(metrics)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    const aiResult = await response.json();
    const contentString = aiResult.choices[0].message?.content;
    return NextResponse.json(JSON.parse(contentString));
  } catch (error: any) {
    console.error("Error en análisis IA:", error);
    return NextResponse.json({
      status: "Estable",
      diagnostic: "Error al procesar la auditoría con el Agente de Odoo.",
      pointsOfFailure: [error.message],
      recommendations: ["Reintentar auditoría."],
    });
  }
}
