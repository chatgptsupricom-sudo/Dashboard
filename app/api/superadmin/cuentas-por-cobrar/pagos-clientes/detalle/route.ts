import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Detalle de un pago de cliente para el modal de Pago de Clientes, con sus
// adjuntos (el capture del comprobante que se sube en Odoo).
//   GET ?id=<payment>              -> campos del pago + lista de adjuntos
//   GET ?id=<payment>&adjunto=<id> -> el archivo, para <img>/<iframe>
//
// El adjunto se sirve solo si pertenece a ESE pago (o a su asiento) y el pago
// es de una sede del alcance del token: sin ese chequeo cualquier id de
// ir.attachment de Odoo quedaría descargable.

const CAMPOS = [
  "id", "name", "state", "payment_type", "partner_id", "amount", "currency_id",
  "custom_rate", "date", "payment_registration_date", "tax_today",
  "amount_company_currency_signed", "ref", "journal_id", "payment_method_line_id",
  "partner_bank_id", "payment_description", "mount_igtf", "amount_total_pagar",
  "salesperson_id", "company_id", "move_id", "partner_type",
];

const INLINE = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];

async function leerPago(request: NextRequest, id: number) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return { error: auth.error };

  const pagos = await callOdooRPC<any[]>("account.payment", "read", [[id]], { fields: CAMPOS });
  const p = pagos?.[0];
  const alcance = companyIdsEnAlcance(auth.payload, "todas");
  if (!p || p.partner_type !== "customer" || !alcance.includes(p.company_id?.[0])) {
    return { error: NextResponse.json({ error: "Pago no encontrado" }, { status: 404 }) };
  }

  // Los adjuntos pueden estar en el pago o en su asiento contable, según
  // desde dónde se subieron en Odoo.
  const dominio: any[] = ["|",
    "&", ["res_model", "=", "account.payment"], ["res_id", "=", p.id],
    "&", ["res_model", "=", "account.move"], ["res_id", "=", p.move_id?.[0] || 0],
  ];
  const adjuntos = (await callOdooRPC<any[]>("ir.attachment", "search_read", [dominio], {
    fields: ["id", "name", "mimetype"], order: "id desc",
  })) || [];
  return { pago: p, adjuntos };
}

const limpiarHtml = (v: any) =>
  v ? String(v).replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() : "";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get("id") || "", 10);
  if (!id) return NextResponse.json({ error: "id es requerido" }, { status: 400 });

  try {
    const r = await leerPago(request, id);
    if (r.error) return r.error;
    const { pago: p, adjuntos } = r;

    const adjuntoId = parseInt(searchParams.get("adjunto") || "", 10);
    if (adjuntoId) {
      if (!adjuntos.some((a) => a.id === adjuntoId)) {
        return NextResponse.json({ error: "Adjunto no encontrado" }, { status: 404 });
      }
      const [a] = (await callOdooRPC<any[]>("ir.attachment", "read", [[adjuntoId]], {
        fields: ["name", "mimetype", "datas"],
      })) || [];
      if (!a?.datas) return NextResponse.json({ error: "Adjunto vacío" }, { status: 404 });
      // Inline solo imágenes y PDF. Un HTML/SVG servido inline desde nuestro
      // dominio ejecutaría scripts con la sesión del usuario: esos se descargan.
      const inline = INLINE.includes(a.mimetype);
      return new NextResponse(Buffer.from(a.datas, "base64"), {
        headers: {
          "Content-Type": inline ? a.mimetype : "application/octet-stream",
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name || "adjunto")}`,
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const esUsd = p.currency_id?.[0] === 1;
    return NextResponse.json({
      success: true,
      data: {
        id: p.id,
        numeroPago: p.name || "",
        estado: p.state || "",
        tipoPago: p.payment_type === "inbound" ? "Recibir" : "Enviar",
        cliente: p.partner_id?.[1] || "",
        importe: Number(p.amount) || 0,
        moneda: esUsd ? "USD" : "Bs",
        monedaOdoo: p.currency_id?.[1] || "",
        tasaCustom: !!p.custom_rate,
        fechaPago: p.date || null,
        fechaConfirmacion: p.payment_registration_date || null,
        tasa: Number(p.tax_today) || null,
        importeLocal: Number(p.amount_company_currency_signed) || 0,
        memo: p.ref || "",
        diario: p.journal_id?.[1] || "",
        metodoPago: p.payment_method_line_id?.[1] || "",
        cuentaBancaria: p.partner_bank_id?.[1] || "",
        descripcion: limpiarHtml(p.payment_description),
        igtf: Number(p.mount_igtf) || 0,
        montoTotal: Number(p.amount_total_pagar) || 0,
        vendedor: p.salesperson_id?.[1] || "",
        adjuntos: adjuntos.map((a) => ({ id: a.id, nombre: a.name || "", mimetype: a.mimetype || "" })),
      },
    });
  } catch (error: any) {
    console.error("Error pagos-clientes/detalle:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
