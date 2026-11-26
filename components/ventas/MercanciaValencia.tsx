"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoCarga, Pestanas, Tarjeta, fechaCorta, money } from "@/components/administracion/comunes";
import { TablaReporte, mesesDisponibles, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import { delMes, resumir, type LineaMercancia, type ProductoMercancia, type ResumenMercancia } from "@/lib/ventas/mercanciaValenciaTipos";

/**
 * Mercancía que Caracas le compró a Valencia y cuánto sigue en Valencia
 * (lib/ventas/mercanciaValencia.ts).
 */

interface Respuesta {
  resumen: ResumenMercancia;
  lineas: LineaMercancia[];
  pendienteTotal: ResumenMercancia;
  productos: ProductoMercancia[];
  actualizado: string;
}

type Pestana = "productos" | "pedidos";

const fechaActualizacion = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Caracas",
});

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const enEspera = (dias: number | null) =>
  dias == null ? (
    <span className="text-slate-300">—</span>
  ) : (
    <span className={dias > 15 ? "text-red-600 font-semibold" : dias > 7 ? "text-amber-600 font-semibold" : "text-slate-600"}>
      {dias} d
    </span>
  );

const colProducto: Columna<Pick<LineaMercancia, "producto" | "codigo">> = {
  clave: "producto",
  titulo: "Producto",
  ancho: "min-w-[190px]",
  mostrar: (fila) => (
    <div className="max-w-80 whitespace-normal">
      <p className="font-medium text-slate-900">{fila.producto}</p>
      {fila.codigo && <p className="mt-0.5 text-xs text-slate-600">{fila.codigo}</p>}
    </div>
  ),
};

const colProductos: Columna<ProductoMercancia>[] = [
  colProducto,
  { clave: "codigo", titulo: "Código", soloExcel: true },
  {
    clave: "pendiente",
    titulo: "Pendientes (u.)",
    tipo: "numero",
    sumar: true,
    mostrar: (f) => <span className="font-semibold text-amber-700">{num(f.pendiente)}</span>,
  },
  { clave: "montoPendiente", titulo: "Pendiente estimado", tipo: "dinero", sumar: true },
  { clave: "marca", titulo: "Marca" },
  { clave: "pedidos", titulo: "Pedidos", tipo: "numero" },
  { clave: "facturado", titulo: "Facturadas (u.)", tipo: "numero", sumar: true },
  { clave: "despachado", titulo: "Despachadas (u.)", tipo: "numero", sumar: true },
  { clave: "desde", titulo: "Facturado desde", tipo: "fecha" },
  { clave: "diasEsperando", titulo: "Espera", tipo: "numero", mostrar: (f) => enEspera(f.diasEsperando) },
];

const colLineas: Columna<LineaMercancia & { facturasTexto: string }>[] = [
  colProducto,
  { clave: "codigo", titulo: "Código", soloExcel: true },
  {
    clave: "pendiente",
    titulo: "Pendientes (u.)",
    tipo: "numero",
    sumar: true,
    mostrar: (f) =>
      f.pendiente > 0 ? (
        <span className="font-semibold text-amber-700">{num(f.pendiente)}</span>
      ) : (
        <span className="text-emerald-600">Completo</span>
      ),
  },
  { clave: "montoPendiente", titulo: "Pendiente estimado", tipo: "dinero", sumar: true },
  { clave: "pedido", titulo: "Pedido" },
  { clave: "facturasTexto", titulo: "Factura" },
  { clave: "fechaFactura", titulo: "Primera factura", tipo: "fecha" },
  { clave: "marca", titulo: "Marca" },
  { clave: "facturado", titulo: "Facturadas (u.)", tipo: "numero", sumar: true },
  { clave: "despachado", titulo: "Despachadas (u.)", tipo: "numero", sumar: true },
  { clave: "montoFacturado", titulo: "Facturado estimado", tipo: "dinero", sumar: true },
  {
    clave: "despachoAbierto",
    titulo: "Despacho abierto",
    mostrar: (f) =>
      f.pendiente > 0 && f.despachoAbierto ? (
        <span>
          {f.despachoAbierto}
          {f.fechaPrevista && <span className="text-slate-400"> · {fechaCorta(f.fechaPrevista)}</span>}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
  },
  { clave: "fechaPrevista", titulo: "Fecha prevista", soloExcel: true },
  { clave: "diasEsperando", titulo: "Espera", tipo: "numero", mostrar: (f) => enEspera(f.diasEsperando) },
];

export function MercanciaValencia() {
  const [mes, setMes] = useState("todos");
  const [pestana, setPestana] = useState<Pestana>("productos");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controlador = new AbortController();

    async function cargar() {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await fetch("/api/gerente_venta/mercancia-valencia", {
          signal: controlador.signal,
          cache: "no-store",
        });
        const json = await respuesta.json();
        if (controlador.signal.aborted) return;
        if (!respuesta.ok) {
          setError({ mensaje: json.error || "No se pudo cargar el reporte.", odooCaido: !!json.odooCaido });
          return;
        }
        setDatos(json.data);
      } catch {
        if (!controlador.signal.aborted) {
          setError({ mensaje: "No se pudo cargar el reporte. Intenta de nuevo.", odooCaido: false });
        }
      } finally {
        if (!controlador.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => controlador.abort();
  }, [revision]);

  const actualizar = () => setRevision((valor) => valor + 1);
  const meses = mesesDisponibles();
  const periodo = meses.find((opcion) => opcion.value === mes)?.label ?? "Todos los meses";
  const resumen = useMemo(() => {
    if (!datos) return null;
    return mes === "todos" ? datos.resumen : resumir(delMes(datos.lineas, mes));
  }, [datos, mes]);
  const lineas = useMemo(
    () => delMes(datos?.lineas ?? [], mes)
      .filter((linea) => !soloPendientes || linea.pendiente > 0)
      .map((linea) => ({ ...linea, facturasTexto: linea.facturas.join(", ") })),
    [datos, mes, soloPendientes],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-start gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <Warehouse aria-hidden="true" className="mt-0.5 h-7 w-7 shrink-0 text-blue-600 sm:mt-1" />
            Mercancía comprada a Valencia
          </h1>
          <p className="ml-9 mt-1 text-sm text-slate-600">Facturación y despachos de Valencia a Caracas en Odoo.</p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <Button variant="outline" onClick={actualizar} disabled={cargando} className="gap-2 bg-white">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${cargando ? "motion-safe:animate-spin" : ""}`} />
            {cargando ? "Actualizando…" : error ? "Reintentar" : "Actualizar"}
          </Button>
          {datos && (
            <p className="text-xs text-slate-600" role="status">
              Datos del <time dateTime={datos.actualizado}>{fechaActualizacion.format(new Date(datos.actualizado))}</time>
            </p>
          )}
        </div>
      </header>

      <div role="status">
        <EstadoCarga cargando={cargando && !datos} error={!datos ? error : null} />
      </div>
      {datos && error && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La actualización falló. Se muestran los datos de la última consulta exitosa.
        </div>
      )}

      {datos && resumen && (
        <section aria-label="Reporte de mercancía">
          <Pestanas<Pestana>
            opciones={[
              { value: "productos", label: "Por producto", contador: datos.productos.length },
              { value: "pedidos", label: "Por pedido", contador: lineas.length },
            ]}
            valor={pestana}
            onChange={setPestana}
          />

          {pestana === "productos" ? (
            <div className="space-y-4 pt-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Pendiente en Valencia</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Histórico · {datos.pendienteTotal.productosPendientes} productos · {datos.pendienteTotal.pedidos} pedidos
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums sm:mt-0">
                  <strong className="text-xl text-amber-950">{num(datos.pendienteTotal.pendiente)} u.</strong>
                  <span className="text-sm text-amber-900">{money(datos.pendienteTotal.montoPendiente, 2)} estimados</span>
                </div>
              </div>
              {datos.productos.length ? (
                <TablaReporte
                  key="productos"
                  filas={datos.productos}
                  columnas={colProductos}
                  buscarEn={(fila) => `${fila.codigo} ${fila.producto} ${fila.marca}`}
                  filtros={[{ clave: "marca", titulo: "Marca" }]}
                  archivo="pendiente-en-valencia"
                  ordenInicial={{ clave: "montoPendiente", desc: true }}
                />
              ) : (
                <p className="rounded-lg border bg-white px-4 py-8 text-center text-sm text-slate-600">
                  No hay mercancía pendiente de despacho en el histórico consultado.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium text-slate-700 sm:flex-none">
                  Mes de la primera factura
                  <select
                    value={mes}
                    onChange={(event) => setMes(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="todos">Todos los meses</option>
                    {meses.map((opcion) => (
                      <option key={opcion.value} value={opcion.value}>{opcion.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={soloPendientes}
                    onChange={(event) => setSoloPendientes(event.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  Solo pendientes
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3" aria-label="Totales del período">
                <Tarjeta titulo="Facturadas" valor={`${num(resumen.facturado)} u.`}
                  detalle={`${resumen.pedidos} pedidos · ${money(resumen.montoFacturado, 2)} estimados`} />
                <Tarjeta titulo="Despachadas" valor={`${num(resumen.despachado)} u.`} />
                <Tarjeta titulo="Pendientes" valor={`${num(resumen.pendiente)} u.`}
                  detalle={`${money(resumen.montoPendiente, 2)} estimados`}
                  tono={resumen.pendiente > 0 ? "ambar" : "verde"} />
              </div>

              {soloPendientes && (
                <p className="text-xs text-slate-600">Los totales incluyen todas las líneas del período.</p>
              )}
              {lineas.length ? (
                <TablaReporte
                  key={`pedidos-${mes}-${soloPendientes}`}
                  filas={lineas}
                  columnas={colLineas}
                  buscarEn={(fila) => `${fila.pedido} ${fila.facturasTexto} ${fila.codigo} ${fila.producto} ${fila.marca}`}
                  filtros={[{ clave: "marca", titulo: "Marca" }]}
                  archivo={`mercancia-valencia-${mes}${soloPendientes ? "-pendiente" : ""}`}
                  ordenInicial={{ clave: "fechaFactura", desc: true }}
                />
              ) : (
                <p className="rounded-lg border bg-white px-4 py-8 text-center text-sm text-slate-600">
                  {soloPendientes ? "No hay líneas pendientes" : "No hay líneas facturadas"} para el período elegido ({periodo}).
                </p>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-slate-600">
            Los montos se estiman con el precio del pedido antes de impuestos. La espera se cuenta desde la primera factura.
          </p>
        </section>
      )}
    </div>
  );
}
