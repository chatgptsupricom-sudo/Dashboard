import { query } from "@/lib/db";
import { requireRmaOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
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
  const auth = await requireRmaOSeguridad(request);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

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

  // 404 y no 403: adivinar un id de otra sucursal no debe ni confirmar que
  // existe.
  if (cids !== null && Number(i.cids) !== cids) {
    return new NextResponse("Ingreso no encontrado", { status: 404 });
  }

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

  // Garantía: ya no es un check que Seguridad marca en la planilla (#48). Viene
  // congelada en el ticket de RMA al momento del reporte; el comprobante la
  // reproduce tal cual.
  let garantia: any = null;
  if (i.rma_case_id) {
    try {
      const gres = await query(
        `SELECT garantia_estado, garantia_meses, garantia_vence, garantia_marca
         FROM rma_cases WHERE id = ?`,
        [i.rma_case_id],
      );
      garantia = gres.rows[0] ?? null;
    } catch (e: any) {
      console.warn("rma_cases sin columnas de garantia:", e?.message);
    }
  }
  const GARANTIA_LABEL: Record<string, string> = {
    en_garantia: "En garant&iacute;a",
    vencida: "Vencida",
    vida_util: "Vida &uacute;til",
    indeterminada: "Sin determinar",
  };
  const garantiaTexto = garantia
    ? [
        GARANTIA_LABEL[garantia.garantia_estado] || "Sin determinar",
        garantia.garantia_marca ? esc(garantia.garantia_marca) : "",
        garantia.garantia_vence
          ? `vence ${fechaLarga(garantia.garantia_vence)}`
          : "",
      ]
        .filter(Boolean)
        .join(" &middot; ")
    : "Seg&uacute;n ticket de RMA";

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
  html { background: #f1eefb; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1523;
    max-width: 800px;
    margin: 0 auto;
    padding: 28px 0 48px;
    font-size: 12px;
  }
  .toolbar { text-align: right; margin-bottom: 12px; padding: 0 24px; }
  .toolbar button {
    padding: 8px 16px; font-size: 13px; cursor: pointer;
    border: 1px solid #741DFE; background: #741DFE; color: #fff; border-radius: 6px;
  }
  /* La "hoja" en si: en pantalla se ve como una hoja de papel flotando sobre
     el fondo lila; en impresion pierde el marco/sombra y ocupa toda la
     pagina, que es como se ve un papel real. */
  .paper {
    background: #fff;
    border: 1px solid #e4defa;
    border-radius: 14px;
    box-shadow: 0 8px 28px rgba(76, 20, 176, 0.08);
    padding: 32px 40px 40px;
  }
  .letterhead {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding-bottom: 16px;
    margin-bottom: 20px;
    border-bottom: 2px solid #741DFE;
  }
  .letterhead img { height: 40px; width: auto; }
  h1 {
    font-size: 18px;
    text-align: center;
    margin: 0 0 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1a1523;
  }
  .nd {
    display: block;
    width: fit-content;
    margin: 0 auto 22px;
    padding: 4px 14px;
    border-radius: 999px;
    background: #fdeaea;
    color: #b42318;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  h2 {
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #4c14b0;
    background: #f3ecff;
    border-left: 3px solid #741DFE;
    padding: 6px 10px;
    margin: 22px 0 10px;
    border-radius: 0 6px 6px 0;
  }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e2e8; border-radius: 8px; overflow: hidden; }
  th, td { border: 1px solid #e2e2e8; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #faf9fc; width: 34%; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #55506b; font-weight: 700; }
  .checks td { text-align: center; }
  .checks th { width: auto; text-align: center; }
  .ok { color: #067647; font-weight: 700; }
  .no { color: #b42318; font-weight: 700; }
  .falla { min-height: 60px; }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px 24px;
    margin-top: 14px;
    page-break-inside: avoid;
  }
  .sig { text-align: center; font-size: 11px; }
  /* Alto fijo aunque no haya firma: si el bloque encoge cuando falta una,
     el papel impreso no deja hueco para firmarla a mano. */
  .sig .trazo { height: 64px; display: flex; align-items: flex-end; justify-content: center; }
  .sig .trazo img { max-height: 62px; max-width: 100%; }
  .sig .name { border-top: 1px solid #cfc9e6; padding-top: 6px; font-weight: 700; font-size: 12px; }
  .sig .cargo { color: #555; font-size: 10px; }
  .sig .cuando { color: #888; font-size: 9px; margin-top: 2px; }
  .footer-note {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #e2e2e8;
    text-align: center;
    font-size: 9.5px;
    color: #9993ad;
  }
  @media print {
    html { background: #fff; }
    body { padding: 0; max-width: none; }
    .paper { border: none; border-radius: 0; box-shadow: none; padding: 0 8px; }
    .toolbar, .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Imprimir</button>
  </div>

  <div class="paper">
    <div class="letterhead">
      <img src="/Supricom-logo.png" alt="Supricom">
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
      </tr>
      <tr>
        <td>${check(i.accesorios_integros)}</td>
        <td>${check(i.sin_manipulacion)}</td>
      </tr>
    </table>

    <table style="margin-top:12px">
      <tr><th>Garant&iacute;a (del ticket de RMA)</th><td>${garantiaTexto}</td></tr>
    </table>

    <table style="margin-top:12px">
      <tr>
        <th>Recibi&oacute; por Seguridad</th>
        <td>${esc(i.recibido_seguridad_nombre || i.recibido_por) || "&mdash;"}</td>
      </tr>
      <tr>
        <th>Recibi&oacute; por RMA</th>
        <td>${esc(i.recibido_rma_nombre) || "&mdash;"}</td>
      </tr>
      <tr><th>Fecha de despacho</th><td>${fechaDespacho ? fechaLarga(fechaDespacho) : "&mdash;"}</td></tr>
    </table>

    <h2>Firmas</h2>
    <div class="signatures">
      ${bloquesFirma}
    </div>

    <p class="footer-note">Supricom Venezuela &middot; Documento generado por el sistema &middot; ND ${esc(ndParaImprimir(i.nd_numero)) || String(ingresoId)}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
