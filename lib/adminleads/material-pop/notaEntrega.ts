/**
 * Nota de entrega imprimible de material POP.
 *
 * La emiten dos flujos: una solicitud de vendedor aprobada y una salida a
 * cliente cargada directo por el adminLeads. Por eso recibe datos planos y no
 * una solicitud: el documento es el mismo, cambia de dónde salen los datos.
 *
 * Es HTML con estilos de impresión, no un PDF: el navegador imprime o guarda
 * como PDF desde el mismo diálogo. El proyecto no tiene librería para generar
 * PDF y no vale la pena sumar una para una hoja.
 *
 * Sirve de constancia física: qué salió, de dónde, hacia dónde, para qué
 * cliente y autorizado por quién, con las firmas de quien autoriza y de quien
 * recibe en el almacén de destino.
 */

/**
 * Nombre de cada ubicación en el papel. Son los depósitos reales de Valencia:
 * el material vive en C7 y se traslada a C4, desde donde se despacha al
 * cliente. Si cambian las siglas, se cambian acá y en ningún otro lado.
 */
export const NOMBRE_UBICACION: Record<string, string> = {
  warehouse: "Almacén C7",
  office: "Almacén C4",
};

export interface ItemNota {
  code: string;
  name: string;
  brand: string | null;
  quantity: number;
}

export interface DatosNota {
  /** Número que identifica el documento: SOL-0005, o el del movimiento. */
  codigo: string;
  cliente: string;
  /** Vendedor que atiende al cliente. Vacío en una salida cargada a mano. */
  vendedor?: string | null;
  autorizadoPor: string;
  /** Fecha de autorización o de la salida, ya formateada o en ISO. */
  fecha: string | null;
  ordenOdoo?: string | null;
  condicion?: string | null;
  observaciones?: string | null;
  items: ItemNota[];
  /** `warehouse` (C7) u `office` (C4): de dónde sale el material. */
  origen: string;
}

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
  return d && m && y ? `${d}-${m}-${y}` : String(valor);
};

const hoyTexto = (): string => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

/**
 * Frase del movimiento.
 *
 * El caso normal es C7 → C4: el material sale del almacén principal y se
 * traslada al otro, desde donde se despacha al cliente. Si la salida ya es
 * desde C4, no hay traslado que documentar.
 */
function fraseMovimiento(datos: DatosNota): string {
  const cliente = escapar(datos.cliente || "el cliente");
  const vendedor = datos.vendedor ? escapar(datos.vendedor) : "";
  const atendido = vendedor
    ? `, atendido por el vendedor <strong>${vendedor}</strong>`
    : "";

  if (datos.origen === "office") {
    return `Se autoriza la salida del material detallado a continuación desde
      <strong>${NOMBRE_UBICACION.office}</strong>, para su despacho al cliente
      <strong>${cliente}</strong>${atendido}.`;
  }
  return `Se autoriza la salida del material detallado a continuación desde
    <strong>${NOMBRE_UBICACION.warehouse}</strong> y su traslado hasta
    <strong>${NOMBRE_UBICACION.office}</strong>, desde donde se despacha al cliente
    <strong>${cliente}</strong>${atendido}.`;
}

export function notaEntregaHtml(datos: DatosNota): string {
  const items = datos.items.filter((it) => it.quantity > 0);
  const totalUnidades = items.reduce((s, it) => s + it.quantity, 0);

  const filas = items
    .map(
      (it) => `
        <tr>
          <td class="mono">${escapar(it.code)}</td>
          <td>${escapar(it.name)}</td>
          <td>${escapar(it.brand || "—")}</td>
          <td class="num">${it.quantity}</td>
        </tr>`,
    )
    .join("");

  const datosExtra = [
    datos.vendedor
      ? `<p class="dato"><span>Vendedor solicitante</span>${escapar(datos.vendedor)}</p>`
      : "",
    `<p class="dato"><span>Autorizado por</span>${escapar(datos.autorizadoPor || "—")}</p>`,
    `<p class="dato"><span>Fecha de autorización</span>${fmtFecha(datos.fecha)}</p>`,
    `<p class="dato"><span>Orden de venta (Odoo)</span>${escapar(datos.ordenOdoo || "No aplica")}</p>`,
    datos.condicion
      ? `<p class="dato"><span>Condición de entrega</span>${escapar(datos.condicion)}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n      ");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Nota de entrega ${escapar(datos.codigo)}</title>
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
  .dato { font-size: 11px; margin: 0; }
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
  .firmas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 40px; }
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
        <strong>${escapar(datos.codigo)}</strong>
        Emitida el ${hoyTexto()}
      </div>
      <h1>Nota de entrega · Material POP</h1>
      <p class="sub">SUPRICOM · Constancia de salida de material publicitario</p>
    </header>

    <div class="datos">
      <p class="dato"><span>Cliente</span>${escapar(datos.cliente || "—")}</p>
      ${datosExtra}
    </div>

    <div class="cuerpo">
      ${fraseMovimiento(datos)}
    </div>

    <table>
      <thead>
        <tr><th>SKU</th><th>Producto</th><th>Marca</th><th class="num">Cantidad</th></tr>
      </thead>
      <tbody>${filas || `<tr><td colspan="4">Sin productos</td></tr>`}</tbody>
      <tfoot>
        <tr><td colspan="3">Total de unidades</td><td class="num">${totalUnidades}</td></tr>
      </tfoot>
    </table>

    ${
      datos.observaciones
        ? `<p class="notas"><strong>Observaciones:</strong> ${escapar(datos.observaciones)}</p>`
        : ""
    }

    <div class="firmas">
      <div class="firma">Autoriza · ${escapar(datos.autorizadoPor || "")} (firma)</div>
      <div class="firma">Recepción ${escapar(NOMBRE_UBICACION.office)} (nombre, C.I. y firma)</div>
    </div>

    <p class="pie">
      Documento generado por el panel SUPRICOM · ${escapar(datos.codigo)} ·
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
