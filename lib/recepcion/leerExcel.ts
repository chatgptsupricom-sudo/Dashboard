/**
 * Lee los renglones de un packing list en Excel.
 *
 * Cada proveedor arma el suyo: encabezados en la fila 1 o en la 12, en
 * espanol o en ingles, con o sin columna de cajas. Asi que no se asume un
 * formato: se busca en las primeras filas la que parece encabezado (tiene
 * una columna de producto y otra de cantidad) y se toman las columnas por
 * nombre. Lo que no se reconozca se carga a mano; el resultado siempre lo
 * revisa Compras antes de guardar.
 */

export type RenglonLeido = {
  codigo: string;
  producto: string;
  cantidad_esperada: number;
  cajas_esperadas: number | null;
};

const PATRONES = {
  codigo: /\b(c[oó]d(igo)?|sku|item\s*(no|#|code)|part\s*(no|#|number)|model(o)?|ref(erencia)?|art(\.|[ií]culo)?\s*(no|#)?)\b/i,
  producto: /(descrip|product|nombre|art[ií]culo|goods|commodity|item(?!\s*(no|#|code)))/i,
  cantidad: /(cant|qty|q'?ty|quantity|pcs|pieces|piezas|unid|units)/i,
  cajas: /(caja|ctn|carton|bulto|pkgs?|packages|boxes)/i,
};

const normal = (v: unknown) => String(v ?? "").trim();

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = normal(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  // Un solo separador con exactamente 3 cifras detras ("1,200", "1.200",
  // "12,000,000") es de miles: una cantidad de piezas con tres decimales no
  // existe, y leerlo como decimal convertiria 1200 piezas en 1,2.
  if (/^-?\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  // "1.234,5" (es) o "1,234.5" (en): el ultimo separador es el decimal.
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const limpio =
    ultimo === -1
      ? s
      : s.slice(0, ultimo).replace(/[.,]/g, "") + "." + s.slice(ultimo + 1);
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export async function leerExcel(archivo: File): Promise<RenglonLeido[]> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });

  for (const nombreHoja of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja], {
      header: 1,
      blankrows: false,
      defval: "",
    });

    // Fila de encabezados: la primera (de las 40 primeras) con producto y cantidad.
    for (let h = 0; h < Math.min(40, filas.length); h++) {
      const enc = (filas[h] || []).map(normal);
      const col = (re: RegExp, excluir: number[] = []) =>
        enc.findIndex((c, i) => c && re.test(c) && !excluir.includes(i));
      const cCantidad = col(PATRONES.cantidad);
      const cCodigo = col(PATRONES.codigo);
      const cProducto = col(PATRONES.producto, [cCodigo, cCantidad]);
      if (cProducto === -1 || cCantidad === -1) continue;
      const cCajas = col(PATRONES.cajas, [cCodigo, cProducto, cCantidad]);

      const renglones: RenglonLeido[] = [];
      for (const fila of filas.slice(h + 1)) {
        const producto = normal(fila[cProducto]);
        const cantidad = numero(fila[cCantidad]);
        if (!producto && cantidad === null) continue;
        // Filas de total/subtotal al pie: no son mercancia.
        if (/^(sub)?total|^grand\s*total/i.test(producto)) continue;
        if (!producto || cantidad === null || cantidad < 0) continue;
        renglones.push({
          codigo: cCodigo >= 0 ? normal(fila[cCodigo]) : "",
          producto: producto.slice(0, 300),
          cantidad_esperada: cantidad,
          cajas_esperadas: cCajas >= 0 ? numero(fila[cCajas]) : null,
        });
      }
      if (renglones.length) return renglones;
    }
  }
  return [];
}
