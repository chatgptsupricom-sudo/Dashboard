"use client";

// Reporte KPI por campana de Instagram / Facebook, en paginas imprimibles.
// Cada campana ocupa su propia pagina con los datos del anuncio y la economia
// derivada; cada metrica muestra la formula y los numeros sustituidos, que es
// lo que hace auditable el reporte.

import { Printer, X } from "lucide-react";

const nf = new Intl.NumberFormat("es-VE");
const cf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// Los costos unitarios bajan de un centavo (CPV, costo por alcance): con dos
// decimales se verian todos como $0,00.
const uf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const fmtNum = (v: any) =>
  v === null || v === undefined ? "—" : nf.format(Number(v));
const fmtUsd = (v: any) =>
  v === null || v === undefined ? "—" : `$${cf.format(Number(v))}`;

/** Formatea el resultado de una metrica segun su unidad. */
function valorMetrica(m: any): string {
  if (m.valor === null || m.valor === undefined) return "—";
  const v = Number(m.valor);
  if (m.unidad === "usd") return `$${uf.format(v)}`;
  if (m.unidad === "pct") return `${pf.format(v)}%`;
  if (m.unidad === "x") return `${pf.format(v)}x`;
  return nf.format(v);
}

const TH =
  "px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-zinc-500";
const TD = "px-3 py-2 text-[11px] text-zinc-700";

function Pagina({
  etiqueta,
  titulo,
  children,
}: {
  etiqueta: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="slide bg-white border border-zinc-200 rounded-2xl p-10 mb-6 print:mb-0 print:border-0 print:rounded-none print:p-6">
      <header className="mb-6 pb-3 border-b-2 border-blue-600">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">
          {etiqueta}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mt-1">
          {titulo}
        </h2>
      </header>
      {children}
    </section>
  );
}

/** Una metrica con su formula desarrollada y el resultado destacado. */
function Formula({ m }: { m: any }) {
  const sinDivisor = m.divisor === 0 || m.divisor === null;
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold text-zinc-900">{m.nombre}</span>
        <span
          className={`text-base font-bold tracking-tight ${
            sinDivisor ? "text-zinc-300" : "text-blue-600"
          }`}
        >
          {valorMetrica(m)}
        </span>
      </div>
      <div className="text-[9px] text-zinc-400 mt-1">{m.formula}</div>
      <div className="text-[10px] font-mono text-zinc-600 mt-1">
        {fmtNum(m.numerador)} ÷ {fmtNum(m.divisor)}
        {sinDivisor && (
          <span className="ml-2 font-sans text-zinc-400">
            — sin divisor, no se puede calcular
          </span>
        )}
      </div>
      {m.nota && (
        <div className="text-[9px] text-zinc-400 mt-1 italic">{m.nota}</div>
      )}
    </div>
  );
}

export default function ReporteCampanas({ data }: { data: any }) {
  const { periodo, detalle, consolidado } = data;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
      <div className="no-print flex items-center justify-between mb-6">
        <div className="text-xs text-zinc-500">
          {periodo.etiqueta} · {detalle.length} campañas con inversión
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir / Guardar PDF
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-bold hover:bg-zinc-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Cerrar
          </button>
        </div>
      </div>

      {/* PORTADA */}
      <section className="slide bg-white border border-zinc-200 rounded-2xl p-12 mb-6 print:mb-0 print:border-0 print:rounded-none">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-600">
          SUPRICOM
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mt-3 leading-tight">
          Reporte KPI de campañas
          <br />
          <span className="text-blue-600">Instagram · Facebook</span>
        </h1>
        <dl className="mt-8 space-y-2 text-[12px] text-zinc-600">
          <div>
            <span className="font-bold text-zinc-800">Período: </span>
            {periodo.etiqueta}
          </div>
          <div>
            <span className="font-bold text-zinc-800">Campañas analizadas: </span>
            {detalle.length}
          </div>
          <div>
            <span className="font-bold text-zinc-800">Inversión total: </span>
            {fmtUsd(consolidado.inversion)}
          </div>
          <div>
            <span className="font-bold text-zinc-800">Ventas generadas: </span>
            {fmtUsd(consolidado.ventas)}
          </div>
        </dl>
        <div className="mt-10 pt-4 border-t border-zinc-100 text-[9px] text-zinc-400">
          Datos de anuncio desde Meta Marketing API · Leads, facturas y ventas
          desde el CRM interno.
        </div>
      </section>

      {data.sin_campanas ? (
        <Pagina etiqueta="Sin datos" titulo="No hay campañas con inversión">
          <p className="text-[11px] text-zinc-500">
            En el período seleccionado ninguna campaña registra gasto en Meta Ads.
            Probá con un rango de fechas que incluya campañas activas.
          </p>
        </Pagina>
      ) : (
        detalle.map((c: any, i: number) => (
          <Pagina
            key={c.campana}
            etiqueta={`Campaña ${i + 1} de ${detalle.length}`}
            titulo={c.campana}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Detalles del anuncio
            </div>
            <table className="w-full mb-6">
              <tbody className="divide-y divide-zinc-100">
                {[
                  ["Objetivo de campaña", c.objetivo],
                  ["Reproducciones", fmtNum(c.anuncio.reproducciones)],
                  ["Alcance", `${fmtNum(c.anuncio.alcance)} personas`],
                  ["Impresiones", fmtNum(c.anuncio.impresiones)],
                  ["Frecuencia", `${c.anuncio.frecuencia} veces por persona`],
                  ["Clics", fmtNum(c.anuncio.clics)],
                  ["Importe gastado", fmtUsd(c.anuncio.inversion)],
                  ["Ventas generadas", fmtUsd(c.anuncio.ventas_generadas)],
                  ["Leads totales", fmtNum(c.anuncio.leads_totales)],
                  ["Leads calificados", fmtNum(c.anuncio.leads_calificados)],
                  ["Facturas emitidas", fmtNum(c.anuncio.facturas)],
                ].map(([k, v]: any) => (
                  <tr key={k}>
                    <td className={`${TD} text-zinc-500 w-1/2`}>{k}</td>
                    <td className={`${TD} font-bold text-zinc-900`}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Fórmulas aplicadas
            </div>
            <div className="grid grid-cols-2 gap-3">
              {c.metricas.map((m: any) => (
                <Formula key={m.nombre} m={m} />
              ))}
            </div>
          </Pagina>
        ))
      )}

      {/* CONSOLIDADO */}
      {!data.sin_campanas && (
        <Pagina etiqueta="Consolidado" titulo="Todas las campañas del período">
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              ["Inversión total", fmtUsd(consolidado.inversion)],
              ["Ventas generadas", fmtUsd(consolidado.ventas)],
              ["Leads totales", fmtNum(consolidado.leads_totales)],
              ["Facturas", fmtNum(consolidado.facturas)],
            ].map(([k, v]: any) => (
              <div key={k} className="rounded-xl border border-zinc-200 px-4 py-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                  {k}
                </div>
                <div className="text-lg font-bold tracking-tight text-zinc-900 mt-1">
                  {v}
                </div>
              </div>
            ))}
          </div>

          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Comparativa entre campañas
          </div>
          <table className="w-full mb-6">
            <thead className="bg-zinc-50">
              <tr>
                <th className={TH}>Campaña</th>
                <th className={`${TH} text-right`}>Inversión</th>
                <th className={`${TH} text-right`}>Ventas</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Cal.</th>
                <th className={`${TH} text-right`}>Facturas</th>
                <th className={`${TH} text-right`}>ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {detalle.map((c: any) => {
                const roas = c.metricas.find((m: any) => m.nombre === "ROAS");
                return (
                  <tr key={c.campana}>
                    <td className={`${TD} font-medium text-zinc-900`}>
                      {c.campana}
                    </td>
                    <td className={`${TD} text-right`}>
                      {fmtUsd(c.anuncio.inversion)}
                    </td>
                    <td className={`${TD} text-right font-semibold`}>
                      {fmtUsd(c.anuncio.ventas_generadas)}
                    </td>
                    <td className={`${TD} text-right`}>
                      {fmtNum(c.anuncio.leads_totales)}
                    </td>
                    <td className={`${TD} text-right text-emerald-600 font-bold`}>
                      {fmtNum(c.anuncio.leads_calificados)}
                    </td>
                    <td className={`${TD} text-right`}>
                      {fmtNum(c.anuncio.facturas)}
                    </td>
                    <td className={`${TD} text-right font-bold`}>
                      {valorMetrica(roas)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Métricas consolidadas
          </div>
          <div className="grid grid-cols-2 gap-3">
            {consolidado.metricas.map((m: any) => (
              <Formula key={m.nombre} m={m} />
            ))}
          </div>

          <div className="mt-6 rounded-xl bg-blue-50/70 border border-blue-100 px-4 py-3 text-[11px] leading-relaxed text-blue-900">
            El <span className="font-bold">ROAS</span> compara ventas contra
            inversión: mide facturación, no ganancia. El{" "}
            <span className="font-bold">
              ROAS sobre margen ({consolidado.margen_pct}%)
            </span>{" "}
            aplica el margen bruto a esas ventas, así que responde la pregunta
            real: si queda por encima de 1x, la pauta se paga sola con la ganancia
            que dejó. El margen es un supuesto configurable, no un dato medido.
          </div>

          <div className="mt-8 text-center text-[10px] text-zinc-400">
            SUPRICOM. Tu asesor de confianza.
            <div className="mt-1">
              Generado el {new Date().toLocaleDateString("es-VE")} · Meta Marketing
              API + CRM interno
            </div>
          </div>
        </Pagina>
      )}
    </div>
  );
}
