import {
  DIAS,
  SEDES_RUTAGRAMA,
  VEHICULOS,
  fechaLarga,
  rutaVuelta,
  seccionTraslado,
  tramosVuelta,
  type Fila,
  type Punto,
  type Rutagrama,
  type SeccionTraslado,
} from "@/lib/rutagrama/tipos";

/**
 * La planilla de papel del rutagrama, armada con lo que llenó el trabajador:
 * las mismas secciones y casillas, y los croquis dibujados a partir de la ruta
 * que trazó en el mapa (SVG, sin depender de que carguen los mosaicos del
 * mapa al imprimir). Se imprime desde un iframe; las huellas se estampan en
 * el papel.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const marca = (si: boolean) => `<span class="casilla">${si ? "X" : ""}</span>`;

function filaSiNo(etiqueta: string, f: Fila) {
  return `<tr><th>${etiqueta}</th><td class="sn">SI ${marca(f.si)}</td><td class="sn">NO ${marca(!f.si)}</td>
    <th class="dh">Desde-Hasta</th><td class="txt">${esc(f.texto)}</td></tr>`;
}

function seccion(numero: number, titulo: string, s: SeccionTraslado, referencias: string, tiempo: number | null) {
  const v = s.vehiculo;
  const tipos = (Object.keys(VEHICULOS) as (keyof typeof VEHICULOS)[])
    .map((k) => `${VEHICULOS[k]} ${marca(v.tipos.includes(k))}`)
    .join(" &nbsp; ");
  return `
  <div class="bloque">
    <div class="titulo">${numero}. ${titulo} (marque con una X)</div>
    <table>
      ${filaSiNo("Caminando", s.caminando)}
      ${filaSiNo("Transporte colectivo", s.colectivo)}
      ${filaSiNo("Al bajarse del transporte colectivo debe caminar", s.caminarTrasColectivo)}
      ${filaSiNo("Transporte de la empresa", s.empresa)}
      ${filaSiNo("Al bajarse del transporte de la empresa debe caminar", s.caminarTrasEmpresa)}
      <tr><th>Vehículo propio ${marca(v.propio)}</th><td colspan="2">De otra persona ${marca(v.otraPersona)}</td>
        <th class="dh">Maneja usted el vehículo</th><td class="txt">SI ${marca(v.maneja === true)} &nbsp; NO ${marca(v.maneja === false)} &nbsp; · &nbsp; Taxi ${marca(v.taxi)}</td></tr>
      <tr><th>Tipo de vehículo</th><td colspan="4" class="txt">${tipos}</td></tr>
      ${filaSiNo("Al bajarse del transporte debe caminar", v.caminarTras)}
      <tr><th>Punto(s) de referencia</th><td colspan="4" class="txt">${esc(referencias)}</td></tr>
      ${tiempo != null ? `<tr><th colspan="3">Tiempo aproximado de la vivienda al centro de trabajo</th><td colspan="2" class="txt">${tiempo} minutos</td></tr>` : ""}
    </table>
  </div>`;
}

/** Croquis: la ruta proyectada en un recuadro, con la casa, el trabajo, el norte y una escala. */
export function croquisSvg(desde: Punto | null, hasta: Punto | null, ruta: Punto[], etiquetas: [string, string]): string {
  const ancho = 700;
  const alto = 300;
  const linea = [desde, ...ruta, hasta].filter(Boolean) as Punto[];
  if (linea.length < 2) {
    return `<svg viewBox="0 0 ${ancho} ${alto}" class="croquis"><text x="${ancho / 2}" y="${alto / 2}" text-anchor="middle" fill="#999" font-size="14">Sin ruta trazada en el mapa</text></svg>`;
  }
  const lat0 = linea.reduce((s, p) => s + p[0], 0) / linea.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = linea.map(([lat, lng]) => [lng * k, -lat]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 55;
  const escala = Math.min((ancho - pad * 2) / Math.max(maxX - minX, 1e-6), (alto - pad * 2) / Math.max(maxY - minY, 1e-6));
  const offX = (ancho - (maxX - minX) * escala) / 2;
  const offY = (alto - (maxY - minY) * escala) / 2;
  const pt = xy.map(([x, y]) => [offX + (x - minX) * escala, offY + (y - minY) * escala]);
  const d = pt.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");

  // Escala: metros por píxel (1° de latitud ≈ 111.320 m) y un largo redondo.
  const metrosPx = 111_320 / escala;
  const opciones = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];
  const largo = opciones.find((m) => m / metrosPx >= 70) ?? opciones[opciones.length - 1];
  const largoPx = largo / metrosPx;
  const textoEscala = largo >= 1000 ? `${largo / 1000} km` : `${largo} m`;

  const [x0, y0] = pt[0];
  const [x1, y1] = pt[pt.length - 1];
  const sitio = (x: number, y: number, texto: string) => {
    const arriba = y > 40;
    return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" fill="#fff" stroke="#111" stroke-width="2"/>
      <text x="${x}" y="${arriba ? y - 15 : y + 28}" text-anchor="middle" font-size="15" font-weight="700" fill="#111">${esc(texto)}</text>`;
  };
  return `<svg viewBox="0 0 ${ancho} ${alto}" class="croquis" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${d}" fill="none" stroke="#444" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${d}" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="7 7" stroke-linejoin="round"/>
    ${sitio(x0, y0, etiquetas[0])}
    ${sitio(x1, y1, etiquetas[1])}
    <g transform="translate(${ancho - 30},34)"><path d="M0,-18 L7,6 L0,1 L-7,6 Z" fill="#111"/><text y="22" text-anchor="middle" font-size="12" font-weight="700">N</text></g>
    <g transform="translate(18,${alto - 16})"><line x1="0" y1="0" x2="${largoPx.toFixed(1)}" y2="0" stroke="#111" stroke-width="2"/>
      <line x1="0" y1="-4" x2="0" y2="4" stroke="#111" stroke-width="2"/><line x1="${largoPx.toFixed(1)}" y1="-4" x2="${largoPx.toFixed(1)}" y2="4" stroke="#111" stroke-width="2"/>
      <text x="${(largoPx / 2).toFixed(1)}" y="-7" text-anchor="middle" font-size="11">${textoEscala}</text></g>
  </svg>`;
}

const ESTILOS = `
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; margin: 0; }
  h1 { font-size: 13px; text-align: center; text-decoration: underline; margin: 0 0 8px; }
  p { margin: 0 0 6px; line-height: 1.35; text-align: justify; }
  .bloque { border: 1px solid #333; margin-top: 8px; break-inside: avoid; }
  .titulo { background: #4a4a4a; color: #fff; font-weight: 700; padding: 4px 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 5px; vertical-align: middle; text-align: left; font-size: 10.5px; }
  th { background: #8a8a8a; color: #fff; font-weight: 700; width: 26%; }
  th.dh { width: 13%; }
  td.sn { width: 6.5%; white-space: nowrap; }
  td.txt { font-family: "Comic Sans MS", "Segoe Print", Arial, sans-serif; font-size: 11px; }
  .casilla { display: inline-block; width: 14px; height: 14px; border: 1px solid #333; background: #fff; color: #111;
    text-align: center; line-height: 13px; font-weight: 700; margin-left: 3px; vertical-align: middle; }
  .dias td { text-align: center; }
  .croquis { width: 100%; height: auto; display: block; }
  .pagina2 { break-before: page; }
  .cierre { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; gap: 20px; }
  .firma { text-align: center; width: 260px; }
  .firma img { max-height: 80px; max-width: 250px; display: block; margin: 0 auto -6px; }
  .firma .linea { border-top: 1px solid #111; padding-top: 3px; }
  .huellas { display: flex; gap: 0; }
  .huellas div { width: 80px; height: 95px; border: 1px solid #111; display: flex; align-items: flex-end; justify-content: center;
    font-size: 9px; padding-bottom: 3px; color: #555; }
  .pie { margin-top: 14px; font-size: 9px; color: #666; }
`;

export function htmlPlanilla(r: Rutagrama): string {
  const sede = SEDES_RUTAGRAMA[r.sede];
  const ida = seccionTraslado(r.ida);
  const vuelta = seccionTraslado(tramosVuelta(r));
  const f = fechaLarga(r.enviado_at);
  const dias = DIAS.map((d) => `<th style="width:auto;text-align:center">${d.letra}</th><td>${marca(r.dias.includes(d.id))}</td>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Rutagrama - ${esc(r.nombre)}</title><style>${ESTILOS}</style></head><body>
  <h1>LEY ORGÁNICA DE PREVENCIÓN, CONDICIONES Y MEDIO AMBIENTE DE TRABAJO</h1>
  <p>La Ley Orgánica de Prevención, Condiciones y Medio Ambiente de Trabajo (LOPCYMAT), en su Artículo 69, establece que el accidente de trabajo
  "es todo suceso que produzca en el trabajador y la trabajadora una lesión funcional o corporal, permanente o temporal, inmediata o posterior,
  o que ocasione la muerte, y que resulte de una acción determinada o sobrevenida de su función en su puesto laboral". Además en el numeral 3 de
  este artículo, establece que: Los accidentes que sufra el trabajador o la trabajadora en el trayecto hacia y desde su centro de trabajo, siempre
  que ocurra durante el recorrido habitual, salvo que haya sido necesario realizar otro recorrido por motivos que no le sean imputables al
  trabajador o la trabajadora, y exista concordancia cronológica y topográfica en el recorrido.</p>
  <p><b>Empresa:</b> Supricom${sede ? ` — sede ${esc(sede.nombre)}` : ""}<br>Con el fin de garantizar los beneficios que otorga la mencionada Ley a los
  trabajadores y trabajadoras se requiere que cada uno de ellos complete los datos solicitados a continuación:</p>

  <div class="bloque"><div class="titulo">1. Datos del Trabajador</div><table>
    <tr><th>Apellidos y Nombres</th><td class="txt">${esc(r.nombre)}</td><th style="width:16%">Cédula de Identidad</th><td class="txt">${esc(r.cedula)}</td></tr>
    <tr><th>Dirección de Habitación</th><td class="txt" colspan="3">${esc(r.direccion)}</td></tr>
  </table></div>

  <div class="bloque"><div class="titulo">2. Datos del Puesto de Trabajo</div><table>
    <tr><th>Cargo ocupado</th><td class="txt">${esc(r.cargo)}</td><th style="width:16%">Turno de Trabajo</th><td class="txt">${esc(r.turno)}</td></tr>
  </table><table class="dias"><tr><th style="width:16%">Días que Labora</th>${dias}</tr></table></div>

  ${seccion(3, "Traslado habitual desde su vivienda hacia su centro de trabajo", ida, r.referencias_ida, r.tiempo_min)}
  ${seccion(4, "Traslado habitual desde su centro de trabajo hacia su vivienda", vuelta, r.vuelta_igual ? r.referencias_ida : r.referencias_vuelta, null)}

  <div class="pagina2">
    <div class="bloque"><div class="titulo">5. Croquis de la ruta que habitualmente toma para llegar de su vivienda a su centro de trabajo</div>
      ${croquisSvg(r.mapa.casa, r.mapa.trabajo, r.mapa.ida, ["Casa", "Trabajo"])}</div>
    <div class="bloque"><div class="titulo">6. Croquis de la ruta que habitualmente toma para llegar de su centro de trabajo a su vivienda</div>
      ${croquisSvg(r.mapa.trabajo, r.mapa.casa, rutaVuelta(r), ["Trabajo", "Casa"])}</div>
    <p style="margin-top:14px">Bajo Fe de Juramento declaro que los datos que he suministrado en este formulario son ciertos y si cambiare de domicilio me
    comprometo a notificar por escrito a la empresa en un lapso de 2 días hábiles, eximiendo a la misma de responsabilidad alguna en caso del
    incumplimiento de la notificación.</p>
    <p>${esc(sede?.ciudad ?? "")}, <u>&nbsp;${f.dia}&nbsp;</u> de <u>&nbsp;${f.mes}&nbsp;</u> de <u>&nbsp;${f.anio}&nbsp;</u></p>
    <div class="cierre">
      <div class="firma">${r.firma ? `<img src="${esc(r.firma)}" alt="Firma">` : ""}<div class="linea">Firma del Trabajador</div></div>
      <div class="huellas"><div>Pulgar derecho</div><div>Pulgar izquierdo</div></div>
    </div>
    <p class="pie">Llenado en línea por el trabajador${r.enviado_at ? ` el ${f.dia} de ${f.mes} de ${f.anio}` : ""} · Rutagrama N.º ${r.id}</p>
  </div>
  </body></html>`;
}
