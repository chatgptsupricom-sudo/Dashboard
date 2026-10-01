import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { cambioImpuestos, cambiosRelevantes } from "@/lib/auditoria-nc/analisis";
import { leerDocumentos, leerHistorial, ncPorFactura, esSedeValida } from "@/lib/auditoria-nc/odoo";

/**
 * Historial completo de un documento para el detalle: estados (quién y
 * cuándo lo publicó, reabrió, anuló), cambios relevantes, impuestos netos,
 * factura de origen y las NC que tiene encima.
 * GET ?id=<account.move id>
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });

  try {
    const [doc] = await leerDocumentos([id]);
    // Solo documentos de cliente de las sedes del panel.
    if (!doc || !esSedeValida(doc.companyId) || !["out_invoice", "out_refund"].includes(doc.tipo)) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }
    const facturaId = doc.tipo === "out_invoice" ? doc.id : doc.origenId;
    const [historial, origen, ncs] = await Promise.all([
      leerHistorial([id]),
      doc.origenId ? leerDocumentos([doc.origenId]).then((x) => x[0] ?? null) : Promise.resolve(null),
      facturaId ? ncPorFactura([facturaId]).then((m) => m.get(facturaId) || []) : Promise.resolve([]),
    ]);
    const cambios = cambiosRelevantes(historial.cambios);
    return NextResponse.json({
      success: true,
      data: {
        documento: doc,
        origen,
        notasCredito: ncs,
        eventos: historial.eventos,
        cambios: cambios.filter((c) => c.campo !== "tax_ids"),
        impuestos: cambioImpuestos(cambios),
        lineasImpuesto: cambios.filter((c) => c.campo === "tax_ids").length,
      },
    });
  } catch (error: any) {
    console.error("Error en auditoria-nc documento:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
