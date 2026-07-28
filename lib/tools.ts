// lib/tools.ts
import { OpenAI } from "openai";

export const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "consultar_mysql",
      description:
        "Ejecuta consultas SQL SELECT de solo lectura en la base de datos local de Supricom.",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "Consulta SQL SELECT limpia." },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_odoo_rpc",
      description:
        "Llamadas RPC a Odoo. Si necesitas el Top y los detalles, genera una lista de llamadas de herramientas paralelas en tu respuesta.",
      parameters: {
        type: "object",
        properties: {
          model: {
            type: "string",
            description:
              "Modelo (ej. 'account.move', 'account.move.line', 'res.users', 'res.partner', 'res.company', 'product.template')",
          },
          method: {
            type: "string",
            description: "'search_read' o 'read_group'",
          },
          domain: {
            type: "array",
            items: {},
            description:
              "Filtros de búsqueda (ej. [['date','>=','2026-05-01']])",
          },
          fields: {
            type: "array",
            items: { type: "string" },
            description: "Campos a consultar (Para read_group usa :sum)",
          },
          groupby: {
            type: "array",
            items: { type: "string" },
            description: "Exclusivo para read_group (ej. ['invoice_user_id'])",
          },
          limit: {
            type: "number",
            description: "Máximo de resultados (ej. 5 para un top 5)",
          },
          order: {
            type: "string",
            description: "Ordenamiento (ej. 'amount_total:sum DESC')",
          },
          target_company_id: {
            type: "number",
            description:
              "ID de la sucursal (cids). 9=Valencia (POR DEFECTO), 10=Caracas/'el cap', 7=Panamá.",
          },
        },
        required: ["model", "method", "domain", "fields"],
      },
    },
  },
];
