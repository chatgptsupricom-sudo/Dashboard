import { requireRoles } from "@/lib/auth/roles";
import { MAX_PRECINTOS, limpiarPrecintos } from "@/lib/recepcion/flujo";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/recepcion/leer-documento  (multipart: archivo)
 *
 * Lee un packing list en PDF o foto y devuelve lo que trae adentro:
 * renglones, contenedores con sus precintos, proveedor y referencia. Los
 * Excel NO pasan por aca: esos los lee la pantalla sola (lib/recepcion/leerExcel).
 *
 * Un embarque puede venir en varios contenedores, cada uno en su pagina (y
 * repetido en el dock receipt): se devuelven todos, sin repetir, y los
 * renglones se juntan por producto, porque los renglones de la recepcion son
 * del embarque entero, no de cada contenedor.
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
// El mismo tope que acepta la recepcion (lib/recepcion/validacion.ts).
const MAX_CONTENEDORES = 50;
const TIPOS: Record<string, "pdf" | "imagen"> = {
  "application/pdf": "pdf",
  "image/jpeg": "imagen",
  "image/png": "imagen",
  "image/webp": "imagen",
};

const INSTRUCCIONES =
  "Eres un asistente de la gente de Compras de una empresa que importa equipos. " +
  "Te dan un packing list, una factura o un documento de embarque, que puede tener muchas paginas. " +
  "Lee TODAS las paginas. Devuelve SOLO los datos que estan en el documento, sin inventar ni completar nada: " +
  "si un dato no aparece, dejalo vacio. " +
  "contenedores: TODOS los contenedores del embarque, uno por cada numero de contenedor distinto " +
  "(CONTAINER NUMBER, CARRIER ID, TR#, CNTR), en mayusculas, aunque el documento traiga una pagina por contenedor. " +
  "Si el mismo contenedor aparece en varias paginas (packing list, dock receipt, BL), va una sola vez. " +
  "Si dice cuantos contenedores son (Num Containers, 7 x 40'), revisa que esten todos. " +
  "precintos de cada contenedor: los numeros de precinto (SEAL NUMBER, SEAL #) de ese contenedor. " +
  "Si en una pagina el precinto sale abreviado y en otra completo (013775 y PTC013775), usa el completo una sola vez. " +
  "Si vienen varios en el mismo campo, separados por espacio o coma, son elementos distintos de la lista. " +
  "renglones: una fila por producto (ITEM) de cada contenedor, con el contenedor donde viene, su codigo " +
  "(la columna CODE/CODIGO/SKU/ITEM, vacio si no hay), la descripcion tal cual, la cantidad total de ese producto " +
  "en ese contenedor (QTY o Item Total) y las cajas o cartones (CTNS) si el documento las dice (0 si no); " +
  "si el contenedor trae un solo producto y el dock receipt dice los cartones de ese contenedor, esas son sus cajas. " +
  "Si el detalle trae una linea por pallet, rollo o bulto (Roll/Pkg), NO es un renglon: usa el total del producto. " +
  "No saques renglones del dock receipt ni de la confirmacion de booking si el packing list ya trae el detalle. " +
  "No incluyas totales generales, fletes, subtotales ni lineas que no sean productos. " +
  "proveedor: quien emite el documento. referencia: el numero de packing list, factura o BL.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proveedor", "referencia", "contenedores", "renglones"],
  properties: {
    proveedor: { type: "string" },
    referencia: { type: "string" },
    contenedores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["numero", "precintos"],
        properties: {
          numero: { type: "string" },
          precintos: { type: "array", items: { type: "string" } },
        },
      },
    },
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["contenedor", "codigo", "producto", "cantidad", "cajas"],
        properties: {
          contenedor: { type: "string" },
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

type ContenedorLeido = { numero: string; precintos: string[] };

/**
 * Los contenedores sin repetir: el mismo numero puede salir en el packing list
 * y en el dock receipt, a veces con espacios o guiones distintos. Sus
 * precintos se juntan, y si uno es el otro sin prefijo (013775 / PTC013775)
 * queda solo el completo.
 */
function juntarContenedores(lista: unknown): ContenedorLeido[] {
  const porNumero = new Map<string, ContenedorLeido>();
  for (const c of Array.isArray(lista) ? lista : []) {
    const numero = texto((c as any)?.numero, 50).toUpperCase().replace(/[\s-]+/g, "");
    if (!numero) continue;
    const previo = porNumero.get(numero);
    const precintos = limpiarPrecintos([...(previo?.precintos || []), ...limpiarPrecintos((c as any)?.precintos)]);
    porNumero.set(numero, { numero, precintos });
  }
  return [...porNumero.values()].map((c) => {
    const llave = (p: string) => p.replace(/[^A-Z0-9]/g, "");
    const precintos = c.precintos.filter(
      (p) => !c.precintos.some((q) => q !== p && llave(q).length > llave(p).length && llave(q).endsWith(llave(p))),
    );
    return { numero: c.numero, precintos: precintos.slice(0, MAX_PRECINTOS) };
  });
}

/**
 * Un renglon por producto: si el mismo producto viene en varios contenedores,
 * se suman cantidades y cajas (la recepcion espera el total del embarque) y
 * queda anotado cuanto trae cada contenedor (`reparto`), para que Almacen
 * compare cada uno por su lado. Si algun pedazo no dice de que contenedor
 * es, no hay reparto: no se puede saber.
 */
function juntarRenglones(lista: unknown, contenedores: ContenedorLeido[]) {
  type Junto = {
    codigo: string;
    producto: string;
    cantidad_esperada: number;
    cajas_esperadas: number | null;
    reparto: Map<string, number> | null;
  };
  const conocidos = new Set(contenedores.map((c) => c.numero));
  const porProducto = new Map<string, Junto>();
  for (const r of Array.isArray(lista) ? lista : []) {
    const codigo = texto((r as any)?.codigo, 100);
    const producto = texto((r as any)?.producto, 300);
    const cantidad = Number((r as any)?.cantidad);
    const cajas = Number((r as any)?.cajas) > 0 ? Math.round(Number((r as any).cajas)) : null;
    if (!producto || !Number.isFinite(cantidad) || cantidad < 0) continue;
    const contenedor = texto((r as any)?.contenedor, 50).toUpperCase().replace(/[\s-]+/g, "");
    const llave = (codigo || producto).toUpperCase().replace(/\s+/g, " ");
    let junto = porProducto.get(llave);
    if (!junto) {
      junto = { codigo, producto, cantidad_esperada: 0, cajas_esperadas: null, reparto: new Map() };
      porProducto.set(llave, junto);
    }
    junto.cantidad_esperada += cantidad;
    if (cajas !== null) junto.cajas_esperadas = (junto.cajas_esperadas ?? 0) + cajas;
    if (junto.reparto && conocidos.has(contenedor)) {
      junto.reparto.set(contenedor, (junto.reparto.get(contenedor) ?? 0) + cantidad);
    } else {
      junto.reparto = null;
    }
  }
  return [...porProducto.values()].slice(0, MAX_RENGLONES).map(({ reparto, ...r }) => ({
    ...r,
    // Con un solo contenedor no hace falta: todo es de ese.
    reparto:
      reparto && contenedores.length > 1
        ? [...reparto].map(([contenedor, cantidad]) => ({ contenedor, cantidad }))
        : null,
  }));
}

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
    const contenedores = juntarContenedores(leido.contenedores).slice(0, MAX_CONTENEDORES);
    return NextResponse.json({
      success: true,
      datos: {
        proveedor: texto(leido.proveedor, 200),
        referencia: texto(leido.referencia, 100),
        contenedores,
        renglones: juntarRenglones(leido.renglones, contenedores),
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
