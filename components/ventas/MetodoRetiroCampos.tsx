"use client";

import { AdjuntarAutorizacion, subirAutorizacion } from "@/components/ventas/AutorizacionTransporte";
import { Input } from "@/components/ui/input";
import { esDeLaSede, METODOS_RETIRO, type FilaMetodo, type MetodoRetiro as Metodo } from "@/lib/ventas/metodoRetiroTipos";
import { Building2, Check, Package, Store, Truck } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Formulario del método de retiro (botones + ruta / agencia / compañía + nota,
 * y la foto de la autorización del cliente en el transporte externo).
 * Lo usan la sección del vendedor (MetodoRetiro) y el cambio que hace Almacén
 * (components/seguridad/CambiarMetodoRetiro).
 */

/** Ruta o agencia, con su sede (null = Venezuela, 7 = Panamá). */
export type Opcion = { id: number; nombre: string; cids?: number | null };
export type Borrador = {
  metodo: Metodo | "";
  ruta_id: string;
  agencia: string;
  otra: string;
  empresa: string;
  nota: string;
  /** Transporte externo: la autorización que ya tiene el pedido. */
  autorizacion_id: number | null;
  /** Transporte externo: foto nueva, se sube al guardar (cuerpoConAutorizacion). */
  archivo: File | null;
};

export const ICONO_METODO: Record<Metodo, any> = { sucursal: Store, ruta: Truck, encomienda: Package, transporte: Building2 };

const selectCls =
  "h-10 w-full px-3 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400";

/** El borrador que corresponde a un método ya guardado (o vacío). */
export function borradorDe(m: FilaMetodo | null, agencias: Opcion[], companyId: number | null | undefined): Borrador {
  // `agencia` guarda la agencia de la encomienda o la compañía del transporte.
  const agenciaEnc = m?.metodo === "encomienda" ? m.agencia : null;
  const conocida = !!agenciaEnc && agencias.some((a) => a.nombre === agenciaEnc && esDeLaSede(a.cids, companyId));
  return {
    metodo: m?.metodo || "",
    ruta_id: m?.ruta_id ? String(m.ruta_id) : "",
    agencia: agenciaEnc ? (conocida ? agenciaEnc : "otra") : "",
    otra: agenciaEnc && !conocida ? agenciaEnc : "",
    empresa: m?.metodo === "transporte" ? m.agencia || "" : "",
    nota: m?.nota || "",
    autorizacion_id: m?.metodo === "transporte" ? m.autorizacion_id ?? null : null,
    archivo: null,
  };
}

/** La clave de traducción del error del borrador, o null si se puede guardar. */
export function errorBorrador(b: Borrador): string | null {
  if (!b.metodo) return "error_metodo";
  if (b.metodo === "ruta" && !b.ruta_id) return "error_ruta";
  if (b.metodo === "encomienda" && !(b.agencia === "otra" ? b.otra.trim() : b.agencia)) return "error_agencia";
  if (b.metodo === "transporte" && !b.empresa.trim()) return "error_empresa";
  if (b.metodo === "transporte" && !b.archivo && !b.autorizacion_id) return "error_autorizacion";
  return null;
}

/** Lo que se manda a la API. */
export function cuerpoBorrador(b: Borrador) {
  const agencia = b.agencia === "otra" ? b.otra.trim() : b.agencia;
  return {
    metodo: b.metodo,
    ruta_id: b.metodo === "ruta" ? Number(b.ruta_id) : null,
    agencia: b.metodo === "encomienda" ? agencia : b.metodo === "transporte" ? b.empresa.trim() : null,
    nota: b.nota,
    autorizacion_id: b.metodo === "transporte" ? b.autorizacion_id : null,
  };
}

/**
 * cuerpoBorrador, subiendo antes la foto nueva de la autorización (transporte
 * externo). `mensajeError`: el texto si la subida falla sin decir por qué.
 */
export async function cuerpoConAutorizacion(b: Borrador, mensajeError: string) {
  const cuerpo = cuerpoBorrador(b);
  if (b.metodo === "transporte" && b.archivo) cuerpo.autorizacion_id = await subirAutorizacion(b.archivo, mensajeError);
  return cuerpo;
}

export function MetodoRetiroCampos({
  valor,
  onChange,
  rutas,
  agencias,
  columnas = "grid-cols-2 lg:grid-cols-4",
}: {
  valor: Borrador;
  onChange: (c: Partial<Borrador>) => void;
  /** Ya filtradas a la sede del pedido. */
  rutas: Opcion[];
  agencias: Opcion[];
  /** Columnas de los botones de método. */
  columnas?: string;
}) {
  const t = useTranslations("metodoRetiro");
  const b = valor;
  return (
    <div className="space-y-3">
      <div className={`grid gap-2 ${columnas}`}>
        {METODOS_RETIRO.map((m) => {
          const Icono = ICONO_METODO[m];
          const activo = b.metodo === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ metodo: m })}
              aria-pressed={activo}
              className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 sm:p-3 text-left transition-all ${
                activo ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50"
              }`}
            >
              <span className={`shrink-0 p-1.5 sm:p-2 rounded-lg ${activo ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                <Icono className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] font-semibold leading-tight ${activo ? "text-violet-800" : "text-slate-700"}`}>
                  {t(`metodo_${m}`)}
                </span>
                <span className="hidden sm:block text-[11px] text-slate-500 leading-tight mt-0.5">{t(`hint_${m}`)}</span>
              </span>
              {activo && <Check className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-violet-600" />}
            </button>
          );
        })}
      </div>

      {b.metodo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {b.metodo === "ruta" && (
            <select value={b.ruta_id} onChange={(e) => onChange({ ruta_id: e.target.value })} aria-label={t("ruta")} className={selectCls}>
              <option value="">{t("elige_ruta")}</option>
              {rutas.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.nombre}
                </option>
              ))}
            </select>
          )}
          {b.metodo === "encomienda" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={b.agencia}
                onChange={(e) => onChange({ agencia: e.target.value })}
                aria-label={t("agencia")}
                className={`${selectCls} sm:flex-1`}
              >
                <option value="">{t("elige_agencia")}</option>
                {agencias.map((a) => (
                  <option key={a.id} value={a.nombre}>
                    {a.nombre}
                  </option>
                ))}
                <option value="otra">{t("otra_agencia")}</option>
              </select>
              {b.agencia === "otra" && (
                <Input
                  value={b.otra}
                  onChange={(e) => onChange({ otra: e.target.value.slice(0, 100) })}
                  placeholder={t("nombre_agencia")}
                  className="h-10 rounded-lg sm:flex-1"
                />
              )}
            </div>
          )}
          {b.metodo === "transporte" && (
            <Input
              value={b.empresa}
              onChange={(e) => onChange({ empresa: e.target.value.slice(0, 100) })}
              placeholder={t("empresa_transporte")}
              aria-label={t("empresa_transporte")}
              className="h-10 rounded-lg"
            />
          )}
          <Input
            value={b.nota}
            onChange={(e) => onChange({ nota: e.target.value.slice(0, 500) })}
            placeholder={t(b.metodo === "sucursal" ? "nota_sucursal" : b.metodo === "transporte" ? "nota_transporte" : "nota_envio")}
            className={`h-10 rounded-lg ${b.metodo === "sucursal" ? "sm:col-span-2" : ""}`}
          />
          {b.metodo === "transporte" && (
            <AdjuntarAutorizacion
              archivo={b.archivo}
              autorizacionId={b.autorizacion_id}
              onArchivo={(archivo) => onChange({ archivo })}
            />
          )}
        </div>
      )}
    </div>
  );
}
