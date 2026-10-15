import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { productosParaFrecuencia, sedeDeUsuario } from "@/lib/customView/inventarioOdoo";

/**
 * Frecuencia CPM de otras marcas (Asta, Bluetti…). Su HTML no usa la ruta de
 * Supricom (plan por año+mes): llama a `/api/plan-contenido/frecuencia-<marca>`
 * con su propio contrato:
 *   POST          { inicio, fin, plan }  → guarda el plan (uno por marca, el último)
 *   GET           → { plan, inicio, fin, updatedBy, updatedAt }
 *   GET /catalogo → { products: [{ sku, name, stock, price, … }], companyId }
 *                   todo el portafolio de la marca en Odoo (spiff_brand_id), con stock 0 incluido
 * El HTML guarda en localStorage; para que todo el equipo vea el mismo plan,
 * el panel le siembra el último guardado al servirlo (custom-view, `semillaFrecuencia`).
 */
const ROLES = ["adminleads", "diseñador"];
const MAX_BYTES = 5 * 1024 * 1024;

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await query(`
    CREATE TABLE IF NOT EXISTS plan_frecuencia_marca (
      marca VARCHAR(20) NOT NULL PRIMARY KEY,
      inicio VARCHAR(20) NULL,
      fin VARCHAR(20) NULL,
      plan_json LONGTEXT NOT NULL,
      updated_by VARCHAR(120) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

export async function leerPlanMarca(marca: string): Promise<{ plan: any; inicio: string | null; fin: string | null; updatedBy: string | null; updatedAt: string | null } | null> {
  await ensureTabla();
  const r = await query(`SELECT plan_json, inicio, fin, updated_by, updated_at FROM plan_frecuencia_marca WHERE marca = ?`, [marca]);
  const row = r.rows?.[0];
  if (!row) return null;
  return { plan: JSON.parse(row.plan_json), inicio: row.inicio, fin: row.fin, updatedBy: row.updated_by, updatedAt: row.updated_at };
}

/** Rutas `frecuencia-<marca>`; `nombreOdoo` = cómo se llama la marca en spiff_brand_id. */
export function rutasFrecuenciaMarca(marca: string, nombreOdoo: string) {
  async function GET(request: NextRequest) {
    const auth = await requireRoles(request, ROLES);
    if (auth.error) return auth.error;
    try {
      return NextResponse.json((await leerPlanMarca(marca)) ?? { plan: null });
    } catch (error: any) {
      console.error(`frecuencia-${marca} GET error:`, error?.message);
      return NextResponse.json({ error: "No se pudo leer el plan" }, { status: 500 });
    }
  }

  async function POST(request: NextRequest) {
    const auth = await requireRoles(request, ROLES);
    if (auth.error) return auth.error;
    try {
      const texto = await request.text();
      if (texto.length > MAX_BYTES) return NextResponse.json({ success: false, error: "Plan demasiado grande" }, { status: 413 });
      const body = JSON.parse(texto);
      if (!body?.plan || typeof body.plan !== "object" || Array.isArray(body.plan))
        return NextResponse.json({ success: false, error: "Plan invalido" }, { status: 400 });
      const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 20) : null);
      await ensureTabla();
      await query(
        `INSERT INTO plan_frecuencia_marca (marca, inicio, fin, plan_json, updated_by) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE inicio = VALUES(inicio), fin = VALUES(fin), plan_json = VALUES(plan_json), updated_by = VALUES(updated_by)`,
        [marca, fecha(body.inicio), fecha(body.fin), JSON.stringify(body.plan), String(auth.payload?.email || auth.payload?.role || "")],
      );
      return NextResponse.json({ success: true });
    } catch (error: any) {
      console.error(`frecuencia-${marca} POST error:`, error?.message);
      return NextResponse.json({ success: false, error: "No se pudo guardar el plan" }, { status: 500 });
    }
  }

  async function catalogo(request: NextRequest) {
    const auth = await requireRoles(request, ROLES);
    if (auth.error) return auth.error;
    const companyId = sedeDeUsuario(auth.payload?.cids);
    // Todo el portafolio, también lo agotado: el HTML actualiza el stock de cada SKU que recibe.
    const products = await productosParaFrecuencia([["spiff_brand_id.name", "ilike", nombreOdoo]], companyId, {
      soloConStock: false,
      limite: 3000,
    });
    if (!products) return NextResponse.json({ error: "No se pudo conectar con Odoo" }, { status: 502 });
    return NextResponse.json({ products: products.filter((p) => p.sku), companyId });
  }

  return { GET, POST, catalogo };
}

/**
 * Script para el <head> del HTML de una marca: si el plan guardado en el panel
 * es más nuevo que el del navegador, lo pone en el localStorage de la app
 * (clave `var STORE_KEY = '…'` del HTML). Sin esa clave en el HTML, nada.
 */
export async function semillaFrecuencia(marca: string, html: string): Promise<string> {
  const clave = /var\s+STORE_KEY\s*=\s*['"]([^'"]+)['"]/.exec(html)?.[1];
  if (!clave) return "";
  const guardado = await leerPlanMarca(marca).catch(() => null);
  if (!guardado?.plan) return "";
  const datos = JSON.stringify({ k: clave, p: guardado.plan }).replace(/</g, "\\u003c");
  return `<script>(function(){try{var d=${datos};var l=JSON.parse(localStorage.getItem(d.k)||"null");if(!l||!l.savedAt||(d.p.savedAt&&d.p.savedAt>l.savedAt))localStorage.setItem(d.k,JSON.stringify(d.p))}catch(e){}})();</script>`;
}
