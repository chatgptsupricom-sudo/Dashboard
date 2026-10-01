"use client";

import { CATEGORIA_LABEL } from "@/lib/auditoria-nc/motivos";
import { ChipEstado } from "./Comunes";
import { TablaDocs, type Columna } from "./TablaDocs";
import { PAGO, dinero, fecha, fechaHora, pct, type DatosAuditoriaNC } from "./formato";

type NC = DatosAuditoriaNC["notas"][number];
type AN = DatosAuditoriaNC["anuladas"][number];
type RE = DatosAuditoriaNC["reabiertas"][number];

interface Comun { multiSede: boolean; onAbrir: (x: { id: number; numero: string; sede: string; alertas: NC["alertas"] }) => void; codigo: string | null; setCodigo: (c: string | null) => void }

const Sub = ({ children }: { children: React.ReactNode }) => <span className="block text-[11px] font-normal text-slate-400">{children}</span>;
const sede = (multi: boolean, s: string) => (multi ? <Sub>{s}</Sub> : null);

export function PestanaNC({ filas, multiSede, ...p }: Comun & { filas: NC[] }) {
  const columnas: Columna<NC>[] = [
    { key: "numero", label: "Nota de crédito", render: (n) => <span className="block">{n.numero}<Sub>{fecha(n.fecha)}{n.estado === "draft" ? " · borrador" : ""}</Sub>{sede(multiSede, n.sede)}</span>, orden: (n) => n.fecha || "" },
    { key: "cliente", label: "Cliente", render: (n) => <div className="max-w-[220px]"><p className="truncate text-slate-800" title={n.cliente}>{n.cliente}</p>{n.intercompania && <Sub>Intercompañía</Sub>}</div>, orden: (n) => n.cliente },
    { key: "base", label: "Monto", align: "right", render: (n) => <><p className="font-semibold text-slate-900">{dinero(n.base)}</p>{n.pctFactura != null && <Sub>{pct(n.pctFactura, 0)} de la factura</Sub>}</>, orden: (n) => n.base },
    { key: "origen", label: "Factura", render: (n) => n.origen ? <><p className="text-slate-700">{n.origen.numero}</p><Sub>{fecha(n.origen.fecha)}{n.diasDesdeFactura != null ? ` · ${n.diasDesdeFactura} días` : ""}</Sub></> : <span className="text-xs text-red-600">{n.categoria === "importacion" ? "–" : "Sin factura"}</span>, orden: (n) => n.diasDesdeFactura ?? -1 },
    { key: "motivo", label: "Motivo", render: (n) => <div className="max-w-[240px]"><p className="truncate text-slate-700" title={n.motivo}>{n.motivo || <span className="text-red-600">Sin motivo</span>}</p><Sub>{CATEGORIA_LABEL[n.categoria]}</Sub></div>, orden: (n) => n.categoria },
    { key: "usuario", label: "Creada por", render: (n) => <><p className="text-slate-700">{n.creadoPor || "–"}</p><Sub>Vendedor: {n.origen?.vendedor || n.vendedor || "–"}</Sub></>, orden: (n) => n.creadoPor },
    { key: "pago", label: "Aplicada", render: (n) => n.estado === "draft" ? <ChipEstado estado="draft" /> : <><p className="text-slate-700">{PAGO[n.estadoPago] || n.estadoPago}</p>{n.residual > 0.01 && <Sub>{dinero(n.residual)} pendiente</Sub>}</>, orden: (n) => n.residual },
  ];
  return (
    <TablaDocs filas={filas} columnas={columnas} {...p} onAbrir={(n) => p.onAbrir(n)} vacio="No hay notas de crédito en el período."
      buscar={(n) => `${n.numero} ${n.cliente} ${n.creadoPor} ${n.vendedor} ${n.origen?.numero || ""} ${n.motivo}`}
      pie="Monto sin IVA. La barra de color a la izquierda marca la alerta más grave." />
  );
}

export function PestanaAnuladas({ filas, multiSede, ...p }: Comun & { filas: AN[] }) {
  const columnas: Columna<AN>[] = [
    { key: "numero", label: "Documento", render: (a) => <span className="block">{a.numero}<Sub>{a.tipo === "out_refund" ? "Nota de crédito" : "Factura"} · {fecha(a.fecha)}</Sub>{sede(multiSede, a.sede)}</span>, orden: (a) => a.fecha || "" },
    { key: "cliente", label: "Cliente", render: (a) => <p className="max-w-[220px] truncate text-slate-800" title={a.cliente}>{a.cliente}</p>, orden: (a) => a.cliente },
    { key: "base", label: "Monto", align: "right", render: (a) => <><p className="font-semibold text-slate-900">{dinero(a.base)}</p>{a.montoOriginal != null && Math.abs(a.montoOriginal - a.base) > 0.01 && <Sub>Emitida por {dinero(a.montoOriginal)}</Sub>}</>, orden: (a) => Math.max(a.base, a.montoOriginal ?? 0) },
    { key: "publicada", label: "¿Emitida?", render: (a) => a.fuePublicada ? <span className="text-xs font-semibold text-red-600">Sí, número usado</span> : <span className="text-xs text-slate-400">No (borrador)</span>, orden: (a) => (a.fuePublicada ? 1 : 0) },
    { key: "anulada", label: "Anulada", render: (a) => <><p className="text-slate-700">{fechaHora(a.anuladaEl)}</p><Sub>{a.anuladaPor || "Sin historial"}</Sub></>, orden: (a) => a.anuladaEl || "" },
    { key: "creada", label: "Creada por", render: (a) => <p className="text-slate-700">{a.creadoPor || "–"}</p>, orden: (a) => a.creadoPor },
    { key: "reemplazo", label: "Reemplazo", render: (a) => a.reemplazo ? <><p className="text-slate-700">{a.reemplazo.numero}</p><Sub>{fecha(a.reemplazo.fecha)} · {dinero(a.reemplazo.base)}</Sub></> : <span className="text-xs text-slate-400">–</span>, orden: (a) => (a.reemplazo ? 1 : 0) },
  ];
  return (
    <TablaDocs filas={filas} columnas={columnas} {...p} vacio="No hay documentos anulados en el período."
      buscar={(a) => `${a.numero} ${a.cliente} ${a.creadoPor} ${a.anuladaPor} ${a.reemplazo?.numero || ""}`}
      pie="Entran las anuladas con fecha en el período o anuladas dentro de él. Reemplazo = otra factura al mismo cliente por un monto parecido (±5%) entre 3 días antes y 15 después." />
  );
}

export function PestanaReabiertas({ filas, multiSede, ...p }: Comun & { filas: RE[] }) {
  const columnas: Columna<RE>[] = [
    { key: "numero", label: "Documento", render: (r) => <span className="block">{r.numero}<Sub>{r.tipo === "out_refund" ? "Nota de crédito" : "Factura"} · {fecha(r.fecha)}</Sub>{sede(multiSede, r.sede)}</span>, orden: (r) => r.fecha || "" },
    { key: "cliente", label: "Cliente", render: (r) => <p className="max-w-[200px] truncate text-slate-800" title={r.cliente}>{r.cliente}</p>, orden: (r) => r.cliente },
    { key: "monto", label: "Monto", align: "right", render: (r) => r.montoAntes != null && r.montoDespues != null
      ? <><p className={`font-semibold ${r.montoDespues < r.montoAntes ? "text-red-600" : "text-slate-900"}`}>{dinero(r.montoDespues)}</p><Sub>antes {dinero(r.montoAntes)}</Sub></>
      : <p className="text-slate-900">{dinero(r.base)}</p>, orden: (r) => (r.montoAntes != null && r.montoDespues != null ? r.montoDespues - r.montoAntes : 0) },
    { key: "reabierta", label: "Reabierta", render: (r) => <><p className="text-slate-700">{fechaHora(r.reaperturas[0].fecha)}</p><Sub>{r.reaperturas[0].usuario}{r.reaperturas.length > 1 ? ` · ${r.reaperturas.length} veces` : ""}{r.diasDesdeFactura != null ? ` · ${r.diasDesdeFactura} días después` : ""}</Sub></>, orden: (r) => r.reaperturas[0].fecha },
    { key: "estado", label: "Hoy", render: (r) => <><ChipEstado estado={r.estado} />{r.republicadaEl && r.estado === "posted" && <Sub>Republicada {fecha(r.republicadaEl)}</Sub>}</>, orden: (r) => r.estado },
    { key: "cambios", label: "Qué cambió", render: (r) => {
      const campos = [...new Set(r.cambios.map((c) => c.etiqueta))];
      if (r.lineasImpuesto) campos.push("Impuestos");
      return <p className="max-w-[200px] truncate text-xs text-slate-600" title={campos.join(", ")}>{campos.length ? campos.join(", ") : "Nada relevante"}</p>;
    } },
  ];
  return (
    <TablaDocs filas={filas} columnas={columnas} {...p} vacio="No hay documentos reabiertos en el período."
      buscar={(r) => `${r.numero} ${r.cliente} ${r.reaperturas.map((x) => x.usuario).join(" ")} ${r.creadoPor}`}
      pie="Reabierta = documento publicado que se devolvió a borrador (Restablecer a borrador) en el período. No cuentan las renumeraciones ni diferencias de centavos." />
  );
}
