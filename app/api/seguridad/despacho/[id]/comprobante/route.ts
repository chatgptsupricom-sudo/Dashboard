import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { fechaLarga } from "@/lib/fecha";
import { firmasConImagen, tecnicoDeOsc } from "@/lib/seguridad/firmas";
import { NextRequest, NextResponse } from "next/server";


/**
 * Fecha y hora de la firma, en horario de Venezuela.
 *
 * Se fija la zona a proposito: el comprobante lo genera el servidor y lo lee
 * alguien en el mostrador, asi que la hora tiene que ser la del mostrador y
 * no la del servidor, esté donde esté desplegado.
 */
function fmtFechaHora(value: any): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("es-VE", {
    timeZone: "America/Caracas",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Numero ND para imprimir bajo el titulo.
 *
 * La plantilla ya pone el rotulo "ND -", asi que se le quita al valor el
 * prefijo si lo trae: en el almacen unos escriben "9045" y otros "ND-9045",
 * y sin esto el papel sale con "ND - ND-9045".
 */
function ndParaImprimir(valor: any): string {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  return s.replace(/^ND\s*[-–:]?\s*/i, "").trim() || s;
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

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

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

  // 404 y no 403: adivinar un id de otra sucursal no debe ni confirmar que
  // existe.
  if (cids !== null && Number((d as any).cids) !== cids) {
    return new NextResponse("Despacho no encontrado", { status: 404 });
  }

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
        `SELECT cliente_nombre, hardware, serial, fecha_entrega, nd_numero
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

  // Numero ND del encabezado de la planilla.
  //
  // Si el despacho no lo trae, se hereda del ingreso: en el papel, recepcion y
  // despacho son UNA hoja con un solo ND, asi que las dos actas del sistema
  // tienen que llevar el mismo numero. Sin esto, el papel de salida no se
  // puede cruzar con el de entrada en la carpeta del almacen.
  const ndNumero = d.nd_numero || ingreso?.nd_numero || "";

  // Las 4 firmas de la planilla: tecnico, almacen, seguridad y quien retira.
  // Antes salia solo la del cliente, asi que el papel impreso no probaba que
  // el almacen y Seguridad hubieran dado conformidad.
  const [firmas, tecnico] = await Promise.all([
    firmasConImagen("despacho", despachoId),
    tecnicoDeOsc(),
  ]);
  const firmaDe = (rol: string) => firmas.find((f) => f.rol === rol);

  const bloquesFirma = [
    { rol: "tecnico", titulo: tecnico.nombre, cargo: tecnico.cargo },
    { rol: "almacen", titulo: "Almacén", cargo: d.almacenista_nombre },
    { rol: "seguridad", titulo: "Seguridad de OSC", cargo: "" },
    { rol: "cliente", titulo: "Recibe", cargo: d.cliente_retira || "" },
  ]
    .map(({ rol, titulo, cargo }) => {
      const f = firmaDe(rol);
      // Cuando no hay firma se deja el hueco igual: el comprobante se imprime
      // y ahi se firma a mano, que es como funcionaba la planilla.
      return `
    <div class="sig">
      <div class="trazo">${
        f ? `<img src="${f.data_url}" alt="Firma de ${esc(f.firmante_nombre)}">` : ""
      }</div>
      <div class="name">${esc(titulo)}</div>
      ${cargo ? `<div class="cargo">${esc(cargo)}</div>` : ""}
      ${f ? `<div class="cuando">${esc(f.firmante_nombre)} · ${fmtFechaHora(f.created_at)}</div>` : ""}
    </div>`;
    })
    .join("");

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
  /* Mismo tratamiento que en el acta de recepcion: el ND es lo que permite
     cruzar los dos papeles en la carpeta, asi que se lee de un vistazo. */
  .nd {
    text-align: center;
    font-size: 13px;
    color: #b00;
    font-weight: 700;
    margin-bottom: 4px;
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
    grid-template-columns: 1fr 1fr;
    gap: 28px 24px;
    margin-top: 40px;
    page-break-inside: avoid;
  }
  /* Alto fijo aunque no haya firma: si el bloque encoge cuando falta una,
     el papel impreso no deja hueco para firmarla a mano. */
  .sig .trazo {
    height: 64px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sig .trazo img { max-height: 62px; max-width: 100%; }
  .sig .cargo { color: #555; font-size: 10px; }
  .sig .cuando { color: #888; font-size: 9px; margin-top: 2px; }
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
  <div class="nd">ND - ${esc(ndParaImprimir(ndNumero)) || "&nbsp;"}</div>
  <div class="sub">Despacho #${esc(d.id)} &middot; Generado ${esc(new Date().toLocaleString("es-VE"))}</div>

  <div class="grid">
    <div class="field">
      <span class="label">Fecha de despacho</span>
      <span class="value">${fechaLarga(d.fecha_despacho)}</span>
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
      <span class="value">${fechaLarga(ingreso.fecha_entrega)}</span>
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

  <div class="signatures">
    ${bloquesFirma}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
