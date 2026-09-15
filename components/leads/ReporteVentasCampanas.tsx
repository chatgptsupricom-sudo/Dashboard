"use client";

// Reporte de ventas cerradas por campaña de origen, en páginas imprimibles.
// Mismo lenguaje visual que ReporteCampanas (azul 600 sobre zinc) para que los
// dos reportes de adminleads se vean como uno solo al imprimirse juntos.
//
// Las gráficas usan tamaños fijos en vez de ResponsiveContainer: al imprimir no
// hay layout que medir y un contenedor responsive sale en blanco. Por lo mismo
// van con isAnimationActive={false}.

import { Download, Printer, X } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReporteVentasCampanas as Datos } from "@/lib/adminleads/ventasCampanas";

const nf = new Intl.NumberFormat("es-VE");
const cf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtNum = (v: any) => (v === null || v === undefined ? "—" : nf.format(Number(v)));
const fmtUsd = (v: any) =>
  v === null || v === undefined ? "—" : `$${cf.format(Number(v))}`;
const fmtPct = (v: any) =>
  v === null || v === undefined ? "—" : `${pf.format(Number(v))}%`;
const fmtFecha = (f: string) => {
  if (!f) return "—";
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};

const TH =
  "px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-zinc-500";
const TD = "px-3 py-2 text-[11px] text-zinc-700";

// Paleta del panel: azul dominante con acentos fríos. No es arcoíris a
// propósito — el color acá solo separa barras, no codifica una categoría.
const COLORES = [
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#0ea5e9",
  "#38bdf8",
  "#6366f1",
  "#818cf8",
  "#0d9488",
  "#14b8a6",
  "#64748b",
];

/** Recorta un nombre de campaña largo para que quepa en el eje. */
const corto = (s: string, max = 26) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;

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
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mt-1">{titulo}</h2>
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight text-blue-600 mt-1">{valor}</div>
      {nota && <div className="text-[9px] text-zinc-400 mt-0.5">{nota}</div>}
    </div>
  );
}

export default function ReporteVentasCampanas({
  data,
  hrefExcel,
}: {
  data: Datos;
  hrefExcel: string;
}) {
  const { periodo, resumen, ventas, totales } = data;

  // Solo campañas que efectivamente cerraron algo: una fila con monto 0 no
  // aporta nada a una gráfica de monto y empuja al resto contra el eje.
  const conVentas = resumen.filter((c) => c.ventasPeriodo > 0);
  const topMonto = conVentas.slice(0, 10).map((c) => ({
    nombre: corto(c.campana),
    completo: c.campana,
    monto: c.montoPeriodo,
  }));

  // Conversión: solo campañas con una base mínima de leads. Con 1 lead que
  // cerró el 100% no significa nada y tapa a las campañas con volumen real.
  const topConversion = [...resumen]
    .filter((c) => c.leadsIngresados >= 5 && c.conversionPct !== null)
    .sort((a, b) => (b.conversionPct ?? 0) - (a.conversionPct ?? 0))
    .slice(0, 10)
    .map((c) => ({
      nombre: corto(c.campana),
      completo: c.campana,
      conversion: c.conversionPct as number,
      leads: c.leadsIngresados,
    }));

  const porCanal = Object.values(
    conVentas.reduce<Record<string, { canal: string; monto: number; ventas: number }>>(
      (acc, c) => {
        const k = c.canal;
        acc[k] ??= { canal: k, monto: 0, ventas: 0 };
        acc[k].monto += c.montoPeriodo;
        acc[k].ventas += c.ventasPeriodo;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.monto - a.monto);

  const altura = (n: number) => Math.max(120, n * 30 + 30);

  // El detalle se parte en páginas para que al imprimir no se corte una fila
  // por la mitad ni quede una tabla de 300 filas en una sola hoja.
  const POR_PAGINA = 22;
  const paginasVentas: typeof ventas[] = [];
  for (let i = 0; i < ventas.length; i += POR_PAGINA) {
    paginasVentas.push(ventas.slice(i, i + POR_PAGINA));
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
      <div className="no-print flex items-center justify-between mb-6">
        <div className="text-xs text-zinc-500">
          {periodo.etiqueta} · {fmtNum(totales.ventas)} ventas cerradas
        </div>
        <div className="flex gap-2">
          <a
            href={hrefExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </a>
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
          Ventas cerradas
          <br />
          <span className="text-blue-600">por campaña de origen</span>
        </h1>
        <div className="text-[12px] text-zinc-600 mt-4">
          <span className="font-bold text-zinc-800">Período: </span>
          {periodo.etiqueta}
        </div>

        <div className="grid grid-cols-4 gap-3 mt-8">
          <Kpi label="Ventas cerradas" valor={fmtNum(totales.ventas)} />
          <Kpi label="Monto cerrado" valor={fmtUsd(totales.monto)} />
          <Kpi label="Ticket promedio" valor={fmtUsd(totales.ticketPromedio)} />
          <Kpi label="Campañas con venta" valor={fmtNum(totales.campanas)} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <Kpi
            label="Leads ingresados"
            valor={fmtNum(totales.leadsIngresados)}
            nota="Entraron en el período"
          />
          <Kpi
            label="Leads convertidos"
            valor={fmtNum(totales.leadsConvertidos)}
            nota="De los que entraron, cerraron"
          />
          <Kpi
            label="Conversión"
            valor={fmtPct(totales.conversionPct)}
            nota="Convertidos ÷ ingresados"
          />
        </div>

        <div className="mt-10 pt-4 border-t border-zinc-100 text-[9px] text-zinc-400 leading-relaxed">
          El período filtra las ventas por su fecha de cierre: una venta cerrada
          en el rango cuenta acá aunque el lead haya entrado antes. La conversión
          se mide sobre otra cohorte —los leads que <em>ingresaron</em> en el
          rango— porque mezclar ambas daría un porcentaje sin sentido. Incluye
          todos los canales; los leads sin campaña registrada aparecen como “Sin
          campaña”.
        </div>
      </section>

      {ventas.length === 0 ? (
        <Pagina etiqueta="Sin datos" titulo="No hay ventas cerradas en el período">
          <p className="text-[11px] text-zinc-500">
            Ningún lead registra cierre con fecha dentro del rango seleccionado.
            Probá con otro período.
          </p>
        </Pagina>
      ) : (
        <>
          {/* GRAFICAS */}
          <Pagina etiqueta="Panorama" titulo="De dónde vino el dinero">
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Monto cerrado por campaña · top {topMonto.length}
            </div>
            <BarChart
              width={900}
              height={altura(topMonto.length)}
              data={topMonto}
              layout="vertical"
              margin={{ top: 4, right: 90, bottom: 4, left: 8 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="nombre"
                width={210}
                tick={{ fontSize: 10, fill: "#52525b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v: any) => fmtUsd(v)}
                labelFormatter={(_l, p: any) => p?.[0]?.payload?.completo ?? ""}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="monto" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {topMonto.map((_, i) => (
                  <Cell key={i} fill={COLORES[i % COLORES.length]} />
                ))}
                <LabelList
                  dataKey="monto"
                  position="right"
                  formatter={(v: any) => fmtUsd(v)}
                  style={{ fontSize: 10, fill: "#3f3f46", fontWeight: 700 }}
                />
              </Bar>
            </BarChart>

            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mt-8 mb-2">
              Monto cerrado por canal
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className={TH}>Canal</th>
                  <th className={`${TH} text-right`}>Ventas</th>
                  <th className={`${TH} text-right`}>Monto</th>
                  <th className={`${TH} text-right`}>% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {porCanal.map((c) => (
                  <tr key={c.canal}>
                    <td className={`${TD} font-bold text-zinc-900`}>{c.canal}</td>
                    <td className={`${TD} text-right`}>{fmtNum(c.ventas)}</td>
                    <td className={`${TD} text-right font-bold`}>{fmtUsd(c.monto)}</td>
                    <td className={`${TD} text-right`}>
                      {totales.monto > 0
                        ? fmtPct((c.monto * 100) / totales.monto)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Pagina>

          {topConversion.length > 0 && (
            <Pagina etiqueta="Eficiencia" titulo="Qué campañas convierten mejor">
              <div className="text-[9px] text-zinc-400 mb-3">
                De los leads que ingresaron en el período, el porcentaje que
                terminó cerrando. Solo campañas con 5 o más leads ingresados: con
                menos, un solo cierre ya marca 100% y no compara nada.
              </div>
              <BarChart
                width={900}
                height={altura(topConversion.length)}
                data={topConversion}
                layout="vertical"
                margin={{ top: 4, right: 110, bottom: 4, left: 8 }}
              >
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  width={210}
                  tick={{ fontSize: 10, fill: "#52525b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: any) => fmtPct(v)}
                  labelFormatter={(_l, p: any) => p?.[0]?.payload?.completo ?? ""}
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                />
                <Bar
                  dataKey="conversion"
                  radius={[0, 4, 4, 0]}
                  fill="#0d9488"
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="conversion"
                    position="right"
                    formatter={(v: any) => fmtPct(v)}
                    style={{ fontSize: 10, fill: "#3f3f46", fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </Pagina>
          )}

          {/* RESUMEN POR CAMPANA */}
          <Pagina etiqueta="Resumen" titulo="Campaña por campaña">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className={TH}>Campaña</th>
                  <th className={TH}>Canal</th>
                  <th className={`${TH} text-right`}>Leads ing.</th>
                  <th className={`${TH} text-right`}>Convertidos</th>
                  <th className={`${TH} text-right`}>% Conv.</th>
                  <th className={`${TH} text-right`}>Ventas</th>
                  <th className={`${TH} text-right`}>Monto</th>
                  <th className={`${TH} text-right`}>Ticket prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {resumen.map((c) => (
                  <tr key={`${c.campana}|${c.canal}`}>
                    <td className={`${TD} font-bold text-zinc-900`}>{c.campana}</td>
                    <td className={TD}>{c.canal}</td>
                    <td className={`${TD} text-right`}>{fmtNum(c.leadsIngresados)}</td>
                    <td className={`${TD} text-right`}>{fmtNum(c.leadsConvertidos)}</td>
                    <td className={`${TD} text-right`}>{fmtPct(c.conversionPct)}</td>
                    <td className={`${TD} text-right`}>{fmtNum(c.ventasPeriodo)}</td>
                    <td className={`${TD} text-right font-bold text-blue-600`}>
                      {fmtUsd(c.montoPeriodo)}
                    </td>
                    <td className={`${TD} text-right`}>{fmtUsd(c.ticketPromedio)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-blue-600">
                  <td className={`${TD} font-bold text-zinc-900`} colSpan={2}>
                    TOTAL
                  </td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtNum(totales.leadsIngresados)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtNum(totales.leadsConvertidos)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtPct(totales.conversionPct)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtNum(totales.ventas)}
                  </td>
                  <td className={`${TD} text-right font-bold text-blue-600`}>
                    {fmtUsd(totales.monto)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtUsd(totales.ticketPromedio)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Pagina>

          {/* DETALLE */}
          {paginasVentas.map((pagina, i) => (
            <Pagina
              key={i}
              etiqueta={`Detalle ${i + 1} de ${paginasVentas.length}`}
              titulo="Ventas cerradas del período"
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className={TH}>Fecha</th>
                    <th className={TH}>Cliente</th>
                    <th className={TH}>Vendedor</th>
                    <th className={TH}>Campaña de origen</th>
                    <th className={TH}>Canal</th>
                    <th className={TH}>Factura</th>
                    <th className={`${TH} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pagina.map((v) => (
                    <tr key={v.id}>
                      <td className={`${TD} whitespace-nowrap`}>{fmtFecha(v.fecha)}</td>
                      <td className={`${TD} font-bold text-zinc-900`}>
                        {v.empresa || v.cliente || "—"}
                      </td>
                      <td className={TD}>{v.vendedor}</td>
                      <td className={TD}>{v.campana}</td>
                      <td className={TD}>{v.canal}</td>
                      <td className={TD}>{v.factura || "—"}</td>
                      <td className={`${TD} text-right font-bold text-blue-600`}>
                        {fmtUsd(v.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Pagina>
          ))}
        </>
      )}
    </div>
  );
}
