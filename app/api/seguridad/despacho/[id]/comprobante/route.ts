import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

async function requireSeguridad(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  let payload: any;
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload;
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const userRole = ((payload.role as string) || "").toLowerCase().trim();
  if (userRole !== "seguridad" && userRole !== "superadmin") {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return { payload };
}

function esc(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const despachoId = parseInt(id, 10);
  if (isNaN(despachoId)) {
    return new NextResponse("ID invalido", { status: 400 });
  }

  const despachoResult = await query(
    "SELECT * FROM seguridad_despachos WHERE id = ?",
    [despachoId],
  );
  if (despachoResult.rows.length === 0) {
    return new NextResponse("Despacho no encontrado", { status: 404 });
  }
  const d = despachoResult.rows[0];

  let facturas: string[] = [];
  if (d.facturas_json) {
    try {
      const parsed = JSON.parse(d.facturas_json);
      if (Array.isArray(parsed)) facturas = parsed.map((f) => String(f));
    } catch {
      facturas = [];
    }
  }

  let ingreso: any = null;
  if (d.ingreso_id) {
    try {
      const r = await query(
        `SELECT cliente_nombre, hardware, serial, fecha_entrega
         FROM seguridad_ingresos WHERE id = ?`,
        [d.ingreso_id],
      );
      if (r.rows.length > 0) ingreso = r.rows[0];
    } catch {}
  }

  let rma: any = null;
  if (d.rma_case_id) {
    try {
      const r = await query(
        `SELECT case_number, status, invoice_number FROM rma_cases WHERE id = ?`,
        [d.rma_case_id],
      );
      if (r.rows.length > 0) rma = r.rows[0];
    } catch {}
  }

  const accesoriosOk = d.accesorios_integros === 1 || d.accesorios_integros === true;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante de Despacho #${esc(d.id)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 24px;
    font-size: 13px;
  }
  .toolbar {
    text-align: right;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px dashed #ccc;
  }
  .toolbar button {
    background: #111;
    color: #fff;
    border: none;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px;
  }
  .toolbar button:hover { background: #333; }
  h1 {
    margin: 0 0 4px;
    font-size: 20px;
    text-align: center;
  }
  .sub {
    text-align: center;
    color: #555;
    margin-bottom: 24px;
    font-size: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 24px;
    margin-bottom: 24px;
  }
  .field { padding: 8px 0; border-bottom: 1px solid #eee; }
  .label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .value { font-size: 14px; font-weight: 600; }
  .full { grid-column: 1 / -1; }
  .section {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 2px solid #111;
  }
  .section h2 {
    margin: 0 0 12px;
    font-size: 14px;
    text-transform: uppercase;
  }
  ul.facturas {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  ul.facturas li {
    padding: 6px 10px;
    background: #f5f5f5;
    margin-bottom: 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 13px;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    background: #d4edda;
    color: #155724;
  }
  .badge.no {
    background: #f8d7da;
    color: #721c24;
  }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    margin-top: 48px;
    page-break-inside: avoid;
  }
  .sig {
    text-align: center;
    padding-top: 8px;
    border-top: 1px solid #111;
    font-size: 11px;
  }
  .sig .name { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
  .firma-img {
    max-width: 100%;
    max-height: 80px;
    display: block;
    margin: 0 auto 4px;
  }
  @media print {
    body { padding: 0; }
    .toolbar, .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
  </div>

  <h1>Comprobante de Despacho</h1>
  <div class="sub">Despacho #${esc(d.id)} &middot; Generado ${esc(new Date().toLocaleString("es-VE"))}</div>

  <div class="grid">
    <div class="field">
      <span class="label">Fecha de despacho</span>
      <span class="value">${esc(d.fecha_despacho)}</span>
    </div>
    <div class="field">
      <span class="label">Almacenista</span>
      <span class="value">${esc(d.almacenista_nombre)}</span>
    </div>
    <div class="field">
      <span class="label">Cliente que retira</span>
      <span class="value">${esc(d.cliente_retira) || "&mdash;"}</span>
    </div>
    <div class="field">
      <span class="label">Accesorios &iacute;ntegros</span>
      <span class="value">
        <span class="badge ${accesoriosOk ? "" : "no"}">
          ${accesoriosOk ? "SI" : "NO"}
        </span>
      </span>
    </div>
    ${ingreso ? `
    <div class="field">
      <span class="label">Cliente (ingreso original)</span>
      <span class="value">${esc(ingreso.cliente_nombre)}</span>
    </div>
    <div class="field">
      <span class="label">Hardware / Serial</span>
      <span class="value">${esc(ingreso.hardware)} ${ingreso.serial ? `/ ${esc(ingreso.serial)}` : ""}</span>
    </div>
    <div class="field">
      <span class="label">Fecha de ingreso</span>
      <span class="value">${esc(ingreso.fecha_entrega)}</span>
    </div>
    <div class="field">
      <span class="label">Ingreso #</span>
      <span class="value">${esc(d.ingreso_id)}</span>
    </div>
    ` : ""}
    ${rma ? `
    <div class="field">
      <span class="label">Ticket RMA</span>
      <span class="value">${esc(rma.case_number)}</span>
    </div>
    <div class="field">
      <span class="label">Estado RMA / Factura</span>
      <span class="value">${esc(rma.status)} ${rma.invoice_number ? `/ ${esc(rma.invoice_number)}` : ""}</span>
    </div>
    ` : ""}
  </div>

  ${facturas.length > 0 ? `
  <div class="section">
    <h2>Facturas incluidas (${facturas.length})</h2>
    <ul class="facturas">
      ${facturas.map((f) => `<li>${esc(f)}</li>`).join("")}
    </ul>
  </div>
  ` : ""}

  ${d.observaciones ? `
  <div class="section">
    <h2>Observaciones</h2>
    <div>${esc(d.observaciones)}</div>
  </div>
  ` : ""}

  ${d.firma_url ? `
  <div class="section">
    <h2>Firma del cliente</h2>
    <img class="firma-img" src="${esc(d.firma_url)}" alt="Firma del cliente">
  </div>
  ` : ""}

  <div class="signatures">
    <div class="sig">
      <div class="name">Recibe (Cliente)</div>
      <div>${esc(d.cliente_retira) || ""}</div>
    </div>
    <div class="sig">
      <div class="name">Entrega (Almac&eacute;n)</div>
      <div>${esc(d.almacenista_nombre)}</div>
    </div>
    <div class="sig">
      <div class="name">Seguridad OSC</div>
      <div>&nbsp;</div>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
