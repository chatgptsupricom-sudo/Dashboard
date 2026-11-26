"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoCarga, Pestanas, Tarjeta, money } from "@/components/administracion/comunes";
import { TablaReporte, mesesDisponibles, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import type { LineaMercancia, ProductoMercancia, ResumenMercancia } from "@/lib/ventas/mercanciaValenciaTipos";

/**
 * Mercancía que Caracas le compró a Valencia y cuánto sigue en Valencia
 * (lib/ventas/mercanciaValencia.ts). Valencia la factura toda el mismo día y la
 * despacha por partes.
 */

interface Respuesta {
  mes: string;
  resumen: ResumenMercancia;
  lineas: LineaMercancia[];
  pendienteTotal: ResumenMercancia;
  productos: ProductoMercancia[];
  actualizado: string;
}

type Pestana = "productos" | "pedidos";

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const enEspera = (dias: number | null) =>
  dias == null ? (
    <span className="text-slate-300">—</span>
  ) : (
    <span className={dias > 15 ? "text-red-600 font-semibold" : dias > 7 ? "text-amber-600 font-semibold" : "text-slate-600"}>
      {dias} d
    </span>
  );

const colProductos: Columna<ProductoMercancia>[] = [
  { clave: "codigo", titulo: "Código" },
  { clave: "producto", titulo: "Producto", ancho: "min-w-[260px]" },
  { clave: "marca", titulo: "Marca" },
  { clave: "pedidos", titulo: "Pedidos", tipo: "numero" },
  { clave: "facturado", titulo: "Facturado", tipo: "numero", sumar: true },
  { clave: "despachado", titulo: "Despachado", tipo: "numero", sumar: true },
  {
    clave: "pendiente",
    titulo: "Queda en Valencia",
    tipo: "numero",
    sumar: true,
    mostrar: (f) => <span className="font-semibold text-amber-700">{num(f.pendiente)}</span>,
  },
  { clave: "montoPendiente", titulo: "Monto pendiente", tipo: "dinero", sumar: true },
  { clave: "desde", titulo: "Facturado desde", tipo: "fecha" },
  { clave: "diasEsperando", titulo: "Espera", tipo: "numero", mostrar: (f) => enEspera(f.diasEsperando) },
];

const colLineas: Columna<LineaMercancia & { facturasTexto: string }>[] = [
  { clave: "pedido", titulo: "Pedido" },
  { clave: "facturasTexto", titulo: "Factura" },
  { clave: "fechaFactura", titulo: "Fecha factura", tipo: "fecha" },
  { clave: "codigo", titulo: "Código" },
  { clave: "producto", titulo: "Producto", ancho: "min-w-[240px]" },
  { clave: "marca", titulo: "Marca" },
  { clave: "facturado", titulo: "Facturado", tipo: "numero", sumar: true },
  { clave: "despachado", titulo: "Despachado", tipo: "numero", sumar: true },
  {
    clave: "pendiente",
    titulo: "Queda en Valencia",
    tipo: "numero",
    sumar: true,
    mostrar: (f) =>
      f.pendiente > 0 ? (
        <span className="font-semibold text-amber-700">{num(f.pendiente)}</span>
      ) : (
        <span className="text-emerald-600">Completo</span>
      ),
  },
  { clave: "montoFacturado", titulo: "Monto facturado", tipo: "dinero", sumar: true },
  { clave: "montoPendiente", titulo: "Monto pendiente", tipo: "dinero", sumar: true },
  {
    clave: "despachoAbierto",
    titulo: "Despacho abierto",
    mostrar: (f) =>
      f.pendiente > 0 && f.despachoAbierto ? (
        <span>
          {f.despachoAbierto}
          {f.fechaPrevista && <span className="text-slate-400"> · {f.fechaPrevista.split("-").reverse().join("/")}</span>}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
    excel: (f) => (f.pendiente > 0 ? f.despachoAbierto : null),
  },
  { clave: "diasEsperando", titulo: "Espera", tipo: "numero", mostrar: (f) => enEspera(f.diasEsperando) },
];

export function MercanciaValencia() {
  const [mes, setMes] = useState("todos");
  const [pestana, setPestana] = useState<Pestana>("productos");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/gerente_venta/mercancia-valencia?mes=${mes}`);
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j.error || "No se pudo cargar"), { odooCaido: !!j.odooCaido });
      setDatos(j.data);
    } catch (e: any) {
      setError({ mensaje: e.message, odooCaido: !!e.odooCaido });
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const r = datos?.resumen;
  const p = datos?.pendienteTotal;
  const pctDespachado = r && r.facturado > 0 ? (r.despachado / r.facturado) * 100 : null;
  const lineas = (datos?.lineas ?? [])
    .filter((l) => !soloPendientes || l.pendiente > 0)
    .map((l) => ({ ...l, facturasTexto: l.facturas.join(", ") }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-7 w-7 text-blue-600" />
            Mercancía comprada a Valencia
          </h1>
          <p className="text-gray-500 text-sm">
            Lo que Valencia le facturó a Caracas y cuánto sigue en Valencia sin despachar. Fuente: pedidos de Valencia a
            SUPRICOM CCS en Odoo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm capitalize bg-white"
            aria-label="Mes de la factura"
          >
            <option value="todos">Todos los meses</option>
            {mesesDisponibles().map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando} className="h-9">
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <EstadoCarga cargando={cargando && !datos} error={error} />

      {datos && r && p && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta
              titulo="Queda en Valencia (todo)"
              valor={money(p.montoPendiente, 2)}
              detalle={`${num(p.pendiente)} unidades · ${p.productosPendientes} productos · ${p.pedidos} pedidos`}
              tono={p.pendiente > 0 ? "ambar" : "verde"}
            />
            <Tarjeta
              titulo={mes === "todos" ? "Facturado a Caracas" : "Facturado en el mes"}
              valor={money(r.montoFacturado, 2)}
              detalle={`${num(r.facturado)} unidades · ${r.pedidos} pedidos`}
            />
            <Tarjeta
              titulo="Despachado"
              valor={`${num(r.despachado)} u.`}
              detalle={pctDespachado == null ? undefined : `${pctDespachado.toFixed(1)}% de lo facturado`}
            />
            <Tarjeta
              titulo={mes === "todos" ? "Pendiente" : "Pendiente de ese mes"}
              valor={money(r.montoPendiente, 2)}
              detalle={`${num(r.pendiente)} unidades`}
              tono={r.pendiente > 0 ? "ambar" : "verde"}
            />
          </div>

          <Pestanas<Pestana>
            opciones={[
              { value: "productos", label: "Queda en Valencia por producto", contador: datos.productos.length },
              { value: "pedidos", label: "Por pedido y factura", contador: datos.lineas.length },
            ]}
            valor={pestana}
            onChange={setPestana}
          />

          {pestana === "productos" ? (
            <>
              <p className="text-xs text-slate-500">
                Todo lo facturado y no despachado, de cualquier mes. Espera = días desde la factura más vieja.
              </p>
              <TablaReporte
                filas={datos.productos}
                columnas={colProductos}
                buscarEn={(f) => `${f.codigo} ${f.producto} ${f.marca}`}
                filtros={[{ clave: "marca", titulo: "Marca" }]}
                archivo="queda-en-valencia"
                ordenInicial={{ clave: "montoPendiente", desc: true }}
              />
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} />
                Solo lo que queda en Valencia
              </label>
              <TablaReporte
                filas={lineas}
                columnas={colLineas}
                buscarEn={(f) => `${f.pedido} ${f.facturasTexto} ${f.codigo} ${f.producto} ${f.marca}`}
                filtros={[{ clave: "marca", titulo: "Marca" }]}
                archivo="mercancia-caracas-valencia"
                ordenInicial={{ clave: "fechaFactura", desc: true }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
