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
  representante: string; // quien firma (el "Yo" de la carta)
  representanteLegal: string; // de la empresa cliente; puede ser otra persona
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
  representanteLegal: "",
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
const MEMBRETES: Record<number, { logo: string; marca: string }> = {
  9: { logo: "/politicas/osc-logo.jpg", marca: "/politicas/osc-marca-agua.jpg" },
};

export const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const fechaLarga = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
};

type Opciones = {
  /** Origen (https://…) para las imágenes del membrete: hace falta en Word, que no resuelve rutas relativas. */
  origen?: string;
  /**
   * Para Word: no dibuja bordes de elementos en línea ni respeta tamaños por CSS, así que
   * las líneas para llenar son guiones bajos, el logo lleva width/height y no hay marca de agua.
   */
  word?: boolean;
};

/** Cuerpo de la carta en HTML con estilos en línea (sirve para la pantalla, la impresión y Word). */
export function htmlCarta(d: DatosCarta, e: EmpresaCarta | null, o: Opciones = {}): string {
  const word = Boolean(o.word);
  /** El valor escapado, o una línea para llenar a mano. */
  const v = (s: string, ancho = 160) =>
    s.trim()
      ? `<b>${escaparHtml(s.trim())}</b>`
      : word
        ? "_".repeat(Math.max(6, Math.round(ancho / 7)))
        : `<span style="display:inline-block;width:${ancho}px;border-bottom:1px solid #000">&nbsp;</span>`;
  /** Como en la carta de Word original: una línea donde se marca la X. */
  const marca = (si: boolean) =>
    word
      ? si
        ? "<b><u>&nbsp;&nbsp;X&nbsp;&nbsp;</u></b>"
        : "_____"
      : `<span style="display:inline-block;width:34px;border-bottom:1px solid #000;text-align:center;font-weight:bold">${si ? "X" : "&nbsp;"}</span>`;

  const osc = e?.nombre ? escaparHtml(e.nombre) : "la empresa";
  const fiscal = e?.sede === 7 ? "RUC" : "RIF";
  const membrete = e ? MEMBRETES[e.sede] : undefined;
  const origen = o.origen ?? "";
  const logo = membrete ? origen + membrete.logo : word ? "" : e?.logo || "";
  // El logo de OSC mide 2500×650: a 60 px de alto son 231 de ancho (Word necesita los dos).
  const imgLogo = membrete
    ? `<img src="${logo}" alt="${osc}" width="231" height="60" style="width:231px;height:60px">`
    : `<img src="${logo}" alt="${osc}" height="60" style="height:60px;max-width:280px">`;
  const fecha = fechaLarga(d.fecha);
  const parrafo = "text-align:justify;text-indent:48px;line-height:1.4;margin:0 0 5px";
  const titulo = "font-weight:bold;margin:8px 0 1px;text-decoration:underline";
  const pie = [e?.direccion, e?.telefono && `Tel.: ${e.telefono}`, e?.email].filter(Boolean).map((x) => escaparHtml(String(x)));

  return `
<div style="position:relative;font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.3;color:#000">
  ${
    membrete && !word
      ? `<img src="${origen + membrete.marca}" alt="" style="position:absolute;left:50%;top:200px;width:70%;transform:translateX(-50%);opacity:.32;z-index:0;pointer-events:none">`
      : ""
  }
  <div style="position:relative;z-index:1">
    <table width="100%" style="width:100%;border-collapse:collapse"><tr>
      <td width="60%" style="vertical-align:top">${logo ? imgLogo : `<b style="font-size:16pt">${osc}</b>`}</td>
      <td width="40%" style="vertical-align:bottom;text-align:right;font-family:Calibri,Arial,sans-serif">
        ${e?.rif ? `<span style="color:#777;font-size:9pt;font-weight:bold">${fiscal === "RIF" ? "Rif" : "RUC"}: ${escaparHtml(e.rif)}</span>` : ""}
      </td>
    </tr></table>

    <p style="text-align:center;font-size:12pt;font-weight:bold;text-decoration:underline;margin:12px 0 10px">CARTA DE AUTORIZACIÓN DE ENVÍO DE MERCANCÍA POR TRANSPORTISTA</p>

    <p style="text-align:right;margin:0 0 8px">${v(d.lugar, 120)}, ${fecha ? `<b>${fecha}</b>` : v("", 140)}</p>

    <p style="margin:0 0 8px">Señores<br><b>${osc}</b>${e?.rif ? `<br>${fiscal}: ${escaparHtml(e.rif)}` : ""}<br>Presente.</p>

    <p style="${parrafo}">Yo, ${v(d.representante, 190)}, titular de la cédula de identidad N.° ${v(d.cedula, 100)},
    en mi carácter de ${v(d.cargo, 120)} de la empresa ${v(d.cliente, 200)}, ${fiscal} ${v(d.rifCliente, 100)},
    representada legalmente por ${v(d.representanteLegal, 190)},
    con domicilio fiscal en ${v(d.direccionCliente, 240)}, autorizo a <b>${osc}</b> a entregar a la empresa de transporte
    que indico abajo la mercancía correspondiente al siguiente envío:</p>

    <p style="${titulo}">Datos del envío</p>
    <p style="margin:0 0 0 48px">Factura(s) / Pedido(s) N.°: ${v(d.facturas, 260)}<br>Destino: ${v(d.destino, 380)}</p>

    <p style="${titulo}">Datos del transportista</p>
    <p style="margin:0 0 0 48px">Empresa: ${v(d.transportista, 260)} &nbsp; ${fiscal}: ${v(d.rifTransportista, 120)}<br>
    Flete a cargo de: ${d.flete === "cliente" ? "<b>la empresa que represento</b>" : v(d.fleteOtro, 200)}</p>

    <p style="text-indent:48px;margin:8px 0 2px">Favor indicar con una equis (X) la condición del envío:</p>
    <ul style="margin:0 0 6px;padding-left:72px">
      <li style="text-align:justify;margin-bottom:3px">${marca(!d.asegurado)} Envío no asegurado. Asumo, en nombre de la empresa que represento,
      todos los riesgos (robos, deterioros, pérdidas) involucrados en el transporte.</li>
      <li>${marca(d.asegurado)} Envío asegurado. Compañía aseguradora: ${d.asegurado ? v(d.aseguradora, 150) : v("", 150)}<br>
      Póliza N.°: ${d.asegurado ? v(d.poliza, 110) : v("", 110)} &nbsp; Monto asegurado: ${d.asegurado ? v(d.montoAsegurado, 100) : v("", 100)}</li>
    </ul>

    <p style="${parrafo}">Declaro que elegí al transportista por cuenta de la empresa que represento. Desde el momento en que
    <b>${osc}</b> entregue la mercancía al transportista, en sus instalaciones o en el almacén que indiqué, la mercancía viaja
    por cuenta y riesgo de la empresa que represento. Por lo tanto, libero a <b>${osc}</b> de toda responsabilidad por la
    recolección, el almacenaje, la manipulación, el transporte y la entrega que haga el transportista.</p>

    <p style="${parrafo}">Esta autorización vale <b>solo para el envío descrito arriba</b>.</p>

    ${word ? "<p>&nbsp;</p>" : ""}
    <table align="center" style="margin:22px auto 0;border-collapse:collapse"><tr>
      <td width="360" style="width:360px;border-top:1px solid #000;padding-top:4px;text-align:center;font-family:'Times New Roman',Times,serif;font-size:11pt">
        Firma y sello de la empresa<br>
        Nombre: ${v(d.representante, 220)}<br>C.I.: ${v(d.cedula, 100)} &nbsp; Cargo: ${v(d.cargo, 110)}
      </td>
    </tr></table>

    <div style="margin-top:12px;border:1px solid #000;padding:5px 10px;font-size:9.5pt;background:#fff">
      <b>CONSTANCIA DE ENTREGA AL TRANSPORTISTA</b> (la llena el almacén al despachar)<br>
      Estado de la mercancía: ${marca(false)} En buen estado &nbsp; ${marca(false)} Con observaciones: ${v("", 200)}<br>
      Fecha y hora: ${v("", 160)}<br>
      Entrega por ${osc}: ${v("", 160)} (firma) &nbsp; Recibe por el transportista: ${v("", 160)} (nombre, C.I. y firma)
    </div>

    ${pie.length ? `<p style="margin:10px 0 0;border-top:1px solid #999;padding-top:4px;font-family:Calibri,Arial,sans-serif;font-size:8pt;line-height:1.2;text-align:center;color:#444">${pie.join(" | ")}</p>` : ""}
  </div>
</div>`;
}

/** Hoja carta a 96 ppp y los márgenes de la carta impresa (12 mm × 18 mm), en px. */
export const HOJA_CARTA = { ancho: 816, alto: 1056, margenV: 45, margenH: 68 };

/**
 * Documento completo, para imprimir (PDF) desde un iframe o abrir en Word.
 * Al imprimir, @page sin margen deja a Chrome sin lugar para la fecha, el
 * título y la URL; el margen va como relleno del body.
 */
export function documentoCarta(d: DatosCarta, e: EmpresaCarta | null, o: Opciones = {}): string {
  const { margenV, margenH } = HOJA_CARTA;
  if (o.word)
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Carta de autorización de envío</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>@page WordSection1{size:8.5in 11in;margin:0.5in 0.7in 0.5in 0.7in}div.WordSection1{page:WordSection1}</style></head>
<body><div class="WordSection1">${htmlCarta(d, e, o)}</div></body></html>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carta de autorización de envío</title>
<style>@page{size:letter;margin:0}html,body{margin:0}body{padding:${margenV}px ${margenH}px;box-sizing:border-box}</style></head><body>${htmlCarta(d, e, o)}</body></html>`;
}
