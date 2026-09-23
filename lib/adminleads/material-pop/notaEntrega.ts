import type { Solicitud } from "@/lib/adminleads/material-pop/requests";

/**
 * Nota de entrega imprimible de una solicitud de material POP.
 *
 * Es un documento HTML con estilos de impresión, no un PDF: el navegador
 * imprime o guarda como PDF desde el mismo diálogo. El proyecto no tiene
 * ninguna librería para generar PDF y no vale la pena sumar una para una hoja.
 *
 * Sirve de constancia física: qué salió, de dónde, para qué cliente, pedido
 * por qué vendedor y autorizado por quién, con espacio para las firmas de
 * quien entrega y quien recibe.
 */

/**
 * Nombre de cada ubicación en el papel. Son los depósitos reales de Valencia;
 * si cambian las siglas, se cambian acá y en ningún otro lado.
 */
export const NOMBRE_UBICACION: Record<string, string> = {
  warehouse: "Almacén (C7)",
  office: "Oficina (C4)",
};

const escapar = (v: any): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtFecha = (valor: string | null): string => {
  if (!valor) return "—";
  const solo = String(valor).split(/[ T]/)[0];
  const [y, m, d] = solo.split("-");
  return d && m && y ? `${d}-${m}-${y}` : solo;
};

const hoyTexto = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

/** Frase de movimiento según de dónde sale el material. */
function frameMovimiento(origen: string, cliente: string, vendedor: string): string {
  const desde = NOMBRE_UBICACION[origen] || NOMBRE_UBICACION.warehouse;
  const hasta = NOMBRE_UBICACION.office;
  const destino = escapar(cliente || "el cliente");
  const quien = escapar(vendedor || "el vendedor");

  if (origen === "warehouse") {
    return `Se autoriza la salida del material detallado a continuación desde <strong>${desde}</strong>
      y su traslado hasta <strong>${hasta}</strong>, para ser entregado al cliente
      <strong>${destino}</strong>, atendido por el vendedor <strong>${quien}</strong>.`;
  }
  return `Se autoriza la salida del material detallado a continuación desde <strong>${desde}</strong>,
    para ser entregado al cliente <strong>${destino}</strong>, atendido por el vendedor
    <strong>${quien}</strong>.`;
}

export function notaEntregaHtml(solicitud: Solicitud, origen: string): string {
  const entregadas = solicitud.items.filter((it) => (it.approvedQuantity ?? 0) > 0);
  const totalUnidades = entregadas.reduce((s, it) => s + (it.approvedQuantity ?? 0), 0);

  const filas = entregadas
    .map(
      (it) => `
        <tr>
          <td class="mono">${escapar(it.code)}</td>
          <td>${escapar(it.name)}</td>
          <td>${escapar(it.brand || "—")}</td>
          <td class="num">${it.approvedQuantity}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Nota de entrega ${escapar(solicitud.code)}</title>
<style>
  @page { size: letter; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    font-size: 12px;
    line-height: 1.5;
  }
  .hoja { max-width: 190mm; margin: 0 auto; padding: 24px; }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .04em; text-transform: uppercase; }
  .sub { font-size: 11px; color: #475569; margin-top: 2px; }
  .codigo { float: right; text-align: right; font-size: 11px; color: #475569; }
  .codigo strong { display: block; font-size: 15px; color: #0f172a; }
  .datos { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 14px; }
  .dato { font-size: 11px; }
  .dato span { color: #64748b; display: block; text-transform: uppercase; font-size: 9px; letter-spacing: .06em; }
  .cuerpo { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
       color: #64748b; border-bottom: 1px solid #cbd5e1; padding: 6px 4px; }
  td { padding: 7px 4px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 11px; color: #475569; }
  .num { text-align: right; font-weight: 600; white-space: nowrap; }
  tfoot td { border-top: 1px solid #0f172a; border-bottom: none; font-weight: 700; }
  .notas { font-size: 11px; color: #475569; margin-bottom: 26px; }
  .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 34px; }
  .firma { border-top: 1px solid #0f172a; padding-top: 5px; font-size: 10px; color: #475569; }
  .pie { margin-top: 22px; font-size: 9px; color: #94a3b8; text-align: center; }
  @media print { .noimprimir { display: none; } body { font-size: 11px; } }
  .noimprimir { text-align: center; margin: 16px 0; }
  .noimprimir button { font: inherit; padding: 8px 18px; border-radius: 8px;
      border: 1px solid #0f172a; background: #0f172a; color: #fff; cursor: pointer; }
</style>
</head>
<body>
  <div class="hoja">
    <header>
      <div class="codigo">
        <strong>${escapar(solicitud.code)}</strong>
        Emitida el ${hoyTexto()}
      </div>
      <h1>Nota de entrega · Material POP</h1>
      <p class="sub">SUPRICOM · Constancia de salida de material publicitario</p>
    </header>

    <div class="datos">
      <p class="dato"><span>Cliente</span>${escapar(solicitud.clientName || "—")}</p>
      <p class="dato"><span>Vendedor solicitante</span>${escapar(solicitud.sellerName || "—")}</p>
      <p class="dato"><span>Autorizado por</span>${escapar(solicitud.reviewedByName || "—")}</p>
      <p class="dato"><span>Fecha de autorización</span>${fmtFecha(solicitud.reviewedAt)}</p>
      <p class="dato"><span>Orden en Odoo</span>${escapar(solicitud.odooOrderName || "No aplica")}</p>
      <p class="dato"><span>Condición de entrega</span>${
        solicitud.deliveryCondition === "al_comprar"
          ? "Contra la compra del cliente"
          : "Entrega inmediata"
      }</p>
    </div>

    <div class="cuerpo">
      ${frameMovimiento(origen, solicitud.clientName, solicitud.sellerName)}
    </div>

    <table>
      <thead>
        <tr><th>SKU</th><th>Producto</th><th>Marca</th><th class="num">Cantidad</th></tr>
      </thead>
      <tbody>${filas || `<tr><td colspan="4">Sin productos autorizados</td></tr>`}</tbody>
      <tfoot>
        <tr><td colspan="3">Total de unidades</td><td class="num">${totalUnidades}</td></tr>
      </tfoot>
    </table>

    ${
      solicitud.notes || solicitud.reviewNotes
        ? `<p class="notas"><strong>Observaciones:</strong> ${escapar(
            [solicitud.notes, solicitud.reviewNotes].filter(Boolean).join(" · "),
          )}</p>`
        : ""
    }

    <div class="firmas">
      <div class="firma">Entrega (nombre, C.I. y firma)</div>
      <div class="firma">Retira / traslada (nombre, C.I. y firma)</div>
      <div class="firma">Recibe conforme (nombre, C.I. y firma)</div>
    </div>

    <p class="pie">
      Documento generado por el panel SUPRICOM · Solicitud ${escapar(solicitud.code)} ·
      Este comprobante respalda la salida del material detallado.
    </p>

    <div class="noimprimir">
      <button onclick="window.print()">Imprimir o guardar como PDF</button>
    </div>
  </div>
  <script>window.addEventListener("load", () => window.print());</script>
</body>
</html>`;
}
