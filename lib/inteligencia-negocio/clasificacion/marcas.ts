import { leerClasificacionProductos } from "@/lib/inteligencia-negocio/clasificacion/datos";
import type { FilaMarca } from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { reporteProductos } from "@/lib/inteligencia-negocio/reportes";

/**
 * Clasificación por marca: la venta, el margen y el inventario de cada marca
 * repartidos por categoría y nombre corto (Clasificación de productos). Sale
 * del reporte de Productos del mes (mismas reglas: USD sin IVA, NC restan,
 * sin intercompañía; inventario al cierre del almacén principal). Lo que
 * todavía no está clasificado va con su categoría de Odoo y "Sin clasificar".
 */
export async function clasificacionPorMarca(companyIds: number[], mes: string): Promise<FilaMarca[]> {
  const [productos, clasif] = await Promise.all([reporteProductos(companyIds, mes), leerClasificacionProductos()]);

  const grupos = new Map<string, FilaMarca>();
  for (const p of productos) {
    if (p.venta === 0 && p.unidades === 0 && p.inventario === 0) continue;
    const c = clasif.get(p.id);
    const categoria = c?.categoria ?? p.categoria;
    const subcategoria = c?.subcategoria ?? "Sin clasificar";
    const llave = `${p.marca}|${categoria}|${subcategoria}`;
    let g = grupos.get(llave);
    if (!g) {
      g = { marca: p.marca, categoria, subcategoria, productos: 0, venta: 0, unidades: 0, costoVendido: 0, margen: null, inventario: 0, pctMarca: 0 };
      grupos.set(llave, g);
    }
    g.productos++;
    g.venta += p.venta;
    g.unidades += p.unidades;
    g.inventario += p.inventario;
    // costo = costo de lo vendido ÷ unidades cuando hubo venta (lib/inteligencia-negocio/reportes.ts).
    if (p.margen !== null && p.costo !== null) g.costoVendido += p.costo * p.unidades;
  }

  const ventaMarca = new Map<string, number>();
  for (const g of grupos.values()) ventaMarca.set(g.marca, (ventaMarca.get(g.marca) ?? 0) + g.venta);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...grupos.values()]
    .map((g) => {
      const total = ventaMarca.get(g.marca) ?? 0;
      return {
        ...g,
        venta: r2(g.venta),
        unidades: r2(g.unidades),
        inventario: r2(g.inventario),
        costoVendido: r2(g.costoVendido),
        margen: g.venta > 0 && g.costoVendido > 0 ? r2(((g.venta - g.costoVendido) / g.venta) * 100) : null,
        pctMarca: total > 0 ? r2((g.venta / total) * 100) : 0,
      };
    })
    .sort(
      (a, b) =>
        (ventaMarca.get(b.marca) ?? 0) - (ventaMarca.get(a.marca) ?? 0) ||
        a.marca.localeCompare(b.marca) ||
        b.venta - a.venta ||
        b.inventario - a.inventario,
    );
}
