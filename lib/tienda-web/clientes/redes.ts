/**
 * Ayudas para que el cliente llene sus redes sin escribir de más («Mi cuenta» › Perfil):
 * - `instagramDe`: su cuenta de Instagram (nombre, foto, seguidores, web) por `business_discovery`, desde la cuenta
 *   de Supricom Venezuela (META_ACCESS_TOKEN). La foto va como data URL para que la pantalla la use de logo.
 * - `redesDeSuWeb`: las redes enlazadas en su página web (`redesEnHtml`). Se baja la página desde el servidor con
 *   cuidado: solo http/https a los puertos de siempre, el nombre tiene que apuntar a una IP pública (nada de la red
 *   interna), hasta 3 redirecciones revisadas una a una, 6 s y 1,5 MB. Al cliente solo le vuelven los enlaces
 *   a redes sociales que encontró, nunca la página.
 */
import { lookup } from "dns/promises";
import net from "net";
import { getIgAccounts, fichaInstagram } from "@/lib/instagram";
import { filterByCids, getAdAccounts } from "@/lib/meta";
import { enlaceRed, redesEnHtml, type RedSocial } from "./tipos";

let cuentaIg: Promise<string | null> | null = null;
function cuentaIgPropia(): Promise<string | null> {
  cuentaIg ??= getIgAccounts(filterByCids(getAdAccounts(), 9))
    .then((c) => (c.find((x) => x.pais === "Venezuela") ?? c[0])?.ig_user_id ?? null)
    .catch(() => { cuentaIg = null; return null; });
  return cuentaIg;
}

const cacheIg = new Map<string, { hasta: number; valor: ResultadoInstagram }>();
export type ResultadoInstagram =
  | { ok: true; usuario: string; nombre: string; seguidores: number; foto: string | null; web: string; enlace: string }
  | { ok: false; motivo: string };

/** Hosts de donde Instagram sirve las fotos de perfil. Solo de ahí se baja la foto (no es una URL del cliente). */
const HOST_FOTO = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;

async function fotoComoDataUrl(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !HOST_FOTO.test(u.hostname)) return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(6000), redirect: "error" });
    const tipo = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!r.ok || !/^image\/(jpeg|png|webp)$/.test(tipo)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) return null;
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function instagramDe(entrada: string): Promise<ResultadoInstagram> {
  const enlace = enlaceRed("instagram", entrada);
  if (!enlace) return { ok: false, motivo: "Escribe tu usuario de Instagram (@tuempresa) o el enlace de tu perfil" };
  const usuario = (new URL(enlace).pathname.split("/").filter(Boolean)[0] || "").replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(usuario)) return { ok: false, motivo: "Ese no parece un usuario de Instagram" };
  const clave = usuario.toLowerCase();
  const guardado = cacheIg.get(clave);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor;
  const ig = await cuentaIgPropia();
  if (!ig) return { ok: false, motivo: "Ahora no podemos consultar Instagram. Igual puedes guardar tu usuario." };
  const { ficha, motivo } = await fichaInstagram(ig, usuario);
  const valor: ResultadoInstagram = ficha
    ? { ok: true, usuario: ficha.usuario, nombre: ficha.nombre, seguidores: ficha.seguidores, web: ficha.web, enlace: `https://instagram.com/${ficha.usuario}`, foto: ficha.foto ? await fotoComoDataUrl(ficha.foto) : null }
    : {
      ok: false,
      motivo: /does not exist|cannot be found|Invalid user id|\(#110\)|\(#100\)/i.test(motivo)
        ? "No encontramos esa cuenta, o es una cuenta personal: solo podemos mostrar cuentas de empresa o creador. Igual puedes guardar tu usuario."
        : "Ahora no podemos consultar Instagram. Igual puedes guardar tu usuario.",
    };
  cacheIg.set(clave, { hasta: Date.now() + 10 * 60 * 1000, valor });
  if (cacheIg.size > 500) cacheIg.delete(cacheIg.keys().next().value!);
  return valor;
}

/* ------------------------------------------------------------------ Redes desde su página web */
function ipPublica(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (v === 6) {
    const t = ip.toLowerCase();
    if (t === "::" || t === "::1") return false;
    if (t.startsWith("fc") || t.startsWith("fd") || t.startsWith("fe8") || t.startsWith("fe9") || t.startsWith("fea") || t.startsWith("feb") || t.startsWith("ff")) return false;
    const mapeada = t.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return ipPublica(mapeada[1]);
    return true;
  }
  return false;
}

async function urlSegura(u: URL): Promise<boolean> {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return false; // por nombre, no por IP
  if (!/\.[a-z]{2,}$/i.test(host) || /(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) return false;
  try {
    const ips = await lookup(host, { all: true });
    return ips.length > 0 && ips.every((x) => ipPublica(x.address));
  } catch {
    return false;
  }
}

async function leerPagina(url: string): Promise<string | null> {
  let actual: URL;
  try { actual = new URL(url); } catch { return null; }
  for (let salto = 0; salto <= 3; salto++) {
    if (!(await urlSegura(actual))) return null;
    const r = await fetch(actual, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SupricomTienda/1.0)", Accept: "text/html,application/xhtml+xml" },
    });
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get("location");
      if (!destino) return null;
      try { actual = new URL(destino, actual); } catch { return null; }
      continue;
    }
    if (!r.ok || !/text\/html|application\/xhtml/i.test(r.headers.get("content-type") || "") || !r.body) return null;
    const lector = r.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    while (total < 1_500_000) {
      const { done, value } = await lector.read();
      if (done || !value) break;
      partes.push(value);
      total += value.length;
    }
    lector.cancel().catch(() => {});
    return Buffer.concat(partes).toString("utf8");
  }
  return null;
}

export async function redesDeSuWeb(entrada: string): Promise<{ ok: true; web: string; redes: Partial<Record<RedSocial, string>> } | { ok: false; motivo: string }> {
  const web = enlaceRed("web", entrada);
  if (!web) return { ok: false, motivo: "Revisa la dirección de tu página web" };
  const html = await leerPagina(web).catch(() => null);
  if (html === null) return { ok: false, motivo: "No pudimos abrir tu página. Puedes escribir tus redes a mano." };
  const redes = redesEnHtml(html);
  delete redes.web;
  return { ok: true, web, redes };
}
