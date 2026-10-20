// Carta de autorización de envío de mercancía por transportista (Políticas y
// Acuerdos › formatos). Sin MySQL ni Odoo: la usan la pantalla (vista previa,
// imprimir/PDF y Word) y scripts/check-politicas.cjs. Todo en primera persona
// de quien firma por el cliente. Un campo vacío sale como línea para llenar a mano.
// El formato copia la carta de Word que se usaba (Times, título subrayado,
// sangría, logo arriba y marca de agua).

export type EmpresaCarta = {
  sede: number;
  nombre: string;
  rif: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  email: string;
  web: string;
  logo: string;
};

export type DatosCarta = {
  fecha: string; // YYYY-MM-DD
  lugar: string;
  cliente: string;
  rifCliente: string;
  direccionCliente: string;
  representante: string;
  cedula: string;
  cargo: string;
  facturas: string;
  destino: string;
  transportista: string;
  rifTransportista: string;
  flete: "cliente" | "otro";
  fleteOtro: string;
  asegurado: boolean;
  aseguradora: string;
  poliza: string;
  montoAsegurado: string;
};

export const CARTA_VACIA: DatosCarta = {
  fecha: "",
  lugar: "",
  cliente: "",
  rifCliente: "",
  direccionCliente: "",
  representante: "",
  cedula: "",
  cargo: "",
  facturas: "",
  destino: "",
  transportista: "",
  rifTransportista: "",
  flete: "cliente",
  fleteOtro: "",
  asegurado: false,
  aseguradora: "",
  poliza: "",
  montoAsegurado: "",
};

/**
 * Membrete propio de cada sede (archivos en public/politicas). Valencia usa
 * el logo y la marca de agua de la carta de Word de OSC; una sede sin membrete
 * usa el logo de su compañía en Odoo y va sin marca de agua.
 */
const MEMBRETES: Record<number, { logo: string; marca: string; web: string }> = {
  9: { logo: "/politicas/osc-logo.jpg", marca: "/politicas/osc-marca-agua.jpg", web: "www.osc2004.com" },
};

export const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** El valor escapado, o una línea para llenar a mano. */
const v = (s: string, ancho = 160) =>
  s.trim()
    ? `<b>${escaparHtml(s.trim())}</b>`
    : `<span style="display:inline-block;width:${ancho}px;border-bottom:1px solid #000">&nbsp;</span>`;

const fechaLarga = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
};

/** Como en la carta de Word: una línea donde se marca la X. */
const marca = (si: boolean) =>
  `<span style="display:inline-block;width:34px;border-bottom:1px solid #000;text-align:center;font-weight:bold">${si ? "X" : "&nbsp;"}</span>`;

type Opciones = {
  /** Origen (https://…) para las imágenes del membrete: hace falta en Word, que no resuelve rutas relativas. */
  origen?: string;
  /** Word no muestra el logo en base64 de Odoo ni la marca de agua posicionada. */
  word?: boolean;
};

/** Cuerpo de la carta en HTML con estilos en línea (sirve para la pantalla, la impresión y Word). */
export function htmlCarta(d: DatosCarta, e: EmpresaCarta | null, o: Opciones = {}): string {
  const osc = e?.nombre ? escaparHtml(e.nombre) : "la empresa";
  const fiscal = e?.sede === 7 ? "RUC" : "RIF";
  const membrete = e ? MEMBRETES[e.sede] : undefined;
  const origen = o.origen ?? "";
  const logo = membrete ? origen + membrete.logo : o.word ? "" : e?.logo || "";
  const web = e?.web || membrete?.web || "";
  const fecha = fechaLarga(d.fecha);
  const parrafo = "text-align:justify;text-indent:48px;line-height:1.8;margin:0 0 10px";
  const titulo = "font-weight:bold;margin:12px 0 2px;text-decoration:underline";
  const pie = [e?.direccion, e?.telefono && `Tel.: ${e.telefono}`, e?.email].filter(Boolean).map((x) => escaparHtml(String(x)));

  return `
<div style="position:relative;font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.5;color:#000">
  ${
    membrete && !o.word
      ? `<img src="${origen + membrete.marca}" alt="" style="position:absolute;left:50%;top:230px;width:72%;transform:translateX(-50%);opacity:.32;z-index:0;pointer-events:none">`
      : ""
  }
  <div style="position:relative;z-index:1">
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="vertical-align:top">${logo ? `<img src="${logo}" alt="${osc}" style="height:72px;max-width:300px">` : `<b style="font-size:16pt">${osc}</b>`}</td>
      <td style="vertical-align:bottom;text-align:right;font-family:Calibri,Arial,sans-serif">
        ${web ? `<div style="color:#777;font-size:12pt">Visite: <b style="color:#6b6fc4">${escaparHtml(web)}</b></div>` : ""}
        ${e?.rif ? `<div style="color:#777;font-size:9pt;font-weight:bold">${fiscal === "RIF" ? "Rif" : "RUC"}: ${escaparHtml(e.rif)}</div>` : ""}
      </td>
    </tr></table>

    <h1 style="text-align:center;font-size:12pt;font-weight:bold;text-decoration:underline;margin:26px 0 20px">CARTA DE AUTORIZACIÓN DE ENVÍO DE MERCANCÍA POR TRANSPORTISTA</h1>

    <p style="text-align:right;margin:0 0 12px">${v(d.lugar, 120)}, ${fecha ? `<b>${fecha}</b>` : v("", 140)}</p>

    <p style="margin:0 0 12px">Señores<br><b>${osc}</b>${e?.rif ? `<br>${fiscal}: ${escaparHtml(e.rif)}` : ""}<br>Presente.</p>

    <p style="${parrafo}">Yo, ${v(d.representante, 220)}, titular de la cédula de identidad N.° ${v(d.cedula, 110)},
    en mi carácter de ${v(d.cargo, 140)} de la empresa ${v(d.cliente, 240)}, ${fiscal} ${v(d.rifCliente, 110)},
    con domicilio fiscal en ${v(d.direccionCliente, 300)}, autorizo a <b>${osc}</b> a entregar a la empresa de transporte
    que indico abajo la mercancía correspondiente al siguiente envío:</p>

    <div style="${titulo}">Datos del envío</div>
    <p style="margin:0 0 0 48px">Factura(s) / Pedido(s) N.°: ${v(d.facturas, 260)}<br>Destino: ${v(d.destino, 380)}</p>

    <div style="${titulo}">Datos del transportista</div>
    <p style="margin:0 0 0 48px">Empresa: ${v(d.transportista, 260)} &nbsp; ${fiscal}: ${v(d.rifTransportista, 120)}<br>
    Flete a cargo de: ${d.flete === "cliente" ? "<b>la empresa que represento</b>" : v(d.fleteOtro, 200)}</p>

    <p style="text-indent:48px;margin:14px 0 4px">Favor indicar con una equis (X) la condición del envío:</p>
    <ul style="margin:0 0 10px;padding-left:72px">
      <li style="text-align:justify;margin-bottom:6px">${marca(!d.asegurado)} Envío no asegurado. Asumo, en nombre de la empresa que represento,
      todos los riesgos (robos, deterioros, pérdidas) involucrados en el transporte.</li>
      <li style="text-align:justify">${marca(d.asegurado)} Envío asegurado. Compañía aseguradora: ${d.asegurado ? v(d.aseguradora, 170) : v("", 170)}
      &nbsp; Póliza N.°: ${d.asegurado ? v(d.poliza, 110) : v("", 110)} &nbsp; Monto asegurado: ${d.asegurado ? v(d.montoAsegurado, 100) : v("", 100)}</li>
    </ul>

    <p style="${parrafo}">Declaro que elegí al transportista por cuenta de la empresa que represento. Desde el momento en que
    <b>${osc}</b> entregue la mercancía al transportista, en sus instalaciones o en el almacén que indiqué, la mercancía viaja
    por cuenta y riesgo de la empresa que represento. Por lo tanto, libero a <b>${osc}</b> de toda responsabilidad por la
    recolección, el almacenaje, la manipulación, el transporte y la entrega que haga el transportista.</p>

    <p style="${parrafo}">Esta autorización vale <b>solo para el envío descrito arriba</b>.</p>

    <div style="margin:48px auto 0;width:300px;border-top:1px solid #000;padding-top:4px;text-align:center">
      Firma y sello de la empresa<br>
      Nombre: ${v(d.representante, 200)}<br>C.I.: ${v(d.cedula, 120)} &nbsp; Cargo: ${v(d.cargo, 120)}
    </div>

    <div style="margin-top:24px;border:1px solid #000;padding:8px 10px;font-size:10.5pt;background:#fff">
      <div style="font-weight:bold;margin-bottom:2px">CONSTANCIA DE ENTREGA AL TRANSPORTISTA <span style="font-weight:normal">(la llena el almacén al despachar)</span></div>
      Estado de la mercancía: ${marca(false)} En buen estado &nbsp; ${marca(false)} Con observaciones: ${v("", 200)}<br>
      Fecha y hora: ${v("", 160)}<br>
      Entrega por ${osc}: ${v("", 160)} (firma) &nbsp; Recibe por el transportista: ${v("", 160)} (nombre, C.I. y firma)
    </div>

    ${pie.length ? `<div style="margin-top:20px;border-top:1px solid #999;padding-top:6px;font-family:Calibri,Arial,sans-serif;font-size:8.5pt;text-align:center;color:#444">${pie.join(" | ")}</div>` : ""}
  </div>
</div>`;
}

/** Documento completo, para imprimir (PDF) desde un iframe o abrir en Word. */
export function documentoCarta(d: DatosCarta, e: EmpresaCarta | null, o: Opciones = {}): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carta de autorización de envío</title>
<style>@page{size:letter;margin:16mm 20mm}body{margin:0}</style></head><body>${htmlCarta(d, e, o)}</body></html>`;
}
