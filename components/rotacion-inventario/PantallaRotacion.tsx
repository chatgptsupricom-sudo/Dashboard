"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HandCoins, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Aviso, EstadoCarga, Pestanas } from "@/components/administracion/comunes";
import { TablaReporte, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import { Avance, BarraColores, InsigniaColor, InsigniaEstado, Luz, num, pedir, usd } from "@/components/rotacion-inventario/comunes";
import FichaDialog from "@/components/rotacion-inventario/FichaDialog";
import Solicitudes from "@/components/rotacion-inventario/Solicitudes";
import Contactos from "@/components/rotacion-inventario/Contactos";
import AvanceRojo, { agruparPlanes } from "@/components/rotacion-inventario/AvanceRojo";
import {
  COLOR,
  COLORES,
  HORIZONTE_DIAS,
  INICIO_SEGUIMIENTO,
  LIMITE_AMARILLO,
  LIMITE_VERDE,
  MESES_PLAN,
  cuotaRojo,
  etiquetaMes,
  folio,
  nombreSede,
  porcentaje,
  resumir,
  sumarResumenes,
  type Color,
  type FichaProducto,
  type GrupoSemaforo,
  type PlanRojo,
  type ResumenPlanRojo,
  type RespuestaRotacion,
} from "@/lib/rotacion-inventario/tipos";

/**
 * Rotación de inventario (lib/rotacion-inventario): semáforo por días sin
 * venta, la ficha de cada producto con su plan de 90 días y las solicitudes de
 * apoyo a las marcas de lo que pasa a rojo.
 */

type Pestana = "semaforo" | "productos" | "solicitudes" | "contactos" | "reglas";
type Agrupar = "sede" | "marca" | "categoria";

type Fila = FichaProducto & {
  sede: string;
  colorTexto: string;
  necesaria: number;
  ritmo: number;
  metaSemanal: number;
  vendSemana: number;
  avSemana: number | null;
  metaMensual: number;
  vendMes: number;
  avMes: number | null;
  avPlan: number | null;
  inicioPlan: string;
  solicitudTxt: string;
};

const ORDEN_COLOR: Record<Color, number> = { rojo: 0, amarillo: 1, verde: 2 };

export default function PantallaRotacion() {
  const [sede, setSede] = useState<string>("");
  const [datos, setDatos] = useState<RespuestaRotacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("semaforo");
  const [agrupar, setAgrupar] = useState<Agrupar>("marca");
  const [colores, setColores] = useState<Color[]>([]);
  const [grupo, setGrupo] = useState<{ tipo: Agrupar; clave: string } | null>(null);
  const [detalle, setDetalle] = useState<{ companyId: number; productoId: number } | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = sede ? `?sede=${sede}` : "";
      const j = await pedir<RespuestaRotacion>(`/api/rotacion-inventario${qs}`);
      setDatos(j);
      if (!sede) setSede(j.sedes.length > 1 ? "todas" : String(j.sedes[0]));
    } catch (e: any) {
      setError({ mensaje: e.message, odooCaido: !!e.odooCaido });
    } finally {
      setCargando(false);
    }
  }, [sede]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const multiSede = (datos?.sedes.length ?? 1) > 1;

  const filas: Fila[] = useMemo(
    () =>
      (datos?.fichas ?? [])
        .map((f) => ({
          ...f,
          sede: nombreSede(f.companyId),
          colorTexto: COLOR[f.color].label,
          necesaria: f.plan.necesariaDiaria,
          ritmo: f.plan.ritmoActual,
          metaSemanal: f.plan.metaSemanal,
          vendSemana: f.plan.vendidasSemana,
          avSemana: f.plan.avanceSemana,
          metaMensual: f.plan.metaMensual,
          vendMes: f.plan.vendidasMes,
          avMes: f.plan.avanceMes,
          avPlan: f.plan.avancePlan,
          inicioPlan: f.plan.inicio,
          solicitudTxt: f.solicitud ? folio(f.solicitud.id) : "",
        }))
        .sort((a, b) => ORDEN_COLOR[a.color] - ORDEN_COLOR[b.color] || b.valorCosto - a.valorCosto),
    [datos],
  );

  const claveDe = (tipo: Agrupar) => (f: FichaProducto) =>
    tipo === "sede" ? nombreSede(f.companyId) : tipo === "marca" ? f.marca : f.categoria;

  const total = useMemo(() => resumir(filas, () => "Total")[0], [filas]);
  const grupos = useMemo(() => resumir(filas, claveDe(agrupar)), [filas, agrupar]);
  const planesRojo = useMemo(() => datos?.planesRojo ?? [], [datos]);
  const cuotasGrupo = useMemo(() => agruparPlanes(planesRojo, agrupar), [planesRojo, agrupar]);

  const visibles = useMemo(
    () =>
      filas.filter(
        (f) => (!colores.length || colores.includes(f.color)) && (!grupo || claveDe(grupo.tipo)(f) === grupo.clave),
      ),
    [filas, colores, grupo],
  );

  const alternarColor = (c: Color) => setColores((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));
  const llave = (f: FichaProducto) => `${f.companyId}:${f.productoId}`;
  const alternarSeleccion = (f: FichaProducto) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(llave(f))) n.delete(llave(f));
      else n.add(llave(f));
      return n;
    });

  const abrirGrupo = (clave: string) => {
    setGrupo({ tipo: agrupar, clave });
    setPestana("productos");
  };

  const pedirApoyo = async () => {
    const porSede = new Map<number, number[]>();
    for (const k of seleccion) {
      const [c, p] = k.split(":").map(Number);
      porSede.set(c, [...(porSede.get(c) ?? []), p]);
    }
    try {
      const ids: number[] = [];
      for (const [s, productos] of porSede) {
        const r = await pedir<{ solicitudes: number[] }>("/api/rotacion-inventario/solicitudes", {
          method: "POST",
          body: JSON.stringify({ sede: s, productos }),
        });
        ids.push(...r.solicitudes);
      }
      setSeleccion(new Set());
      setMensaje(`Quedaron en ${ids.length === 1 ? "la solicitud" : "las solicitudes"} ${ids.map(folio).join(", ")} (Por enviar).`);
      cargar();
    } catch (e: any) {
      setMensaje(e.message);
    }
  };

  const columnas: Columna<Fila>[] = [
    ...(datos?.puedeGestionarSolicitudes
      ? [
          {
            clave: "productoId",
            titulo: "",
            soloPantalla: true,
            mostrar: (f: Fila) => (
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={seleccion.has(llave(f))}
                onChange={() => alternarSeleccion(f)}
                aria-label="Elegir para pedir apoyo a la marca"
              />
            ),
          } as Columna<Fila>,
        ]
      : []),
    { clave: "colorTexto", titulo: "Semáforo", mostrar: (f) => <InsigniaColor color={f.color} /> },
    { clave: "codigo", titulo: "Código" },
    {
      clave: "nombre",
      titulo: "Producto",
      ancho: "min-w-[220px]",
      mostrar: (f) => (
        <button
          onClick={() => setDetalle({ companyId: f.companyId, productoId: f.productoId })}
          className="text-left text-blue-700 hover:underline font-medium"
        >
          {f.nombre}
        </button>
      ),
    },
    { clave: "marca", titulo: "Marca" },
    { clave: "categoria", titulo: "Categoría" },
    ...(multiSede ? [{ clave: "sede", titulo: "Sede" } as Columna<Fila>] : []),
    { clave: "disponible", titulo: "Disponibles", tipo: "numero", sumar: true },
    { clave: "costo", titulo: "Costo unit.", tipo: "dinero" },
    { clave: "valorCosto", titulo: "Valor a costo", tipo: "dinero", sumar: true },
    { clave: "diasSinVenta", titulo: "Días sin venta", tipo: "numero" },
    { clave: "ultimaVenta", titulo: "Última venta", tipo: "fecha" },
    { clave: "vendidasSeguimiento", titulo: "Vendidas desde abr", tipo: "numero", sumar: true },
    { clave: "necesaria", titulo: `Venta diaria p/ salir en ${HORIZONTE_DIAS} d`, tipo: "numero" },
    { clave: "ritmo", titulo: "Ritmo actual (30 d)", tipo: "numero" },
    {
      clave: "vendSemana",
      titulo: "Semana: vendidas / meta",
      tipo: "numero",
      mostrar: (f) => (
        <span className="whitespace-nowrap tabular-nums">
          {num(f.vendSemana)} / {num(f.metaSemanal, 1)}
        </span>
      ),
    },
    { clave: "metaSemanal", titulo: "Meta semanal", tipo: "numero", soloExcel: true },
    { clave: "avSemana", titulo: "Avance semana", tipo: "porcentaje", mostrar: (f) => <Avance valor={f.avSemana} /> },
    {
      clave: "vendMes",
      titulo: "Mes: vendidas / meta",
      tipo: "numero",
      mostrar: (f) => (
        <span className="whitespace-nowrap tabular-nums">
          {num(f.vendMes)} / {num(f.metaMensual, 1)}
        </span>
      ),
    },
    { clave: "metaMensual", titulo: "Meta mensual", tipo: "numero", soloExcel: true },
    { clave: "avMes", titulo: "Avance mes", tipo: "porcentaje", mostrar: (f) => <Avance valor={f.avMes} /> },
    { clave: "avPlan", titulo: "Avance del plan", tipo: "porcentaje", mostrar: (f) => <Avance valor={f.avPlan} /> },
    { clave: "inicioPlan", titulo: "Plan desde", tipo: "fecha" },
    {
      clave: "solicitudTxt",
      titulo: "Solicitud a la marca",
      mostrar: (f) =>
        f.solicitud ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-xs font-medium">{folio(f.solicitud.id)}</span>
            <InsigniaEstado estado={f.solicitud.estado} />
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
  ];

  const opcionesSede = datos?.eligeSede
    ? [
        ...(datos.sedesPermitidas.length > 1 ? [{ value: "todas", label: "Todas" }] : []),
        ...datos.sedesPermitidas.map((s) => ({ value: String(s), label: nombreSede(s) })),
      ]
    : [];

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="flex flex-col gap-1 rounded-lg bg-slate-800 p-1.5" aria-hidden>
              <Luz color="rojo" />
              <Luz color="amarillo" />
              <Luz color="verde" />
            </span>
            Rotación de inventario
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Días sin venta de cada producto con stock, plan para salir de él en {HORIZONTE_DIAS} días y apoyo de las marcas para lo
            que pasa a rojo. Seguimiento desde el {INICIO_SEGUIMIENTO.split("-").reverse().join("/")}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {opcionesSede.length > 0 && (
            <div className="flex rounded-lg border bg-white p-0.5">
              {opcionesSede.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setSede(o.value)}
                  className={`px-3 py-1.5 text-sm rounded-md ${sede === o.value ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {!datos?.eligeSede && datos && <span className="text-sm text-slate-600">{datos.sedes.map(nombreSede).join(", ")}</span>}
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {datos?.avisos.map((a) => (
        <Aviso key={a}>{a}</Aviso>
      ))}

      <Pestanas<Pestana>
        valor={pestana}
        onChange={setPestana}
        opciones={[
          { value: "semaforo", label: "Semáforo" },
          { value: "productos", label: "Productos", contador: datos ? filas.length : undefined },
          { value: "solicitudes", label: "Solicitudes a marcas" },
          { value: "contactos", label: "Contactos de marcas" },
          { value: "reglas", label: "Cómo se calcula" },
        ]}
      />

      {(pestana === "semaforo" || pestana === "productos") && <EstadoCarga cargando={cargando && !datos} error={error} />}

      {pestana === "semaforo" && datos && !total && (
        <Aviso tono="azul">No hay productos con unidades disponibles {datos.sedes.length > 1 ? "en estas sedes" : "en la sede"}.</Aviso>
      )}

      {pestana === "semaforo" && datos && total && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {COLORES.map((c) => {
              const celda = total.porColor[c];
              return (
                <button
                  key={c}
                  onClick={() => {
                    setColores([c]);
                    setGrupo(null);
                    setPestana("productos");
                  }}
                  className={`text-left rounded-xl border p-4 transition hover:shadow-sm ${COLOR[c].fondo}`}
                >
                  <p className={`text-xs font-medium flex items-center gap-2 ${COLOR[c].texto}`}>
                    <Luz color={c} /> {COLOR[c].label} · {COLOR[c].rango}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">{usd(celda.valor)}</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {num(celda.referencias)} productos · {num(celda.unidades)} unidades ·{" "}
                    {total.total.valor > 0 ? ((celda.valor / total.total.valor) * 100).toFixed(1) : "0"}% del valor
                  </p>
                </button>
              );
            })}
            <TarjetaCuotaRojo rojo={total.porColor.rojo} planes={planesRojo} />
          </div>
          <AvanceRojo planes={planesRojo} fichas={datos.fichas} multiSede={multiSede} />
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Valor a costo del inventario disponible</span>
                <span className="font-bold">{usd(total.total.valor)}</span>
              </div>
              <BarraColores porColor={total.porColor} alto={14} />
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardContent className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b">
                <p className="font-medium text-sm">Valor a costo por color</p>
                <div className="flex rounded-lg border p-0.5 text-sm">
                  {(["sede", "marca", "categoria"] as Agrupar[])
                    .filter((g) => g !== "sede" || multiSede)
                    .map((g) => (
                      <button
                        key={g}
                        onClick={() => {
                          setAgrupar(g);
                          setVerTodos(false);
                        }}
                        className={`px-3 py-1 rounded-md ${agrupar === g ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                      >
                        {g === "sede" ? "Por sede" : g === "marca" ? "Por marca" : "Por categoría"}
                      </button>
                    ))}
                </div>
              </div>
              <TablaGrupos
                grupos={verTodos ? grupos : grupos.slice(0, 30)}
                titulo={agrupar}
                abrir={abrirGrupo}
                cuotas={planesRojo.length ? cuotasGrupo : null}
              />
              {grupos.length > 30 && (
                <div className="p-3 border-t text-center">
                  <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
                    {verTodos ? "Ver los 30 con más valor en rojo" : `Ver los ${grupos.length}`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {pestana === "productos" && datos && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {COLORES.map((c) => (
              <button
                key={c}
                onClick={() => alternarColor(c)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                  colores.includes(c) ? `${COLOR[c].fondo} ${COLOR[c].texto} font-medium` : "bg-white text-slate-600"
                }`}
              >
                <Luz color={c} tam={8} /> {COLOR[c].label}
              </button>
            ))}
            {grupo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 text-white px-3 py-1 text-xs">
                {grupo.tipo === "sede" ? "Sede" : grupo.tipo === "marca" ? "Marca" : "Categoría"}: {grupo.clave}
                <button onClick={() => setGrupo(null)} aria-label="Quitar filtro">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {seleccion.size > 0 && (
              <Button size="sm" onClick={pedirApoyo} className="ml-auto h-8">
                <HandCoins className="h-4 w-4 mr-2" />
                Pedir apoyo a la marca ({seleccion.size})
              </Button>
            )}
          </div>
          {mensaje && <Aviso tono="azul">{mensaje}</Aviso>}
          <TablaReporte<Fila>
            filas={visibles}
            columnas={columnas}
            buscarEn={(f) => `${f.codigo} ${f.nombre} ${f.marca} ${f.categoria}`}
            filtros={[
              { clave: "marca", titulo: "Marca" },
              { clave: "categoria", titulo: "Categoría" },
              ...(multiSede ? [{ clave: "sede" as const, titulo: "Sede" }] : []),
            ]}
            archivo={`rotacion-inventario-${datos.hoy}`}
          />
          <p className="text-[11px] text-slate-500">
            Ventas por mes desde abril ({datos.meses.map(etiquetaMes).join(", ")}) en la ficha de cada producto. Meta semanal y
            mensual = unidades al iniciar el plan ÷ {HORIZONTE_DIAS} × 7 y × 30.
          </p>
        </div>
      )}

      {pestana === "solicitudes" && datos && (
        <Solicitudes sede={sede} sedes={datos.sedes} puedeGestionar={datos.puedeGestionarSolicitudes} />
      )}
      {pestana === "contactos" && datos && (
        <Contactos puedeEditar={datos.puedeEditar} marcas={[...new Set(filas.map((f) => f.claveMarca))].sort()} />
      )}
      {pestana === "reglas" && <Reglas />}

      {detalle && datos && (
        <FichaDialog
          companyId={detalle.companyId}
          productoId={detalle.productoId}
          puedeEditar={datos.puedeEditar}
          puedeGestionar={datos.puedeGestionarSolicitudes}
          cerrar={(recargar) => {
            setDetalle(null);
            if (recargar) cargar();
          }}
        />
      )}
    </div>
  );
}

/** Lo que está en rojo repartido en el plan de 90 días: la cuota a vender cada mes, semana y día. */
function TarjetaCuotaRojo({ rojo, planes }: { rojo: GrupoSemaforo["total"]; planes: PlanRojo[] }) {
  // Con plan, la cuota es fija: lo que estaba en rojo el día que arrancó ÷ 3. Sin plan, lo de hoy.
  const base = planes.length ? sumarResumenes(planes.map((p) => p.resumen)) : null;
  const cuota = cuotaRojo(base ? { referencias: base.referencias, unidades: base.unidades, valor: base.valor } : rojo);
  const inicio = planes.length && planes.every((p) => p.inicio === planes[0].inicio) ? planes[0].inicio : null;
  return (
    <div className="rounded-xl border border-red-200 bg-white p-4">
      <p className="text-xs font-medium flex items-center gap-2 text-red-700">
        <Luz color="rojo" /> Cuota para salir del rojo · {HORIZONTE_DIAS} días
      </p>
      <p className="text-2xl font-bold text-gray-800 mt-1">
        {usd(cuota.mensual.valor)}
        <span className="text-sm font-medium text-gray-500"> / mes</span>
      </p>
      <p className="text-[11px] text-gray-500 mt-1">
        {num(cuota.mensual.unidades)} unidades al mes ·{" "}
        {base
          ? `lo que estaba en rojo ${inicio ? `el ${inicio.split("-").reverse().join("/")}` : "al arrancar el plan"} ÷ ${MESES_PLAN}`
          : `lo que está en rojo ÷ ${MESES_PLAN}`}
      </p>
      <p className="text-[11px] text-gray-500">
        Semana: {usd(cuota.semanal.valor)} · {num(cuota.semanal.unidades)} u. — Día: {usd(cuota.diaria.valor)} ·{" "}
        {num(cuota.diaria.unidades)} u.
      </p>
    </div>
  );
}

function TablaGrupos({
  grupos,
  titulo,
  abrir,
  cuotas,
}: {
  grupos: GrupoSemaforo[];
  titulo: Agrupar;
  abrir: (clave: string) => void;
  /** Cuota y vendido del plan del rojo por grupo; null = sin plan, la cuota sale de lo que está en rojo hoy. */
  cuotas: Map<string, ResumenPlanRojo> | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">{titulo === "sede" ? "Sede" : titulo === "marca" ? "Marca" : "Categoría"}</th>
            {COLORES.map((c) => (
              <th key={c} className="text-right px-3 py-2 font-medium whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <Luz color={c} tam={8} /> {COLOR[c].label}
                </span>
              </th>
            ))}
            <th className="text-right px-3 py-2 font-medium whitespace-nowrap" title={`Lo que está en rojo ÷ ${MESES_PLAN} meses`}>
              Cuota rojo / mes
            </th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
            <th className="px-3 py-2 font-medium min-w-[140px]">Mezcla</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.clave} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => abrir(g.clave)}>
              <td className="px-3 py-2 font-medium text-blue-700">{g.clave}</td>
              {COLORES.map((c) => (
                <td key={c} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {g.porColor[c].referencias ? (
                    <>
                      {usd(g.porColor[c].valor)}
                      <span className="block text-[10px] text-slate-400">{g.porColor[c].referencias} prod.</span>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-red-700">
                {cuotas ? (
                  cuotas.get(g.clave) ? (
                    <>
                      {usd(cuotas.get(g.clave)!.cuotaMensual.valor)}
                      <span className="block text-[10px] text-slate-500">
                        vendido {usd(cuotas.get(g.clave)!.vendidoMes.valor)} (
                        {porcentaje(cuotas.get(g.clave)!.vendidoMes.valor, cuotas.get(g.clave)!.cuotaMensual.valor)?.toFixed(0) ?? "—"}%)
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )
                ) : g.porColor.rojo.referencias ? (
                  <>
                    {usd(cuotaRojo(g.porColor.rojo).mensual.valor)}
                    <span className="block text-[10px] text-slate-400">{num(cuotaRojo(g.porColor.rojo).mensual.unidades)} u.</span>
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">{usd(g.total.valor)}</td>
              <td className="px-3 py-2">
                <BarraColores porColor={g.porColor} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reglas() {
  return (
    <Card>
      <CardContent className="p-5 text-sm text-slate-700 space-y-3 max-w-3xl">
        <p>
          <b>Productos.</b> Los que tienen unidades disponibles (físico − reservado) en el almacén principal de la sede, con la
          ubicación de Entrada, igual que Compras. Valor a costo = disponibles × costo de la sede en Odoo.
        </p>
        <p>
          <b>Días sin venta.</b> Desde la última factura o recibo de cliente del producto en la sede (las notas de crédito y las ventas
          entre sedes no cuentan). Nunca antes del {INICIO_SEGUIMIENTO.split("-").reverse().join("/")} (el corte a Odoo) ni antes de
          que entrara la unidad más vieja que queda: lo que llegó hace 10 días lleva 10 días, aunque el producto no se vendiera antes.
        </p>
        <p>
          <b>Semáforo.</b> Verde de 0 a {LIMITE_VERDE} días, amarillo de {LIMITE_VERDE + 1} a {LIMITE_AMARILLO}, rojo más de{" "}
          {LIMITE_AMARILLO}. Una sola venta lo vuelve a verde: el avance del plan dice si de verdad está rotando.
        </p>
        <p>
          <b>Cuota para salir del rojo.</b> El primer día que el panel abre la sede guarda lo que está en rojo (unidades disponibles
          y costo de ese día): es el plan de {HORIZONTE_DIAS} días, en {MESES_PLAN} meses de 30. La cuota de cada mes es ese valor ÷{" "}
          {MESES_PLAN} (semana = ÷ {HORIZONTE_DIAS} × 7; día = ÷ {HORIZONTE_DIAS}) y no cambia mientras dure el plan. Lo vendido son
          las ventas netas de esos productos desde que arrancó, con tope en las unidades que había (lo que llega después no cuenta),
          al costo de ese día. «Esperado a hoy» = el valor ÷ {HORIZONTE_DIAS} × los días ya terminados. Lo que pasa a rojo en el
          medio entra en el plan siguiente, que arranca solo a los {HORIZONTE_DIAS} días con lo que esté en rojo ese día.
        </p>
        <p>
          <b>Plan de {HORIZONTE_DIAS} días.</b> Arranca el día que el panel ve el producto con stock (o cuando Compras lo reinicia,
          por ejemplo al bajarle el precio) con las unidades disponibles de ese día. Meta diaria = esas unidades ÷ {HORIZONTE_DIAS};
          semanal = × 7; mensual = × 30. Avance = lo vendido en la semana (lunes a hoy), en el mes o desde que empezó el plan contra su
          meta. La venta diaria necesaria es lo disponible hoy ÷ los días que le quedan al plan: sube si llega más mercancía o si va
          atrasado. Al agotarse se cumple; a los {HORIZONTE_DIAS} días vence y arranca otro con lo que quede.
        </p>
        <p>
          <b>Solicitudes a las marcas.</b> Cuando un producto pasa a rojo, el panel lo agrega solo a la solicitud «Por enviar» de su
          marca en esa sede (una por marca). Compras la revisa, la envía (por correo con el Excel, o la marca
          como enviada) y anota la respuesta, el apoyo (protección de precio, nota de crédito, fondos de promoción o devolución), la
          acción acordada y, por producto, el apoyo por unidad y el precio de remate. Mientras espera envío, lo que se vende o sale de
          rojo sale de la solicitud.
        </p>
      </CardContent>
    </Card>
  );
}
