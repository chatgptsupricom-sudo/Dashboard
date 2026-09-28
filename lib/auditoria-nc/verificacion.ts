import type { Control, EstadoControl } from "@/lib/metas-marca/auditoria";
import { CATEGORIA_LABEL } from "./motivos";
import { nombreSede, numerosDelRango, numerosExistentes, verificacionServidor } from "./odoo";
import type { DatosSede } from "./servicio";

/**
 * Verificación de los datos de Odoo detrás de la auditoría de NC y anuladas:
 * que se leyó todo (conteos y sumas en el servidor), que el historial del
 * chatter existe para lo que se anuló, que las NC apuntan a facturas válidas,
 * qué motivos no se pudieron clasificar, y huecos en la numeración (números
 * que no existen en Odoo con ninguna fecha, un control fiscal).
 */

export interface VerificacionSede {
  companyId: number;
  sede: string;
  desde: string;
  hasta: string;
  generado: string;
  controles: Control[];
  conteo: Record<EstadoControl, number>;
}

const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** "FCLIE/2026/01099" → { prefijo: "FCLIE/2026/", numero: 1099, ancho: 5 }; "5037748" → prefijo "". */
export function partirNumero(nombre: string): { prefijo: string; numero: number; ancho: number } | null {
  const m = nombre.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  return { prefijo: m[1], numero: Number(m[2]), ancho: m[2].length };
}

export async function verificarSede(d: DatosSede, desde: string, hasta: string): Promise<VerificacionSede> {
  const controles: Control[] = [];
  const { companyId } = d;
  const [srv, numeros] = await Promise.all([verificacionServidor(companyId, desde, hasta), numerosDelRango(companyId, desde, hasta)]);

  // 1. Registros completos
  {
    const publicadas = d.crudo.notas.filter((n) => n.estado === "posted" && n.fecha && n.fecha >= desde && n.fecha <= hasta);
    const montoPanel = publicadas.reduce((s, n) => s + n.base, 0);
    const anuladasFecha = d.crudo.anulados.filter((a) => a.fecha && a.fecha >= desde && a.fecha <= hasta).length;
    const ok = srv.nNc === d.crudo.notas.length && Math.abs(srv.montoNc - montoPanel) <= 1 && srv.nAnuladasFecha === anuladasFecha;
    controles.push({
      id: "conteo",
      titulo: "Se leyeron todas las notas de crédito y anuladas",
      estado: ok ? "ok" : "error",
      resumen: ok
        ? `${d.crudo.notas.length} notas de crédito (${usd(montoPanel)} publicadas) y ${anuladasFecha} anuladas con fecha en el período: igual que Odoo.`
        : "Lo leído no coincide con el conteo o la suma de Odoo.",
      explicacion: "Compara lo leído con search_count y read_group del mismo filtro calculados en el servidor de Odoo.",
      columnas: [{ key: "concepto", label: "Concepto" }, { key: "odoo", label: "Odoo" }, { key: "panel", label: "Panel" }],
      filas: [
        { concepto: "NC publicadas y en borrador", odoo: srv.nNc, panel: d.crudo.notas.length },
        { concepto: "Monto NC publicadas (sin IVA)", odoo: usd(srv.montoNc), panel: usd(montoPanel) },
        { concepto: "Anuladas con fecha en el período", odoo: srv.nAnuladasFecha, panel: anuladasFecha },
      ],
    });
  }

  // 2. Historial del chatter para las anuladas
  {
    const sinEvento = d.anuladas.filter((a) => !a.anuladaEl);
    controles.push({
      id: "historial",
      titulo: "Historial de anulaciones disponible",
      estado: sinEvento.length ? "aviso" : "ok",
      resumen: sinEvento.length
        ? `${sinEvento.length} de ${d.anuladas.length} anuladas no tienen el cambio de estado en el historial: no se sabe quién ni cuándo las anuló.`
        : `Las ${d.anuladas.length} anuladas tienen en el historial quién y cuándo las anuló.`,
      explicacion: "Quién y cuándo se anuló o reabrió sale del chatter de Odoo (mail.tracking.value del campo Estado). Si falta, el documento se anuló por un proceso que no deja rastro (script, importación) o el historial se borró.",
      columnas: [{ key: "numero", label: "Documento" }, { key: "fecha", label: "Fecha" }, { key: "cliente", label: "Cliente" }, { key: "base", label: "Monto", tipo: "dinero" }],
      filas: sinEvento.map((a) => ({ numero: a.numero, fecha: a.fecha, cliente: a.cliente, base: r2(a.base) })),
    });
  }

  // 3. Vínculo NC → factura
  {
    const raros = d.notas.filter((n) => {
      const o = n.origenId ? d.crudo.origenes.get(n.origenId) : undefined;
      return n.origenId && (!o || o.companyId !== n.companyId || o.tipo !== "out_invoice");
    });
    controles.push({
      id: "vinculo",
      titulo: "Las NC apuntan a facturas válidas",
      estado: raros.length ? "error" : "ok",
      resumen: raros.length
        ? `${raros.length} NC revierten un documento que no es factura de esta sede o no se pudo leer.`
        : "Todas las NC con factura de origen apuntan a una factura de cliente de la misma sede.",
      explicacion: "El campo \"Reversión de\" (reversed_entry_id) debe apuntar a una factura de cliente de la misma empresa.",
      columnas: [{ key: "numero", label: "NC" }, { key: "origen", label: "Origen" }, { key: "detalle", label: "Detalle" }],
      filas: raros.map((n) => {
        const o = n.origenId ? d.crudo.origenes.get(n.origenId) : undefined;
        return { numero: n.numero, origen: n.origenNumero, detalle: !o ? "No se pudo leer" : o.companyId !== n.companyId ? `Es de ${nombreSede(o.companyId)}` : `Es ${o.tipo}` };
      }),
    });
  }

  // 4. Motivos sin clasificar
  {
    const otros = d.notas.filter((n) => n.categoria === "otro");
    const porMotivo = new Map<string, { cantidad: number; monto: number }>();
    for (const n of otros) {
      const k = n.motivo.slice(0, 80);
      const x = porMotivo.get(k) ?? { cantidad: 0, monto: 0 };
      x.cantidad++; x.monto += n.base;
      porMotivo.set(k, x);
    }
    const total = d.notas.filter((n) => n.categoria !== "importacion").length;
    controles.push({
      id: "motivos",
      titulo: "Motivos que no se pudieron clasificar",
      estado: "info",
      resumen: otros.length
        ? `${otros.length} de ${total} NC quedaron como "${CATEGORIA_LABEL.otro}". Si alguno se repite, se puede agregar como categoría.`
        : "Todos los motivos entraron en alguna categoría.",
      explicacion: "El motivo es texto libre (lo que se escribe al revertir la factura) y se clasifica por palabras clave. Estos son los que no coinciden con ninguna.",
      columnas: [{ key: "motivo", label: "Motivo" }, { key: "cantidad", label: "NC", tipo: "numero" }, { key: "monto", label: "Monto", tipo: "dinero" }],
      filas: [...porMotivo.entries()].sort((a, b) => b[1].monto - a[1].monto).slice(0, 30)
        .map(([motivo, x]) => ({ motivo, cantidad: x.cantidad, monto: r2(x.monto) })),
    });
  }

  // 5. Huecos en la numeración
  {
    const porPrefijo = new Map<string, { ancho: number; nums: Set<number> }>();
    for (const n of numeros) {
      const p = partirNumero(n.nombre);
      if (!p) continue;
      const k = `${p.prefijo}|${p.ancho}`;
      const x = porPrefijo.get(k) ?? { ancho: p.ancho, nums: new Set() };
      x.nums.add(p.numero);
      porPrefijo.set(k, x);
    }
    const candidatos: string[] = [];
    for (const [k, x] of porPrefijo) {
      const prefijo = k.split("|")[0];
      const ns = [...x.nums].sort((a, b) => a - b);
      if (ns.length < 2 || ns[ns.length - 1] - ns[0] > 20000) continue;
      for (let i = 1; i < ns.length; i++) {
        for (let n = ns[i - 1] + 1; n < ns[i] && candidatos.length < 2000; n++) candidatos.push(prefijo + String(n).padStart(x.ancho, "0"));
      }
    }
    // Un número "saltado" puede existir con fecha fuera del período, en
    // borrador o en otro tipo de documento: solo cuenta si no existe en Odoo.
    const existen = candidatos.length ? await numerosExistentes(companyId, candidatos) : new Set<string>();
    const faltan = candidatos.filter((c) => !existen.has(c));
    controles.push({
      id: "secuencia",
      titulo: "Números de factura y NC saltados",
      estado: faltan.length ? "error" : "ok",
      resumen: faltan.length
        ? `${faltan.length} números de la secuencia del período no existen en Odoo con ninguna fecha ni estado (documentos borrados o numeración saltada).`
        : `La numeración de las ${numeros.length} facturas y NC del período es continua (los números intermedios existen en Odoo).`,
      explicacion: "Por cada serie (prefijo) se buscan los números entre el primero y el último del período que no aparecen. Cada uno se busca en Odoo sin filtro de fecha: si tampoco existe ahí, el documento se borró o la secuencia saltó. En Venezuela la numeración de facturas debe ser correlativa.",
      columnas: [{ key: "numero", label: "Número faltante" }, { key: "serie", label: "Serie" }],
      filas: faltan.slice(0, 200).map((n) => ({ numero: n, serie: partirNumero(n)?.prefijo || "(numérica)" })),
    });
  }

  // 6. Reabiertas sin cambios relevantes
  {
    const sin = d.reabiertas.filter((r) => r.alertas.length === 0);
    controles.push({
      id: "reabiertas",
      titulo: "Reabiertas sin cambios relevantes",
      estado: "info",
      resumen: `${d.reabiertas.length} documentos reabiertos en el período; ${sin.length} se volvieron a publicar sin cambios de monto, cliente, fecha, impuestos ni vendedor.`,
      explicacion: "Reabrir (Restablecer a borrador) es normal para corregir detalles. Lo que interesa son los cambios de monto, cliente, fecha, impuestos o vendedor, que aparecen como alertas en la pestaña Reabiertas. No se cuentan las renumeraciones al publicar ni diferencias de centavos.",
    });
  }

  const conteo: Record<EstadoControl, number> = { ok: 0, aviso: 0, error: 0, info: 0 };
  for (const c of controles) conteo[c.estado]++;
  return { companyId, sede: nombreSede(companyId), desde, hasta, generado: new Date().toISOString(), controles, conteo };
}
