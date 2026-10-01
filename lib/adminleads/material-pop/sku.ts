import { query } from "@/lib/db";

/**
 * Genera una abreviación a partir de un nombre.
 *
 * Reglas:
 * - Toma las primeras letras de cada palabra.
 * - Ignora artículos y preposiciones comunes.
 * - Máximo 6 caracteres.
 * - Solo letras y números, en mayúsculas.
 *
 * Ejemplos:
 *   "Agendas" => "AGND"
 *   "Banner Publicitario" => "BNPB"
 *   "Roll Up 2m" => "RLUP2M"
 *   "Display de Mostrador" => "DSPLMS"
 */
export function generateAbbreviation(name: string): string {
  const ignored = new Set([
    "de", "del", "la", "las", "el", "los", "en", "con", "por", "para",
    "un", "una", "unos", "unas", "y", "o", "a", "al",
  ]);

  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar tildes
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);

  let abbreviation = "";
  for (const word of words) {
    if (ignored.has(word.toLowerCase())) continue;
    abbreviation += word[0].toUpperCase();
    if (abbreviation.length >= 6) break;
  }

  // Si quedó muy corto, completar con las siguientes letras de la primera palabra
  if (abbreviation.length < 3 && words.length > 0) {
    const firstWord = words[0].toUpperCase();
    abbreviation = firstWord.slice(0, 6);
  }

  return abbreviation.slice(0, 6);
}

/**
 * Genera un SKU único con prefijo POP-.
 * Si ya existe, agrega un número incremental.
 *
 * `conn` es la conexión de una transacción en curso, si la hay. Sin ella la
 * búsqueda sale por otra conexión del pool, que no ve los productos insertados
 * por esa transacción todavía sin commit: al importar varias filas cuyo nombre
 * da la misma abreviación, todas recibirían el mismo SKU y chocarían contra
 * uk_code_cids.
 */
export async function generateSku(
  name: string,
  cids: number,
  requestedAbbreviation?: string,
  conn?: any,
): Promise<string> {
  const requested = requestedAbbreviation
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const base = requested || generateAbbreviation(name);
  let sku = `POP-${base}`;

  const exists = async (code: string): Promise<boolean> => {
    const sql = "SELECT id FROM pop_products WHERE code = ? AND cids = ? LIMIT 1";
    if (conn) {
      const res = await conn.execute(sql, [code, cids]);
      return res[0].length > 0;
    }
    const res = await query(sql, [code, cids]);
    return res.rows.length > 0;
  };

  if (!(await exists(sku))) return sku;

  let counter = 2;
  while (await exists(`${sku}${counter}`)) {
    counter++;
  }
  return `${sku}${counter}`;
}
