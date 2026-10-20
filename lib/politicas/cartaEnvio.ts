// Carta de autorización de envío de mercancía por transportista (Políticas y
// Acuerdos › formatos). Sin MySQL ni Odoo: la usan la pantalla (vista previa,
// imprimir/PDF y Word) y scripts/check-politicas.cjs. Todo en primera persona
// de quien firma por el cliente. Un campo vacío sale como línea para llenar a mano.

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

const casilla = (marcada: boolean) => (marcada ? "&#9746;" : "&#9744;");

/** Cuerpo de la carta en HTML con estilos en línea (sirve para la pantalla, la impresión y Word). */
export function htmlCarta(d: DatosCarta, e: EmpresaCarta | null, conLogo = true): string {
  const osc = e?.nombre ? escaparHtml(e.nombre) : "la empresa";
  const fiscal = e?.sede === 7 ? "RUC" : "RIF";
  const titulo = "font-weight:bold;margin:14px 0 4px;font-size:12px;text-transform:uppercase";
  const pie = [e?.direccion, e?.telefono && `Tel.: ${e.telefono}`, e?.email, e?.web].filter(Boolean).map((x) => escaparHtml(String(x)));
  const fecha = fechaLarga(d.fecha);

  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12.5px;line-height:1.5;color:#000">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:8px">
    ${conLogo && e?.logo ? `<img src="${e.logo}" alt="" style="max-height:56px;max-width:200px">` : `<b>${osc}</b>`}
    ${e?.rif ? `<span>${fiscal}: ${escaparHtml(e.rif)}</span>` : ""}
  </div>

  <h1 style="text-align:center;font-size:15px;margin:18px 0">CARTA DE AUTORIZACIÓN DE ENVÍO DE MERCANCÍA POR TRANSPORTISTA</h1>

  <p style="text-align:right">${v(d.lugar, 120)}, ${fecha ? `<b>${fecha}</b>` : v("", 140)}</p>

  <p>Señores<br><b>${osc}</b>${e?.rif ? `<br>${fiscal}: ${escaparHtml(e.rif)}` : ""}<br>Presente.</p>

  <p style="text-align:justify">Yo, ${v(d.representante, 220)}, titular de la cédula de identidad N.° ${v(d.cedula, 110)},
  en mi carácter de ${v(d.cargo, 140)} de la empresa ${v(d.cliente, 240)}, ${fiscal} ${v(d.rifCliente, 110)},
  con domicilio fiscal en ${v(d.direccionCliente, 300)}, autorizo a ${osc} a entregar a la empresa de transporte
  que indico abajo la mercancía correspondiente al siguiente envío:</p>

  <div style="${titulo}">Datos del envío</div>
  <p style="margin:0">Factura(s) / Pedido(s) N.°: ${v(d.facturas, 260)}<br>Destino: ${v(d.destino, 380)}</p>

  <div style="${titulo}">Datos del transportista</div>
  <p style="margin:0">Empresa: ${v(d.transportista, 260)} &nbsp; ${fiscal}: ${v(d.rifTransportista, 120)}<br>
  Flete a cargo de: ${d.flete === "cliente" ? "<b>la empresa que represento</b>" : v(d.fleteOtro, 200)}</p>

  <div style="${titulo}">Condición del envío</div>
  <p style="margin:0">${casilla(!d.asegurado)} <b>Envío no asegurado.</b> Asumo, en nombre de la empresa que represento,
  todos los riesgos del transporte: robo, pérdida, deterioro o daño de la mercancía.</p>
  <p style="margin:4px 0 0">${casilla(d.asegurado)} <b>Envío asegurado.</b>
  Aseguradora: ${d.asegurado ? v(d.aseguradora, 160) : v("", 160)} &nbsp; Póliza N.°: ${d.asegurado ? v(d.poliza, 110) : v("", 110)}
  &nbsp; Monto asegurado: ${d.asegurado ? v(d.montoAsegurado, 100) : v("", 100)}</p>

  <p style="text-align:justify;margin-top:14px">Declaro que elegí al transportista por cuenta de la empresa que represento.
  Desde el momento en que ${osc} entregue la mercancía al transportista, en sus instalaciones o en el almacén que indiqué,
  la mercancía viaja por cuenta y riesgo de la empresa que represento. Por lo tanto, libero a ${osc} de toda
  responsabilidad por la recolección, el almacenaje, la manipulación, el transporte y la entrega que haga el transportista.</p>

  <p>Esta autorización vale <b>solo para el envío descrito arriba</b>.</p>

  <div style="margin-top:46px;width:300px;border-top:1px solid #000;padding-top:4px">
    Firma y sello de la empresa<br>
    Nombre: ${v(d.representante, 200)}<br>C.I.: ${v(d.cedula, 120)} &nbsp; Cargo: ${v(d.cargo, 120)}
  </div>

  <div style="margin-top:26px;border:1px solid #000;padding:8px 10px">
    <div style="${titulo};margin-top:0">Constancia de entrega al transportista <span style="font-weight:normal;text-transform:none">(la llena el almacén al despachar)</span></div>
    Estado de la mercancía: &#9744; En buen estado &nbsp; &#9744; Con observaciones: ${v("", 220)}<br>
    Fecha y hora: ${v("", 160)}<br>
    Entrega por ${osc}: ${v("", 170)} (firma) &nbsp; Recibe por el transportista: ${v("", 170)} (nombre, C.I. y firma)
  </div>

  ${pie.length ? `<div style="margin-top:22px;border-top:1px solid #999;padding-top:6px;font-size:10px;text-align:center;color:#444">${pie.join(" · ")}</div>` : ""}
</div>`;
}

/** Documento completo, para imprimir (PDF) desde un iframe o abrir en Word. */
export function documentoCarta(d: DatosCarta, e: EmpresaCarta | null, conLogo = true): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Carta de autorización de envío</title>
<style>@page{size:letter;margin:18mm}body{margin:0}</style></head><body>${htmlCarta(d, e, conLogo)}</body></html>`;
}
