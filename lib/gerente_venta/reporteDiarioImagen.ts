/**
 * Exporta el Reporte Diario de Ventas como una imagen PNG con el formato del
 * reporte que la gerencia venía armando a mano en Excel: cabecera con el logo
 * de SUPRICOM, medidor de "Cumplimiento Global", las tres tablas (días, metas,
 * ranking de vendedores) con las cabeceras azules.
 *
 * Todo se dibuja en un <canvas> en el navegador (sin dependencias). Se llama
 * desde el botón "Imagen" de `components/gerente_ventas/ReporteDiario.tsx`.
 */

export interface VendedorImagen {
  name: string;
  cuota: number;
  cuotaAlDia: number;
  venta: number;
  porcentaje: number;
  posicion: number;
}

export interface DatosReporteImagen {
  fechaDisplay: string; // "08/09/2026"
  sedeNombre?: string | null;
  diasHabiles: number;
  diasTranscurridos: number;
  porcentajeDias: number;
  meta: number;
  cuotaAlDia: number;
  ventas: number;
  pedidos: number;
  ventaMasPedidos: number;
  vendedores: VendedorImagen[];
}

const AZUL_OSCURO = "#1f4e79";
const AZUL_MEDIO = "#2e75b6";
const AZUL_CLARO = "#c9ddf0";
const GRIS_BORDE = "#d9d9d9";
const GRIS_FILA = "#f4f7fb";
const TEXTO = "#1a1a1a";
const VERDE = "#2e9e5b";
const AMBAR = "#e0a800";
const ROJO = "#d64545";

const FUENTE =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

function money(n: number): string {
  return (n || 0).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function entero(n: number): string {
  return Math.round(n || 0).toLocaleString("es-VE");
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function cargarLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/Supricom-logo.png";
  });
}

/** Dibuja el medidor semicircular de cumplimiento (0% izquierda, 100% derecha). */
function medidor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radio: number,
  fraccion: number,
) {
  const f = Math.max(0, Math.min(1, fraccion));
  ctx.lineCap = "butt";
  ctx.lineWidth = 24;

  ctx.strokeStyle = AZUL_CLARO;
  ctx.beginPath();
  ctx.arc(cx, cy, radio, Math.PI, 2 * Math.PI);
  ctx.stroke();

  if (f > 0) {
    ctx.strokeStyle = AZUL_MEDIO;
    ctx.beginPath();
    ctx.arc(cx, cy, radio, Math.PI, Math.PI + Math.PI * f);
    ctx.stroke();
  }

  ctx.fillStyle = "#8a97a8";
  ctx.font = `600 11px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.fillText("0%", cx - radio, cy + 16);
  ctx.fillText("100%", cx + radio, cy + 16);

  ctx.fillStyle = "#5b6b7d";
  ctx.font = `700 12px ${FUENTE}`;
  ctx.fillText("Cumplimiento Global", cx, cy + 18);
  ctx.fillStyle = AZUL_OSCURO;
  ctx.font = `800 26px ${FUENTE}`;
  ctx.fillText(`${Math.round(f * 100)}%`, cx, cy + 44);
}

interface Celda {
  texto: string;
  encabezado?: boolean; // fondo azul, texto blanco
  alinear?: CanvasTextAlign;
  color?: string;
  negrita?: boolean;
}

function fila(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alto: number,
  cols: { ancho: number; celda: Celda }[],
) {
  let cx = x;
  for (const { ancho, celda } of cols) {
    ctx.fillStyle = celda.encabezado ? AZUL_OSCURO : "#ffffff";
    ctx.fillRect(cx, y, ancho, alto);
    ctx.strokeStyle = GRIS_BORDE;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, y + 0.5, ancho, alto);

    const alinear = celda.alinear || (celda.encabezado ? "center" : "left");
    ctx.textAlign = alinear;
    ctx.textBaseline = "middle";
    ctx.fillStyle = celda.encabezado
      ? "#ffffff"
      : celda.color || TEXTO;
    ctx.font = `${celda.negrita || celda.encabezado ? 700 : 500} 12px ${FUENTE}`;
    const tx =
      alinear === "center"
        ? cx + ancho / 2
        : alinear === "right"
          ? cx + ancho - 10
          : cx + 10;
    ctx.fillText(celda.texto, tx, y + alto / 2 + 0.5);
    cx += ancho;
  }
}

function colorPorcentaje(p: number): string {
  if (p >= 100) return VERDE;
  if (p >= 60) return AMBAR;
  return ROJO;
}

function flecha(p: number): string {
  if (p >= 100) return "▲"; // ▲
  if (p >= 60) return "▶"; // ▶
  return "▼"; // ▼
}

export async function generarImagenReporteDiario(
  d: DatosReporteImagen,
): Promise<Blob> {
  const escala = 2;
  const W = 900;
  const margenX = 45;
  const anchoTabla = W - margenX * 2;
  const altoFila = 30;
  const yRanking = 300;
  const H =
    yRanking + altoFila * (d.vendedores.length + 1) + 45;

  const canvas = document.createElement("canvas");
  canvas.width = W * escala;
  canvas.height = H * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el canvas");
  ctx.scale(escala, escala);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  /* ── Cabecera ── */
  const logo = await cargarLogo();
  if (logo) {
    const h = 54;
    const w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, margenX, 24, w, h);
  } else {
    ctx.fillStyle = AZUL_OSCURO;
    ctx.font = `800 30px ${FUENTE}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SUPRICOM", margenX, 55);
  }

  ctx.fillStyle = "#1f3864";
  ctx.font = `800 26px ${FUENTE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("REPORTE DIARIO DE VENTAS", W / 2 + 20, 42);

  ctx.fillStyle = "#5b6b7d";
  ctx.font = `700 13px ${FUENTE}`;
  ctx.textAlign = "left";
  ctx.fillText(
    `FECHA ${d.fechaDisplay.replace(/\//g, "-")}${
      d.sedeNombre ? `   ·   ${d.sedeNombre}` : ""
    }`,
    margenX,
    92,
  );

  medidor(ctx, W - 150, 70, 62, pct(d.ventas, d.meta) / 100);

  /* ── Tabla 1: días ── */
  const anchoEtq = 210;
  const anchoVal = 150;
  let y = 120;
  const dias: [string, string][] = [
    ["DÍAS HÁBILES", String(d.diasHabiles)],
    ["DÍAS TRANSCURRIDOS", String(d.diasTranscurridos)],
    ["% DÍAS TRANSC.", `${d.porcentajeDias}%`],
  ];
  for (const [etq, val] of dias) {
    fila(ctx, margenX, y, altoFila, [
      { ancho: anchoEtq, celda: { texto: etq, encabezado: true } },
      { ancho: anchoVal, celda: { texto: val, alinear: "center", negrita: true } },
    ]);
    y += altoFila;
  }

  /* ── Tabla 2: metas ── */
  y += 22;
  const anchoPct = 90;
  // "08/09/2026" -> "08/09/26"
  const fechaCorta = d.fechaDisplay.replace(/^(\d{2}\/\d{2}\/)\d{2}(\d{2})$/, "$1$2");
  const metas: [string, string, string, string?][] = [
    ["META", entero(d.meta), ""],
    [`CUOTA AL ${fechaCorta}`, entero(d.cuotaAlDia), ""],
    ["VENTA", money(d.ventas), `${pct(d.ventas, d.cuotaAlDia)}%`],
    ["PEDIDOS", money(d.pedidos), `${pct(d.pedidos, d.cuotaAlDia)}%`],
    ["VENTA + PEDIDOS", money(d.ventaMasPedidos), `${pct(d.ventaMasPedidos, d.cuotaAlDia)}%`],
  ];
  metas.forEach(([etq, val, p], i) => {
    fila(ctx, margenX, y, altoFila, [
      { ancho: anchoEtq, celda: { texto: etq, encabezado: true } },
      {
        ancho: anchoVal,
        celda: {
          texto: val,
          alinear: "right",
          negrita: true,
          color: i >= 2 ? AZUL_OSCURO : TEXTO,
        },
      },
      {
        ancho: anchoPct,
        celda: p
          ? { texto: p, alinear: "center", negrita: true, color: "#ffffff", encabezado: true }
          : { texto: "", alinear: "center" },
      },
    ]);
    y += altoFila;
  });

  /* ── Tabla 3: ranking de vendedores ── */
  y = yRanking;
  const cols = [
    { k: "pos", w: 55, etq: "#" },
    { k: "name", w: anchoTabla - 55 - 150 - 150 - 150 - 80, etq: "VENDEDOR" },
    { k: "cuota", w: 150, etq: "CUOTA" },
    { k: "cuotaDia", w: 150, etq: "CUOTA AL DÍA" },
    { k: "venta", w: 150, etq: "VENTA" },
    { k: "pct", w: 80, etq: "%" },
  ];
  fila(
    ctx,
    margenX,
    y,
    altoFila,
    cols.map((c) => ({ ancho: c.w, celda: { texto: c.etq, encabezado: true } })),
  );
  y += altoFila;

  d.vendedores.forEach((v, i) => {
    // fondo alterno
    ctx.fillStyle = i % 2 === 0 ? "#ffffff" : GRIS_FILA;
    ctx.fillRect(margenX, y, anchoTabla, altoFila);

    const p = v.porcentaje;
    fila(ctx, margenX, y, altoFila, [
      { ancho: cols[0].w, celda: { texto: String(v.posicion), alinear: "center", negrita: true } },
      { ancho: cols[1].w, celda: { texto: v.name.toUpperCase(), negrita: true } },
      { ancho: cols[2].w, celda: { texto: entero(v.cuota), alinear: "right" } },
      { ancho: cols[3].w, celda: { texto: entero(v.cuotaAlDia), alinear: "right", color: "#6b7787" } },
      { ancho: cols[4].w, celda: { texto: money(v.venta), alinear: "right", negrita: true } },
      {
        ancho: cols[5].w,
        celda: {
          texto: `${flecha(p)} ${p}%`,
          alinear: "center",
          negrita: true,
          color: colorPorcentaje(p),
        },
      },
    ]);
    y += altoFila;
  });

  ctx.fillStyle = "#9aa5b1";
  ctx.font = `500 10px ${FUENTE}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(
    `Generado ${new Date().toLocaleString("es-VE")}`,
    W - margenX,
    H - 16,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob devolvió null"))),
      "image/png",
    );
  });
}

/** Genera la imagen y dispara la descarga. */
export async function descargarImagenReporteDiario(
  d: DatosReporteImagen,
): Promise<void> {
  const blob = await generarImagenReporteDiario(d);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Reporte_Diario_Ventas_${d.fechaDisplay.replace(/\//g, "-")}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
