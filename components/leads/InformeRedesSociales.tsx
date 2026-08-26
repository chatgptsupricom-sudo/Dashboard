"use client";

// Presentacion del informe KPI mensual de redes sociales, en slides imprimibles.
// Recibe ya resuelto el payload de /api/adminleads/informe-mensual: separar la
// vista de la carga permite renderizarla con datos de ejemplo y mantiene la
// pagina reducida a fetch + estados.

import { Printer, X } from "lucide-react";

const nf = new Intl.NumberFormat("es-VE");
const cf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtNum = (v: any) =>
  v === null || v === undefined ? "—" : nf.format(Number(v));
const fmtUsd = (v: any) =>
  v === null || v === undefined ? "—" : `$${cf.format(Number(v))}`;
const pf = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmtPct = (v: any) =>
  v === null || v === undefined ? "—" : `${pf.format(Number(v))}%`;

function Variacion({ value }: { value: number | null }) {
  if (value === null || value === undefined)
    return <span className="text-zinc-400">—</span>;
  const positive = value >= 0;
  return (
    <span className={positive ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
      {positive ? "+" : ""}
      {fmtPct(value)}
    </span>
  );
}

function Slide({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="slide bg-white border border-zinc-200 rounded-2xl p-10 mb-6 print:mb-0 print:border-0 print:rounded-none print:p-6">
      <header className="mb-6 pb-3 border-b-2 border-blue-600">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">
          {numero}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mt-1">
          {titulo}
        </h2>
      </header>
      {children}
    </section>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-xl bg-blue-50/70 border border-blue-100 px-4 py-3 text-[11px] leading-relaxed text-blue-900">
      {children}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[11px] leading-relaxed text-amber-900">
      <span className="font-bold">Dato no disponible. </span>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  detalle,
}: {
  label: string;
  value: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
        {label}
      </div>
      <div className="text-lg font-bold tracking-tight text-zinc-900 mt-1">
        {value}
      </div>
      {detalle && <div className="text-[9px] text-zinc-400 mt-0.5">{detalle}</div>}
    </div>
  );
}

const TH = "px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-zinc-500";
const TD = "px-3 py-2 text-[11px] text-zinc-700";

export default function InformeRedesSociales({ data }: { data: any }) {

  const { periodo, comparativo, canal, general, instagram, leads, inversion } = data;
  const contenido = instagram.contenido;

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 print:px-0 print:py-0 print:max-w-none">
      {/* Barra de acciones: fuera del informe impreso */}
      <div className="no-print flex items-center justify-between mb-6">
        <div className="text-xs text-zinc-500">
          {periodo.etiqueta} · {periodo.desde} al {periodo.hasta}
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
          Informe KPI mensual de redes sociales
          <br />
          <span className="text-blue-600">{periodo.etiqueta}</span>
        </h1>
        <dl className="mt-8 space-y-2 text-[12px] text-zinc-600">
          <div>
            <span className="font-bold text-zinc-800">Canal analizado: </span>
            {canal.username ? `@${canal.username}` : "Instagram / Facebook"} —{" "}
            {canal.pais}
          </div>
          <div>
            <span className="font-bold text-zinc-800">Período: </span>
            {periodo.desde} al {periodo.hasta} ({periodo.dias} días)
          </div>
          <div>
            <span className="font-bold text-zinc-800">Comparado contra: </span>
            {comparativo.etiqueta}
            {!comparativo.con_datos && " (sin datos registrados)"}
          </div>
          <div>
            <span className="font-bold text-zinc-800">Inversión total en pauta: </span>
            {fmtUsd(inversion.total)}
          </div>
        </dl>
        <div className="mt-10 pt-4 border-t border-zinc-100 text-[9px] text-zinc-400">
          Fuentes: {data.fuentes.join(" · ")}
        </div>
      </section>

      {/* 1. RESULTADOS GENERALES */}
      <Slide numero="Slide 1" titulo="Resultados generales del canal">
        <table className="w-full">
          <thead className="bg-zinc-50">
            <tr>
              <th className={TH}>Métrica</th>
              <th className={`${TH} text-right`}>{comparativo.etiqueta}</th>
              <th className={`${TH} text-right`}>{periodo.etiqueta}</th>
              <th className={`${TH} text-right`}>Variación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {general.map((m: any) => (
              <tr key={m.metrica} className={m.disponible ? "" : "opacity-45"}>
                <td className={`${TD} font-medium text-zinc-900`}>{m.metrica}</td>
                <td className={`${TD} text-right`}>
                  {m.moneda ? fmtUsd(m.anterior) : fmtNum(m.anterior)}
                </td>
                <td className={`${TD} text-right font-bold text-zinc-900`}>
                  {m.moneda ? fmtUsd(m.actual) : fmtNum(m.actual)}
                </td>
                <td className={`${TD} text-right`}>
                  <Variacion value={m.variacion_pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!instagram.insights_disponibles && (
          <Aviso>
            No se pudieron leer de la API las métricas de Instagram Insights
            (visualizaciones, alcance, visitas al perfil, clics en enlace). La causa
            habitual es que la app de Meta no tenga el permiso{" "}
            <code className="font-mono">{instagram.permiso_requerido}</code>.
            {instagram.motivo && (
              <span className="block mt-1 text-[10px] opacity-80">
                Respuesta de la API: {instagram.motivo}
              </span>
            )}
          </Aviso>
        )}
      </Slide>

      {/* 2. PRODUCCION DE CONTENIDO */}
      <Slide numero="Slide 2" titulo="Producción de contenido y formatos">
        {instagram.contenido_disponible && contenido?.total_publicaciones > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <KpiCard
                label="Publicaciones"
                value={fmtNum(contenido.total_publicaciones)}
                detalle={
                  periodo.en_curso
                    ? `En ${periodo.dias_transcurridos} días (mes en curso)`
                    : `En ${periodo.dias} días`
                }
              />
              <KpiCard
                label="Ritmo"
                value={`${pf.format(contenido.posts_por_dia)}/día`}
                detalle={`Sobre ${periodo.dias_transcurridos ?? periodo.dias} días`}
              />
              <KpiCard
                label="Visualizaciones"
                value={fmtNum(contenido.visualizaciones_totales)}
                detalle="De estas publicaciones"
              />
              <KpiCard
                label="Interacciones"
                value={fmtNum(contenido.interacciones_totales)}
                detalle={
                  contenido.con_insights
                    ? "Incluye guardados y compartidos"
                    : "Likes + comentarios"
                }
              />
            </div>

            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className={TH}>Formato</th>
                  <th className={`${TH} text-right`}>Cantidad</th>
                  <th className={`${TH} text-right`}>% publicaciones</th>
                  {contenido.con_insights && (
                    <>
                      <th className={`${TH} text-right`}>Visualizaciones</th>
                      <th className={`${TH} text-right`}>% visualiz.</th>
                    </>
                  )}
                  <th className={`${TH} text-right`}>Interacciones</th>
                  <th className={`${TH} text-right`}>% interacciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {contenido.por_formato.map((f: any) => (
                  <tr key={f.formato}>
                    <td className={`${TD} font-medium text-zinc-900`}>{f.formato}</td>
                    <td className={`${TD} text-right`}>{fmtNum(f.cantidad)}</td>
                    <td className={`${TD} text-right`}>{fmtPct(f.porcentaje)}</td>
                    {contenido.con_insights && (
                      <>
                        <td className={`${TD} text-right`}>
                          {fmtNum(f.visualizaciones)}
                        </td>
                        <td className={`${TD} text-right`}>
                          {fmtPct(f.porcentaje_visualizaciones)}
                        </td>
                      </>
                    )}
                    <td className={`${TD} text-right`}>{fmtNum(f.interacciones)}</td>
                    <td className={`${TD} text-right font-bold`}>
                      {fmtPct(f.porcentaje_interacciones)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {contenido.interacciones_desglose && (
              <div className="mt-6">
                <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Desglose de interacciones
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ["Me gusta", contenido.interacciones_desglose.likes],
                    ["Comentarios", contenido.interacciones_desglose.comentarios],
                    ["Guardados", contenido.interacciones_desglose.guardados],
                    ["Compartidos", contenido.interacciones_desglose.compartidos],
                  ].map(([label, valor]: any) => (
                    <KpiCard
                      key={label}
                      label={label}
                      value={fmtNum(valor)}
                      detalle={
                        contenido.interacciones_totales > 0
                          ? `${fmtPct((valor / contenido.interacciones_totales) * 100)} del total`
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <Nota>
              {contenido.con_insights ? (
                <>
                  Visualizaciones e interacciones salen de los Insights de cada
                  publicación.
                  <span className="block mt-2">
                    <span className="font-bold">Las historias no figuran acá.</span>{" "}
                    La Graph API sólo devuelve las historias activas de las últimas
                    24 horas, así que no hay forma de recuperar las de un mes ya
                    cerrado. Sus visualizaciones sí están incluidas en el total de
                    la cuenta del Slide 1.
                  </span>
                </>
              ) : (
                <>
                  Las historias no aparecen en este cuadro: la Graph API sólo expone
                  feed y reels en el listado de publicaciones. Las interacciones son
                  likes + comentarios públicos, porque no se pudieron leer los Insights
                  por publicación.
                </>
              )}
            </Nota>
          </>
        ) : (
          <Aviso>
            No se pudieron leer las publicaciones del período.
            {instagram.contenido_motivo && ` ${instagram.contenido_motivo}`}
          </Aviso>
        )}
      </Slide>

      {/* 3. COMUNIDAD */}
      <Slide numero="Slide 3" titulo="Crecimiento de comunidad y audiencia">
        <div className="grid grid-cols-3 gap-3">
          <KpiCard
            label="Seguidores totales"
            value={fmtNum(canal.seguidores)}
            detalle={canal.username ? `@${canal.username}` : undefined}
          />
          <KpiCard
            label="Seguidores ganados"
            value={
              canal.seguidores_ganados !== null
                ? `${canal.seguidores_ganados >= 0 ? "+" : ""}${fmtNum(canal.seguidores_ganados)}`
                : "—"
            }
            detalle={
              canal.seguidores_ganados === null
                ? "Sin dato para este período"
                : canal.seguidores_ganados_origen === "api"
                  ? "Nuevos seguidores del período"
                  : `vs. ${comparativo.etiqueta}`
            }
          />
          <KpiCard
            label="Publicaciones históricas"
            value={fmtNum(canal.publicaciones_totales)}
            detalle="Total de la cuenta"
          />
        </div>

        {instagram.demografia ? (
          <div className="grid grid-cols-3 gap-6 mt-6">
            {(["gender", "age", "city"] as const).map((k) => {
              const titulos = { gender: "Género", age: "Edad", city: "Ciudades" };
              const filas = instagram.demografia[k] || [];
              const total = filas.reduce((s: number, r: any) => s + r.value, 0);
              return (
                <div key={k}>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    {titulos[k]}
                  </div>
                  <table className="w-full">
                    <tbody className="divide-y divide-zinc-100">
                      {filas.slice(0, 5).map((r: any) => (
                        <tr key={r.label}>
                          <td className={TD}>{r.label}</td>
                          <td className={`${TD} text-right font-bold`}>
                            {total > 0 ? fmtPct((r.value / total) * 100) : fmtNum(r.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : (
          <Aviso>
            No se pudo leer la demografía de seguidores (género, edad, ciudades).
            Requiere el permiso{" "}
            <code className="font-mono">{instagram.permiso_requerido}</code>.
            {instagram.demografia_motivo && (
              <span className="block mt-1 text-[10px] opacity-80">
                Respuesta de la API: {instagram.demografia_motivo}
              </span>
            )}
            {canal.seguidores === null &&
              " Tampoco se pudo leer el total de seguidores de la cuenta."}
          </Aviso>
        )}
      </Slide>

      {/* 4. LEADS Y CALIDAD */}
      <Slide numero="Slide 4" titulo="Leads y calidad · KPI central">
        <div className="grid grid-cols-5 gap-3 mb-6">
          <KpiCard label="Leads del canal" value={fmtNum(leads.total)} detalle="Origen Meta" />
          <KpiCard
            label="Leads concretados"
            value={fmtNum(leads.ventas)}
            detalle={`Ventas cerradas en el período`}
          />
          <KpiCard
            label="Conversión del mes"
            value={fmtPct(leads.tasa_conversion)}
            detalle={`${fmtNum(leads.ventas_del_mes)} de ${fmtNum(leads.total)} leads que entraron`}
          />
          <KpiCard
            label="Tasa de calificación"
            value={leads.tasa_calificacion !== null ? fmtPct(leads.tasa_calificacion) : "—"}
            detalle={
              leads.tasa_calificacion !== null
                ? `${fmtNum(leads.calificados)} cal. / ${fmtNum(leads.no_calificados)} no cal.`
                : "Sin conversaciones registradas"
            }
          />
          <KpiCard
            label="Ticket promedio"
            value={fmtUsd(leads.ticket_promedio)}
            detalle={`${fmtNum(leads.ventas)} ventas`}
          />
        </div>

        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
          Segmentación por vendedor
        </div>
        {leads.por_vendedor.length > 0 ? (
          <table className="w-full">
            <thead className="bg-zinc-50">
              <tr>
                <th className={TH}>Vendedor</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Activos</th>
                <th className={`${TH} text-right`}>Ventas</th>
                <th className={`${TH} text-right`}>Perdidos</th>
                <th className={`${TH} text-right`}>Recaudo</th>
                <th className={`${TH} text-right`}>Tasa cierre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {leads.por_vendedor.map((v: any) => (
                <tr key={v.vendedor}>
                  <td className={`${TD} font-medium text-zinc-900`}>{v.vendedor}</td>
                  <td className={`${TD} text-right`}>{fmtNum(v.total)}</td>
                  <td className={`${TD} text-right`}>{fmtNum(v.activos)}</td>
                  <td className={`${TD} text-right font-bold text-emerald-600`}>
                    {fmtNum(v.ventas)}
                  </td>
                  <td className={`${TD} text-right text-red-500`}>{fmtNum(v.perdidos)}</td>
                  <td className={`${TD} text-right font-semibold`}>{fmtUsd(v.recaudo)}</td>
                  <td className={`${TD} text-right`}>{fmtPct(v.tasa_cierre)}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-bold">
                <td className={`${TD} font-bold`}>TOTAL</td>
                <td className={`${TD} text-right font-bold`}>
                  {fmtNum(leads.por_vendedor.reduce((s: number, v: any) => s + v.total, 0))}
                </td>
                <td className={`${TD} text-right font-bold`}>
                  {fmtNum(leads.por_vendedor.reduce((s: number, v: any) => s + v.activos, 0))}
                </td>
                <td className={`${TD} text-right font-bold`}>{fmtNum(leads.ventas)}</td>
                <td className={`${TD} text-right font-bold`}>
                  {fmtNum(leads.por_vendedor.reduce((s: number, v: any) => s + v.perdidos, 0))}
                </td>
                <td className={`${TD} text-right font-bold`}>{fmtUsd(leads.recaudo)}</td>
                <td className={`${TD} text-right font-bold`}>
                  {fmtPct(leads.tasa_conversion)}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] italic text-zinc-400">
            Sin leads del canal Meta en el período.
          </p>
        )}

      </Slide>

      {/* 5. INVERSION EN PAUTA */}
      <Slide numero="Slide 5" titulo="Inversión en pauta · Meta Ads">
        <div className="grid grid-cols-5 gap-3 mb-6">
          <KpiCard
            label="Inversión"
            value={fmtUsd(inversion.total)}
            detalle={
              inversion.variacion_pct !== null
                ? `${inversion.variacion_pct >= 0 ? "+" : ""}${fmtPct(inversion.variacion_pct)} vs. anterior`
                : undefined
            }
          />
          <KpiCard label="Costo por lead" value={fmtUsd(inversion.costo_por_lead)} />
          <KpiCard
            label="CPL calificado"
            value={fmtUsd(inversion.costo_por_lead_calificado)}
          />
          <KpiCard label="Costo por venta" value={fmtUsd(inversion.costo_por_venta)} />
          <KpiCard
            label="ROAS"
            value={inversion.roas > 0 ? `${pf.format(inversion.roas)}x` : "—"}
            detalle={`ROI ${fmtPct(inversion.roi_pct)}`}
          />
        </div>

        {data.campanas.length > 0 ? (
          <table className="w-full">
            <thead className="bg-zinc-50">
              <tr>
                <th className={TH}>Campaña</th>
                <th className={`${TH} text-right`}>Inversión</th>
                <th className={`${TH} text-right`}>Impres.</th>
                <th className={`${TH} text-right`}>Clics</th>
                <th className={`${TH} text-right`}>Leads</th>
                <th className={`${TH} text-right`}>Cal.</th>
                <th className={`${TH} text-right`}>Ventas</th>
                <th className={`${TH} text-right`}>Recaudo</th>
                <th className={`${TH} text-right`}>CPL cal.</th>
                <th className={`${TH} text-right`}>ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.campanas.map((c: any) => (
                <tr key={c.campaign_name}>
                  <td className={`${TD} font-medium text-zinc-900 max-w-[220px]`}>
                    {c.campaign_name}
                  </td>
                  <td className={`${TD} text-right font-semibold`}>{fmtUsd(c.spend_usd)}</td>
                  <td className={`${TD} text-right`}>{fmtNum(c.impressions)}</td>
                  <td className={`${TD} text-right`}>{fmtNum(c.clicks)}</td>
                  <td className={`${TD} text-right`}>{fmtNum(c.total_leads)}</td>
                  <td className={`${TD} text-right text-emerald-600 font-bold`}>
                    {fmtNum(c.calificados)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>{fmtNum(c.ventas_cerradas)}</td>
                  <td className={`${TD} text-right font-semibold`}>{fmtUsd(c.recaudo_usd)}</td>
                  <td className={`${TD} text-right`}>
                    {c.costo_por_lead_calificado > 0
                      ? fmtUsd(c.costo_por_lead_calificado)
                      : "—"}
                  </td>
                  <td
                    className={`${TD} text-right font-bold ${
                      c.roi > 0 ? "text-emerald-600" : c.roi < 0 ? "text-red-500" : ""
                    }`}
                  >
                    {fmtPct(c.roi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] italic text-zinc-400">
            Sin campañas con actividad en el período.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 mt-6">
          {[
            {
              titulo: "Mayor recaudo",
              c: data.destacadas.mayor_recaudo,
              detalle: (c: any) => `${fmtUsd(c.recaudo_usd)} · ROI ${fmtPct(c.roi)}`,
            },
            {
              titulo: "Mejor calificación",
              c: data.destacadas.mejor_calificacion,
              detalle: (c: any) =>
                `${fmtPct((c.calificados / Math.max(1, c.calificados + c.no_calificados)) * 100)} calificados (${c.calificados}/${c.calificados + c.no_calificados})`,
            },
            {
              titulo: "Mejor costo de captación",
              c: data.destacadas.mejor_cpl,
              detalle: (c: any) => `CPL calificado ${fmtUsd(c.costo_por_lead_calificado)}`,
            },
          ].map(({ titulo, c, detalle }) => (
            <div
              key={titulo}
              className="rounded-xl border border-zinc-200 px-4 py-3 bg-zinc-50/50"
            >
              <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600">
                {titulo}
              </div>
              {c ? (
                <>
                  <div className="text-[11px] font-bold text-zinc-900 mt-1 leading-snug">
                    {c.campaign_name}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{detalle(c)}</div>
                </>
              ) : (
                <div className="text-[11px] italic text-zinc-400 mt-1">Sin datos</div>
              )}
            </div>
          ))}
        </div>
      </Slide>

      {/* 6. PIPELINE Y VENTAS */}
      <Slide numero="Slide 6" titulo="Pipeline activo y ventas cerradas">
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Pipeline activo"
            value={fmtNum(data.pipeline.total_activos)}
            detalle="Leads del período aún abiertos"
          />
          <KpiCard label="Ventas cerradas" value={fmtNum(data.pipeline.total_ventas)} />
          <KpiCard label="Facturación" value={fmtUsd(data.pipeline.total_recaudo)} />
          <KpiCard
            label="Concentración top 2"
            value={fmtPct(data.pipeline.concentracion_top2_pct)}
            detalle="Del total facturado"
          />
        </div>

        {data.pipeline.activo && data.pipeline.activo.length > 0 && (
          <div className="mb-6">
            <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Pipeline activo por etapa
            </div>
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className={TH}>Etapa</th>
                  <th className={`${TH} text-right`}>Leads</th>
                  <th className={`${TH} text-right`}>% del pipeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.pipeline.activo.map((e: any) => (
                  <tr key={e.etapa}>
                    <td className={`${TD} font-medium text-zinc-900`}>{e.etapa}</td>
                    <td className={`${TD} text-right`}>{fmtNum(e.leads)}</td>
                    <td className={`${TD} text-right`}>
                      {data.pipeline.total_activos > 0
                        ? fmtPct((e.leads / data.pipeline.total_activos) * 100)
                        : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-zinc-50 font-bold">
                  <td className={`${TD} font-bold`}>TOTAL ABIERTOS</td>
                  <td className={`${TD} text-right font-bold`}>
                    {fmtNum(data.pipeline.total_activos)}
                  </td>
                  <td className={`${TD} text-right font-bold`}>100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
          Ventas cerradas en el período
        </div>
        {data.pipeline.top_clientes.length > 0 ? (
          <table className="w-full">
            <thead className="bg-zinc-50">
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Cliente</th>
                <th className={TH}>Vendedor</th>
                <th className={`${TH} text-right`}>Monto</th>
                <th className={`${TH} text-right`}>% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.pipeline.top_clientes.map((c: any, i: number) => (
                <tr key={`${c.cliente}-${i}`}>
                  <td className={`${TD} text-zinc-400`}>#{i + 1}</td>
                  <td className={`${TD} font-medium text-zinc-900`}>{c.cliente}</td>
                  <td className={TD}>{c.vendedor}</td>
                  <td className={`${TD} text-right font-bold`}>{fmtUsd(c.monto)}</td>
                  <td className={`${TD} text-right`}>
                    {data.pipeline.total_recaudo > 0
                      ? fmtPct((c.monto / data.pipeline.total_recaudo) * 100)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[11px] italic text-zinc-400">
            Sin ventas cerradas en el período.
          </p>
        )}
      </Slide>

      {/* 7. DIAGNOSTICO */}
      <Slide numero="Slide 7" titulo="Diagnóstico estratégico del período">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-3">
              Logros del período
            </div>
            <ul className="space-y-2">
              {data.diagnostico.logros.length > 0 ? (
                data.diagnostico.logros.map((l: string, i: number) => (
                  <li key={i} className="text-[11px] text-zinc-700 leading-relaxed flex gap-2">
                    <span className="text-emerald-500 font-bold">•</span>
                    <span>{l}</span>
                  </li>
                ))
              ) : (
                <li className="text-[11px] italic text-zinc-400">
                  Sin métricas suficientes para destacar logros.
                </li>
              )}
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-3">
              Puntos de atención
            </div>
            <ul className="space-y-2">
              {data.diagnostico.atencion.length > 0 ? (
                data.diagnostico.atencion.map((a: string, i: number) => (
                  <li key={i} className="text-[11px] text-zinc-700 leading-relaxed flex gap-2">
                    <span className="text-amber-500 font-bold">⚠</span>
                    <span>{a}</span>
                  </li>
                ))
              ) : (
                <li className="text-[11px] italic text-zinc-400">
                  Sin alertas en el período.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-zinc-100">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Resumen ejecutivo
          </div>
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Leads" value={fmtNum(leads.total)} />
            <KpiCard label="Ventas" value={fmtNum(leads.ventas)} />
            <KpiCard label="Facturación" value={fmtUsd(leads.recaudo)} />
            <KpiCard
              label="ROAS"
              value={inversion.roas > 0 ? `${pf.format(inversion.roas)}x` : "—"}
            />
          </div>
        </div>

        {/* Metodologia al pie: disponible para quien cuestione un numero, sin
            competirle atencion a los KPIs de los slides anteriores. */}
        <div className="mt-8 pt-5 border-t border-zinc-100">
          <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Notas metodológicas
          </div>
          <ul className="space-y-1 text-[9px] leading-relaxed text-zinc-400">
            <li>
              <span className="font-bold">Alcance:</span> sólo leads de canal{" "}
              {(leads.canales_meta || []).join(", ")}. El tab General del panel no
              filtra por canal, por eso su total es mayor.
            </li>
            <li>
              <span className="font-bold">Fechas:</span> un lead cuenta por su fecha
              de entrada; una venta, por su fecha de venta. Por eso una venta de este
              mes sobre un lead del mes pasado suma a las ventas pero no a los leads.
            </li>
            <li>
              <span className="font-bold">Conversión del mes:</span> de los leads que
              entraron en el período, cuántos terminaron en venta. No coincide con
              Leads concretados, que son las ventas cerradas en el período.
            </li>
            <li>
              <span className="font-bold">Calificación:</span> se registra por campaña
              en la tabla de conversaciones, que no guarda vendedor; por eso la tasa
              es global y la tabla por vendedor muestra tasa de cierre.
            </li>
          </ul>
        </div>

        <div className="mt-8 text-center text-[10px] text-zinc-400">
          SUPRICOM. Tu asesor de confianza.
          <div className="mt-1">
            Informe generado el {new Date().toLocaleDateString("es-VE")} ·{" "}
            {data.fuentes.join(" · ")}
          </div>
        </div>
      </Slide>
    </div>
  );
}

