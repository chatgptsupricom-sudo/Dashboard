/**
 * Inyeccion minima para el Plan de Contenido cuando el HTML subido es la SPA
 * de React (Vite). Se activa solo si el documento trae:
 *
 *   <meta name="supricom-plan" content="react-v1">
 *
 * A diferencia de `buildInjection` (runtime de overlay de ~1300 lineas que
 * clona y diffea el DOM), aqui la app ya maneja su propio estado: un objeto
 * plano `{ pieces: { [id]: { checked, moved, colId } } }`. Lo unico que hace
 * falta es pasarle a donde guardarlo y por donde llega el socket.
 *
 * El puente vive dentro del bundle de la app (`src/lib/planSync.ts` +
 * `usePlanState.ts`), que lee `window.__PLAN_CFG__`.
 */

const META_RE = /<meta[^>]*\bname=["']supricom-plan["'][^>]*>/i;
const CONTENT_RE = /\bcontent=["']([^"']+)["']/i;

/** Devuelve la variante declarada ("react-v1"...) o null si no aplica. */
export function detectReactPlan(html: string): string | null {
  if (!html) return null;
  const tag = html.match(META_RE);
  if (!tag) return null;
  const content = tag[0].match(CONTENT_RE);
  const variant = (content?.[1] || "").trim().toLowerCase();
  return variant.startsWith("react") ? variant : null;
}

export function buildReactInjection(opts: {
  api: string;
  socketUrl: string;
  view: string;
  revision: number;
  variant: string;
}): string {
  const cfg = JSON.stringify({
    mode: opts.variant,
    api: opts.api,
    stateUrl: `${opts.api}/plan-state`,
    socketUrl: opts.socketUrl,
    view: opts.view,
    revision: opts.revision,
    canEdit: true,
  }).replace(/</g, "\\u003c");

  // data-plan-ignore: por si el HTML alguna vez pasa por el runtime viejo, que
  // lo trate como nodo de servicio y no como contenido.
  return `<script id="__plan_cfg" data-plan-ignore>window.__PLAN_CFG__=${cfg};</script>`;
}
