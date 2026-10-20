import { limitarSedesPorRol, respuestaSedeNoPermitida, SEDES_VALIDAS, sedeDelToken } from "@/lib/auth/sedeRol";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { requireLectorPoliticas } from "@/lib/politicas/acceso";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Datos de Odoo para la carta de autorización de envío (Políticas y Acuerdos).
//   GET ?sede=9          -> { empresa }   la sede que emite la carta (res.company, con logo).
//   GET ?sede=9&q=texto  -> { clientes }  clientes por nombre o RIF (res.partner).
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
    if (!q) {
      const [c] =
        (await callOdooRPCEstricto<any[]>(
          "res.company",
          "read",
          [[sede], ["name", "vat", "street", "street2", "city", "state_id", "country_id", "phone", "email", "website", "logo"]],
          contexto,
        )) ?? [];
      if (!c) return NextResponse.json({ error: "No se encontró la sede en Odoo." }, { status: 404 });
      return NextResponse.json({
        empresa: {
          sede,
          nombre: c.name || "",
          rif: c.vat || "",
          direccion: direccion(c),
          ciudad: c.city || "",
          telefono: c.phone || "",
          email: c.email || "",
          web: c.website || "",
          logo: c.logo ? `data:image/png;base64,${c.logo}` : "",
        },
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
