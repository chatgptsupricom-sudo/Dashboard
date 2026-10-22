"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Aviso, EncabezadoAdmin, EstadoCarga, mesActual, money, useDatosAdmin } from "@/components/administracion/comunes";
import { Boxes, HandCoins, RefreshCw, Timer, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

type Indicador = { dias: number | null; saldo: number; movimiento: number; motivo?: string };
type Datos = {
  success: true;
  data: {
    mes: string;
    desde: string;
    corte: string;
    diasPeriodo: number;
    cobro: Indicador;
    inventario: Indicador;
    pago: Indicador;
    ciclo: number | null;
  };
};

const fecha = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

function TarjetaDias({
  icono,
  titulo,
  ind,
  saldo,
  movimiento,
  dias,
}: {
  icono: ReactNode;
  titulo: string;
  ind: Indicador;
  saldo: string;
  movimiento: string;
  dias: number;
}) {
  return (
    <Card className="bg-white">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          {icono}
          {titulo}
        </div>
        {ind.dias === null ? (
          <div>
            <p className="text-3xl font-bold text-slate-300">—</p>
            <p className="text-xs text-slate-500 mt-1">{ind.motivo}</p>
          </div>
        ) : (
          <p className="text-4xl font-bold text-slate-900 tabular-nums">
            {ind.dias}
            <span className="text-base font-medium text-slate-500 ml-1.5">días</span>
          </p>
        )}
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs border-t border-slate-100 pt-3">
          <dt className="text-slate-500">{saldo}</dt>
          <dd className="text-right font-medium text-slate-800 tabular-nums">{money(ind.saldo)}</dd>
          <dt className="text-slate-500">{movimiento}</dt>
          <dd className="text-right font-medium text-slate-800 tabular-nums">{money(ind.movimiento)}</dd>
          <dt className="text-slate-500">Días del período</dt>
          <dd className="text-right font-medium text-slate-800 tabular-nums">{dias}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * Días promedio de cobro, inventario y pago (rol Inteligencia de Negocio).
 * Cálculo en lib/inteligencia-negocio/diasPromedio.ts.
 */
export function DiasPromedio() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(mesActual());
  const { datos, cargando, error } = useDatosAdmin<Datos>("/api/inteligencia-negocio/dias-promedio", empresa, mes);
  const d = datos?.data;

  return (
    <div className="space-y-6">
      <EncabezadoAdmin
        icono={<Timer className="h-7 w-7 text-blue-600" />}
        titulo="Días promedio"
        subtitulo="Cobro, inventario y pago del mes, sin intercompañía"
        empresa={empresa}
        setEmpresa={setEmpresa}
        mes={mes}
        setMes={setMes}
      />

      <EstadoCarga cargando={cargando} error={error} />

      {!cargando && !error && d && (
        <>
          <p className="text-xs text-slate-500">
            Del {fecha(d.desde)} al {fecha(d.corte)}
            {mes === mesActual() ? " (mes en curso: hasta hoy)" : ""}. Cada indicador es saldo al
            cierre ÷ movimiento del período × días del período.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TarjetaDias
              icono={<HandCoins className="h-4 w-4 text-emerald-600" />}
              titulo="Días promedio de cobro"
              ind={d.cobro}
              saldo="Por cobrar a crédito al cierre"
              movimiento="Ventas a crédito del período"
              dias={d.diasPeriodo}
            />
            <TarjetaDias
              icono={<Boxes className="h-4 w-4 text-blue-600" />}
              titulo="Días promedio de inventario"
              ind={d.inventario}
              saldo="Inventario al costo al cierre"
              movimiento="Costo de lo vendido en el período"
              dias={d.diasPeriodo}
            />
            <TarjetaDias
              icono={<Wallet className="h-4 w-4 text-amber-600" />}
              titulo="Días promedio de pago"
              ind={d.pago}
              saldo="Por pagar a proveedores al cierre"
              movimiento="Compras del período"
              dias={d.diasPeriodo}
            />
          </div>

          <Card className="bg-slate-50">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <RefreshCw className="h-4 w-4 text-slate-500" />
                Ciclo de caja (cobro + inventario − pago)
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {d.ciclo === null ? "—" : `${d.ciclo} días`}
              </p>
            </CardContent>
          </Card>

          <Aviso tono="azul">
            Cobro: el mismo cálculo de la tarjeta DSO de Cuentas por Cobrar (ventas a crédito con IVA). Inventario: valor
            al costo en Odoo y costo de las salidas a clientes menos devoluciones. Pago: saldo de cuentas por pagar y
            facturas de proveedor con IVA. Todo sin ventas, compras ni deudas con las empresas del grupo; por eso Caracas,
            que le compra casi todo a Valencia, puede quedar sin días de pago.
          </Aviso>
        </>
      )}
    </div>
  );
}
