// lib/canales.ts
// Normalizacion del canal de origen de los leads.
//
// La columna `leads.canal_origen` es texto libre y trae variantes que apuntan al
// mismo canal ("Whatsapp" / "Whatsaap") y valores que en realidad son vacios
// (el string literal "null", cadenas en blanco). Sin normalizar, el mismo canal
// aparece dos veces en los filtros y los conteos quedan partidos.
//
// Todo lo que agrupe o filtre por canal deberia pasar por aca, para que el
// panel, el export, la tabla de cierres y el informe mensual cuenten igual.

export const SIN_CANAL = "Sin canal";

/** Valores que significan "sin canal registrado". */
const VACIOS = new Set(["", "null", "undefined", "n/a", "-"]);

/**
 * Variantes conocidas -> nombre canonico. La clave se compara en minusculas y
 * sin espacios. Agregar aca cualquier variante nueva que aparezca en la base.
 */
export const ALIAS_CANAL: Record<string, string> = {
  whatsapp: "Whatsapp",
  whatsaap: "Whatsapp",
  whatsap: "Whatsapp",
  wsp: "Whatsapp",
  wasap: "Whatsapp",
  instagram: "Instagram",
  ig: "Instagram",
  facebook: "Facebook Ads",
  facebookads: "Facebook Ads",
  metaads: "Meta Ads",
  meta: "Meta Ads",
};

/** Normaliza un valor de canal_origen tal como viene de la base. */
export function normalizarCanal(raw: unknown): string {
  const texto = String(raw ?? "").trim();
  const clave = texto.toLowerCase().replace(/\s+/g, "");
  if (VACIOS.has(clave)) return SIN_CANAL;
  return ALIAS_CANAL[clave] ?? texto;
}

/** Escapa una cadena para incrustarla como literal SQL. */
function lit(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

/**
 * Misma normalizacion, pero como expresion SQL, para agrupar y filtrar del lado
 * de la base. `col` debe ser un nombre de columna del propio codigo, nunca
 * entrada del usuario.
 *
 * Se usa REPLACE(LOWER(TRIM(col)), ' ', '') para que coincida con la clave del
 * mapa de alias, que tambien va en minusculas y sin espacios.
 */
export function canalNormalizadoSql(col: string): string {
  const clave = `REPLACE(LOWER(TRIM(${col})), ' ', '')`;
  const vacios = Array.from(VACIOS).map(lit).join(", ");
  const casos = Object.entries(ALIAS_CANAL)
    .map(([variante, canonico]) => `WHEN ${clave} = ${lit(variante)} THEN ${lit(canonico)}`)
    .join("\n        ");

  return `CASE
        WHEN ${col} IS NULL OR ${clave} IN (${vacios}) THEN ${lit(SIN_CANAL)}
        ${casos}
        ELSE TRIM(${col})
      END`;
}

/** Canales que el informe mensual considera parte de Meta, ya normalizados. */
export const CANALES_META = ["Facebook Ads", "Instagram", "Meta Ads"];
