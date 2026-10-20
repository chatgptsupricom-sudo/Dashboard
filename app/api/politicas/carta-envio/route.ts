import { limitarSedesPorRol, respuestaSedeNoPermitida, SEDES_VALIDAS, sedeDelToken } from "@/lib/auth/sedeRol";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { requireLectorPoliticas } from "@/lib/politicas/acceso";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Datos de Odoo para la carta de autorización de envío (Políticas y Acuerdos).
//   GET ?sede=9          -> { empresa }   la sede que emite la carta (res.company, con logo).
//   GET ?sede=9&q=texto  -> { clientes }  clientes por nombre o RIF (res.partner).
//   GET ?sede=9&partner=123 -> { direcciones }  direcciones de entrega de ese cliente.
// Administración queda en la sede de su cids.

const direccion = (p: any) =>
  [p.street, p.street2, p.city, p.state_id?.[1], p.country_id?.[1]].filter(Boolean).join(", ");

export async function GET(request: NextRequest) {
  const auth = await requireLectorPoliticas(request);
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const pedida = Number(params.get("sede")) || sedeDelToken(auth.payload) || 9;
  const [sede] = limitarSedesPorRol(auth.payload, SEDES_VALIDAS.includes(pedida) ? [pedida] : []);
  if (!sede) return respuestaSedeNoPermitida();
  const q = String(params.get("q") ?? "").trim().slice(0, 80);
  const contexto = { context: { allowed_company_ids: [sede] } };

  try {
    if (!q && !params.has("partner")) {
      const [c] =
        (await callOdooRPCEstricto<any[]>(
          "res.company",
          "read",
          [[sede], ["name", "vat", "rif", "street", "street2", "city", "state_id", "country_id", "phone", "email", "website", "logo"]],
          contexto,
        )) ?? [];
      if (!c) return NextResponse.json({ error: "No se encontró la sede en Odoo." }, { status: 404 });
      return NextResponse.json({
        empresa: {
          sede,
          // En Odoo las sedes de Venezuela se llaman "<razón social> - B"; la carta lleva la razón social.
          nombre: String(c.name || "").replace(/\s+-\s+B$/, ""),
          // Valencia no tiene `vat`: su RIF está en `rif` (l10n_ve). En Panamá `rif` es el RUC completo con DV.
          rif: c.rif || c.vat || "",
          direccion: direccion(c),
          ciudad: c.city || "",
          telefono: c.phone || "",
          email: c.email || "",
          web: c.website || "",
          logo: c.logo ? `data:image/png;base64,${c.logo}` : "",
        },
      });
    }
    const partner = Number(params.get("partner"));
    if (params.has("partner")) {
      // Direcciones de entrega del cliente: sus contactos hijos tipo "delivery".
      if (!Number.isInteger(partner) || partner <= 0) return NextResponse.json({ direcciones: [] });
      const hijos =
        (await callOdooRPCEstricto<any[]>(
          "res.partner",
          "search_read",
          [[["parent_id", "=", partner], ["type", "=", "delivery"]]],
          { fields: ["name", "street", "street2", "city", "state_id", "country_id"], limit: 30, order: "name", ...contexto },
        )) ?? [];
      return NextResponse.json({
        direcciones: hijos.map((h) => ({ id: h.id, nombre: h.name || "", direccion: direccion(h) })).filter((h) => h.direccion),
      });
    }
    if (q.length < 2) return NextResponse.json({ clientes: [] });
    const filas =
      (await callOdooRPCEstricto<any[]>(
        "res.partner",
        "search_read",
        [[["parent_id", "=", false], ["company_id", "in", [sede, false]], "|", ["name", "ilike", q], ["vat", "ilike", q]]],
        { fields: ["name", "vat", "street", "street2", "city", "state_id", "country_id", "phone", "email"], limit: 15, order: "name", ...contexto },
      )) ?? [];
    return NextResponse.json({
      clientes: filas.map((p) => ({
        id: p.id,
        nombre: p.name || "",
        rif: p.vat || "",
        direccion: direccion(p),
        telefono: p.phone || "",
        email: p.email || "",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error consultando Odoo" }, { status: 502 });
  }
}
