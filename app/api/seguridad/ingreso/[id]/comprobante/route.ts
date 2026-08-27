import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { fechaLarga } from "@/lib/fecha";
import { firmasConImagen, tecnicoDeOsc } from "@/lib/seguridad/firmas";
import { NextRequest, NextResponse } from "next/server";

/**
 * Comprobante imprimible del acta de RECEPCION.
 *
 * El despacho ya tenia el suyo; el ingreso no, asi que el cliente dejaba su
 * equipo y se iba sin nada en la mano. Es la mitad del papel que mas falta
 * hace: la que dice en que estado lo entrego.
 *
 * Reproduce la planilla "RECEPCION Y DESPACHO DE RMA": los datos del equipo,
 * los 4 checks de estado y los 4 firmantes.
 */

// El formateo vive en lib/fecha.ts porque mysql2 devuelve las columnas DATE
// como objetos Date, y cortarles los 10 primeros caracteres da "Wed Aug 19"
// en vez de la fecha. Ademas evita `new Date`, que con una fecha de
// calendario corre el dia segun la zona horaria de quien mire.
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

function check(v: any): string {
  const si = v === 1 || v === true;
  return si
    ? '<span class="ok">S&iacute;</span>'
    : '<span class="no">No</span>';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const ingresoId = parseInt(id, 10);
  if (isNaN(ingresoId)) {
    return new NextResponse("ID invalido", { status: 400 });
  }

  const res = await query("SELECT * FROM seguridad_ingresos WHERE id = ?", [
    ingresoId,
  ]);
  if (res.rows.length === 0) {
    return new NextResponse("Ingreso no encontrado", { status: 404 });
  }
  const i = res.rows[0] as any;

  // Fecha de despacho: la planilla es UNA hoja con las dos fechas. Si el
  // equipo ya salio, el comprobante lo dice.
  let fechaDespacho: string | null = null;
  try {
    const dres = await query(
      "SELECT fecha_despacho FROM seguridad_despachos WHERE ingreso_id = ? ORDER BY id DESC LIMIT 1",
      [ingresoId],
    );
    fechaDespacho = dres.rows[0]?.fecha_despacho ?? null;
  } catch {
    fechaDespacho = null;
  }

  const [firmas, tecnico] = await Promise.all([
    firmasConImagen("ingreso", ingresoId),
    tecnicoDeOsc(),
  ]);
  const firmaDe = (rol: string) => firmas.find((f) => f.rol === rol);

  const bloquesFirma = [
    { rol: "tecnico", titulo: tecnico.nombre, cargo: tecnico.cargo },
    { rol: "almacen", titulo: "Almacén", cargo: i.recibido_por },
    { rol: "seguridad", titulo: "Seguridad de OSC", cargo: "" },
    { rol: "cliente", titulo: "Entrega", cargo: i.cliente_nombre },
  ]
    .map(({ rol, titulo, cargo }) => {
      const f = firmaDe(rol);
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
<meta charset="utf-8">
<title>Recepci&oacute;n de RMA N.&ordm; ${ingresoId}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    max-width: 760px;
    margin: 0 auto;
    padding: 24px;
    font-size: 12px;
  }
  .toolbar { text-align: right; margin-bottom: 12px; }
  .toolbar button {
    padding: 8px 16px; font-size: 13px; cursor: pointer;
    border: 1px solid #741DFE; background: #741DFE; color: #fff; border-radius: 6px;
  }
  h1 { font-size: 17px; text-align: center; margin: 0 0 4px; text-transform: uppercase; }
  .nd { text-align: center; font-size: 12px; color: #b00; font-weight: 700; margin-bottom: 16px; }
  h2 { font-size: 12px; text-transform: uppercase; background: #d9d9d9; padding: 4px 8px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #d9d9d9; width: 34%; font-size: 11px; text-transform: uppercase; }
  .checks td { text-align: center; }
  .checks th { width: auto; text-align: center; }
  .ok { color: #067647; font-weight: 700; }
  .no { color: #b42318; font-weight: 700; }
  .falla { min-height: 60px; }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px 24px;
    margin-top: 40px;
    page-break-inside: avoid;
  }
  .sig { text-align: center; font-size: 11px; }
  /* Alto fijo aunque no haya firma: si el bloque encoge cuando falta una,
     el papel impreso no deja hueco para firmarla a mano. */
  .sig .trazo { height: 64px; display: flex; align-items: flex-end; justify-content: center; }
  .sig .trazo img { max-height: 62px; max-width: 100%; }
  .sig .name { border-top: 1px solid #111; padding-top: 6px; font-weight: 700; font-size: 12px; }
  .sig .cargo { color: #555; font-size: 10px; }
  .sig .cuando { color: #888; font-size: 9px; margin-top: 2px; }
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

  <h1>Recepci&oacute;n y Despacho de RMA</h1>
  <div class="nd">ND - ${esc(ndParaImprimir(i.nd_numero)) || "&nbsp;"}</div>

  <table>
    <tr><th>Fecha de entrega (almac&eacute;n)</th><td>${fechaLarga(i.fecha_entrega)}</td></tr>
    <tr><th>N.&ordm; factura de venta</th><td>${esc(i.factura_numero) || "&mdash;"}</td></tr>
    <tr><th>Cliente</th><td>${esc(i.cliente_nombre)}</td></tr>
    <tr><th>Hardware</th><td>${esc(i.hardware) || "&mdash;"}</td></tr>
    <tr><th>N&uacute;mero de serie o c&oacute;digo</th><td>${esc(i.serial) || "&mdash;"}</td></tr>
  </table>

  <h2>Descripci&oacute;n de la falla</h2>
  <table><tr><td class="falla">${esc(i.descripcion_falla) || "&mdash;"}</td></tr></table>

  <h2>Verificaci&oacute;n de estado</h2>
  <table class="checks">
    <tr>
      <th>Accesorios &iacute;ntegros</th>
      <th>Sin manipulaci&oacute;n</th>
      <th>Dentro de la fecha</th>
      <th>Falla cubierta por garant&iacute;a</th>
    </tr>
    <tr>
      <td>${check(i.accesorios_integros)}</td>
      <td>${check(i.sin_manipulacion)}</td>
      <td>${check(i.dentro_de_fecha)}</td>
      <td>${check(i.falla_cubierta_garantia)}</td>
    </tr>
  </table>

  <table style="margin-top:12px">
    <tr><th>Fecha de despacho</th><td>${fechaDespacho ? fechaLarga(fechaDespacho) : "&mdash;"}</td></tr>
  </table>

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
