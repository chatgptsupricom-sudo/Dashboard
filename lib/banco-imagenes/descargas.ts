// Descarga de flyers del Banco de Flyers, todo en el navegador: las imágenes se
// leen de /api/adminleads/banco-imagenes/image/[id] (mismo guard de roles que la
// galería), se les dibuja el precio en un canvas y se entregan como PNG sueltos,
// un PDF (una página por flyer) o un .zip.

export interface FlyerADescargar {
  image_path: string;
  product_code: string | null;
  /** null = sin precio */
  precio: number | null;
  /** Centro de la etiqueta de precio, en % del ancho/alto de la imagen */
  badgePos: { x: number; y: number };
}

export const BADGE_POS_INICIAL = { x: 82, y: 88 };

/** Lo que el editor guarda por flyer (precio de Odoo o propio, y dónde va la etiqueta). */
export interface AjustesFlyer {
  priceMode: "odoo" | "custom";
  customPrice: string;
  badgePos: { x: number; y: number };
}

/**
 * Flyer listo para la descarga múltiple. Sin ajustes usa el precio de Odoo en la
 * posición inicial; un precio en 0 sale sin etiqueta.
 */
export function armarFlyer(
  img: { image_path: string; product_code: string | null; price: number | null },
  ajustes: AjustesFlyer | undefined,
  conPrecio: boolean
): FlyerADescargar {
  const precio =
    ajustes?.priceMode === "custom" ? parseFloat(ajustes.customPrice) || 0 : Number(img.price || 0);
  return {
    image_path: img.image_path,
    product_code: img.product_code,
    precio: conPrecio && precio > 0 ? precio : null,
    badgePos: ajustes?.badgePos ?? BADGE_POS_INICIAL,
  };
}

export function textoPrecio(precio: number): string {
  return `$${precio.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/** Dibuja el flyer (y su etiqueta de precio si tiene) a tamaño original. */
export async function dibujarFlyer(flyer: FlyerADescargar): Promise<HTMLCanvasElement> {
  const img = await cargarImagen(flyer.image_path);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  if (flyer.precio !== null) {
    const priceText = textoPrecio(flyer.precio);
    const fontSize = Math.max(canvas.width * 0.055, 28);
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(priceText).width;
    const padX = fontSize * 0.65;
    const padY = fontSize * 0.4;
    const labelW = textWidth + padX * 2;
    const labelH = fontSize + padY * 2;

    const centerX = (flyer.badgePos.x / 100) * canvas.width;
    const centerY = (flyer.badgePos.y / 100) * canvas.height;
    const labelX = Math.max(10, Math.min(canvas.width - labelW - 10, centerX - labelW / 2));
    const labelY = Math.max(10, Math.min(canvas.height - labelH - 10, centerY - labelH / 2));

    const grad = ctx.createLinearGradient(labelX, labelY, labelX + labelW, labelY);
    grad.addColorStop(0, "rgba(239, 68, 68, 0.95)");
    grad.addColorStop(1, "rgba(220, 38, 38, 0.95)");

    const radius = labelH / 2;
    ctx.beginPath();
    ctx.moveTo(labelX + radius, labelY);
    ctx.lineTo(labelX + labelW - radius, labelY);
    ctx.arcTo(labelX + labelW, labelY, labelX + labelW, labelY + radius, radius);
    ctx.arcTo(labelX + labelW, labelY + labelH, labelX + labelW - radius, labelY + labelH, radius);
    ctx.lineTo(labelX + radius, labelY + labelH);
    ctx.arcTo(labelX, labelY + labelH, labelX, labelY + labelH - radius, radius);
    ctx.arcTo(labelX, labelY, labelX + radius, labelY, radius);
    ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = fontSize * 0.5;
    ctx.shadowOffsetY = fontSize * 0.1;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = fontSize * 0.05;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(priceText, labelX + padX, labelY + labelH / 2);
  }

  return canvas;
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), tipo, calidad);
  });
}

export function guardarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombre;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nombre del PNG, igual que la descarga de un flyer: CODIGO[_precio].png */
export function nombreFlyer(flyer: FlyerADescargar): string {
  const base = (flyer.product_code || "flyer").replace(/[\\/:*?"<>|]+/g, "-");
  return `${base}${flyer.precio !== null ? `_${flyer.precio}` : ""}.png`;
}

/** Evita dos archivos con el mismo nombre dentro del .zip */
function nombresUnicos(flyers: FlyerADescargar[]): string[] {
  const usados = new Map<string, number>();
  return flyers.map((f) => {
    const nombre = nombreFlyer(f);
    const n = usados.get(nombre) ?? 0;
    usados.set(nombre, n + 1);
    return n === 0 ? nombre : nombre.replace(/\.png$/, ` (${n + 1}).png`);
  });
}

export async function flyerPng(flyer: FlyerADescargar): Promise<Blob> {
  return canvasABlob(await dibujarFlyer(flyer), "image/png");
}

function sello(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ResultadoDescarga {
  ok: number;
  fallidos: string[];
}

type Progreso = (hechos: number, total: number) => void;

/** Cada flyer como su propio PNG, uno tras otro. */
export async function descargarIndividuales(flyers: FlyerADescargar[], onProgreso?: Progreso): Promise<ResultadoDescarga> {
  const fallidos: string[] = [];
  let ok = 0;
  for (let i = 0; i < flyers.length; i++) {
    const f = flyers[i];
    try {
      guardarBlob(await flyerPng(f), nombreFlyer(f));
      ok++;
      // Un respiro entre descargas: los navegadores frenan ráfagas de descargas.
      if (i < flyers.length - 1) await new Promise((r) => setTimeout(r, 400));
    } catch {
      fallidos.push(f.product_code || f.image_path);
    }
    onProgreso?.(i + 1, flyers.length);
  }
  return { ok, fallidos };
}

/** Todos los PNG en un solo .zip */
export async function descargarZip(flyers: FlyerADescargar[], onProgreso?: Progreso): Promise<ResultadoDescarga> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const nombres = nombresUnicos(flyers);
  const fallidos: string[] = [];
  let ok = 0;
  for (let i = 0; i < flyers.length; i++) {
    try {
      zip.file(nombres[i], await flyerPng(flyers[i]));
      ok++;
    } catch {
      fallidos.push(flyers[i].product_code || flyers[i].image_path);
    }
    onProgreso?.(i + 1, flyers.length);
  }
  if (ok > 0) {
    // Los PNG ya vienen comprimidos: STORE evita recomprimir para nada.
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    guardarBlob(blob, `flyers_${sello()}.zip`);
  }
  return { ok, fallidos };
}

/** Todos los flyers en un PDF, una página por flyer (ancho A4, alto según la imagen). */
export async function descargarPdf(flyers: FlyerADescargar[], onProgreso?: Progreso): Promise<ResultadoDescarga> {
  const paginas: PaginaPdf[] = [];
  const fallidos: string[] = [];
  for (let i = 0; i < flyers.length; i++) {
    try {
      const canvas = await dibujarFlyer(flyers[i]);
      // JPEG no tiene transparencia: se pinta sobre blanco para que no salga negro.
      const fondo = document.createElement("canvas");
      fondo.width = canvas.width;
      fondo.height = canvas.height;
      const ctx = fondo.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, fondo.width, fondo.height);
      ctx.drawImage(canvas, 0, 0);
      const jpeg = new Uint8Array(await (await canvasABlob(fondo, "image/jpeg", 0.92)).arrayBuffer());
      paginas.push({ jpeg, ancho: fondo.width, alto: fondo.height });
    } catch {
      fallidos.push(flyers[i].product_code || flyers[i].image_path);
    }
    onProgreso?.(i + 1, flyers.length);
  }
  if (paginas.length > 0) guardarBlob(armarPdf(paginas), `flyers_${sello()}.pdf`);
  return { ok: paginas.length, fallidos };
}

interface PaginaPdf {
  jpeg: Uint8Array;
  ancho: number;
  alto: number;
}

const ANCHO_PAGINA = 595.28; // A4 en puntos

/** PDF mínimo con una imagen JPEG por página (DCTDecode), sin dependencias. */
function armarPdf(paginas: PaginaPdf[]): Blob {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const offsets: number[] = [];
  let largo = 0;
  const push = (p: Uint8Array | string) => {
    const bytes = typeof p === "string" ? enc.encode(p) : p;
    partes.push(bytes);
    largo += bytes.length;
  };
  const objeto = (n: number, cuerpo: string, stream?: Uint8Array) => {
    offsets[n] = largo;
    push(`${n} 0 obj\n${cuerpo}\n`);
    if (stream) {
      push("stream\n");
      push(stream);
      push("\nendstream\n");
    }
    push("endobj\n");
  };

  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // marca de archivo binario

  // 1 = Catalog, 2 = Pages, luego por página: Page, Contents, Image
  const idsPagina = paginas.map((_, i) => 3 + i * 3);
  objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objeto(2, `<< /Type /Pages /Kids [${idsPagina.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`);

  paginas.forEach((p, i) => {
    const idPagina = idsPagina[i];
    const idContenido = idPagina + 1;
    const idImagen = idPagina + 2;
    const w = ANCHO_PAGINA;
    const h = +((p.alto / p.ancho) * ANCHO_PAGINA).toFixed(2);
    const contenido = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q`);
    objeto(
      idPagina,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 ${idImagen} 0 R >> >> /Contents ${idContenido} 0 R >>`
    );
    objeto(idContenido, `<< /Length ${contenido.length} >>`, contenido);
    objeto(
      idImagen,
      `<< /Type /XObject /Subtype /Image /Width ${p.ancho} /Height ${p.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,
      p.jpeg
    );
  });

  const totalObjetos = 3 + paginas.length * 3;
  const inicioXref = largo;
  let xref = `xref\n0 ${totalObjetos}\n0000000000 65535 f \n`;
  for (let n = 1; n < totalObjetos; n++) xref += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${totalObjetos} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

  return new Blob(partes as BlobPart[], { type: "application/pdf" });
}
