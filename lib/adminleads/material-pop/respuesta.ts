/**
 * Lee el JSON de una respuesta de las APIs de Material POP.
 *
 * Las rutas siempre responden JSON, pero lo que llega al navegador no siempre
 * sale de ellas: el proxy responde una página HTML cuando el servidor se está
 * reiniciando (502/503) o tarda demasiado (504), Next da su 404 en HTML, y un
 * error que escapa de la ruta sale como la página de error. Con `res.json()`
 * todo eso se veía como "Unexpected token '<', "<!DOCTYPE"... is not valid
 * JSON"; aquí se cambia por un mensaje que dice qué pasó.
 */
export async function leerJson(res: Response): Promise<any> {
  const raw = await res.text();
  if (!raw.trim()) {
    if (res.ok) return {};
    throw new Error(mensajeSinJson(res.status));
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(mensajeSinJson(res.status));
  }
}

const REVISAR = "Si estabas guardando algo, revisa el Historial antes de repetirlo: pudo haberse registrado.";

export function mensajeSinJson(status: number): string {
  if (status === 401 || status === 403) {
    return `Tu sesión venció o no tienes permiso (${status}). Vuelve a iniciar sesión e inténtalo de nuevo.`;
  }
  if (status === 404) {
    return "El servidor no encontró esta función (404). Puede que se esté actualizando: recarga la página en un minuto.";
  }
  if (status === 413) {
    return "Lo que se envió es demasiado grande (413). Prueba con menos productos o un archivo más liviano.";
  }
  if (status === 502 || status === 503) {
    return `El servidor no está disponible (${status}): se está reiniciando o actualizando. Espera un minuto y vuelve a intentar. ${REVISAR}`;
  }
  if (status === 504) {
    return `El servidor tardó demasiado en responder (504). ${REVISAR}`;
  }
  if (status >= 500) {
    return `Error interno del servidor (${status}). Avisa a sistemas con la hora del error. ${REVISAR}`;
  }
  return `El servidor respondió algo inesperado (${status}). Recarga la página e inténtalo de nuevo.`;
}
