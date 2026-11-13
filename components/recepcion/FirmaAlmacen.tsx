"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { CheckOtro } from "@/components/seguridad/FormActa";

/**
 * Firma de Almacén al abrir y al cerrar un contenedor de la recepción: quién
 * lo hace (Personal de Almacén) y su clave personal, más «Otro» control (si
 * aplica) y, al abrir, una nota. Lo valida el servidor
 * (lib/recepcion/firmaContenedor.ts); el usuario de Almacén es compartido, la
 * clave es lo que dice quién fue.
 */

export type AlmacenistaClave = { id: number; nombre: string; tiene_clave?: number };

export type FirmaForm = {
  almacenista: string;
  clave: string;
  otro: string;
  otroOk: boolean | null;
  nota: string;
};

export const FIRMA_VACIA: FirmaForm = { almacenista: "", clave: "", otro: "", otroOk: null, nota: "" };

/** Lista para enviar: persona elegida, clave de 4 a 6 números y «Otro» respondido. */
export function firmaLista(f: FirmaForm | undefined): boolean {
  if (!f) return false;
  return !!f.almacenista && /^\d{4,6}$/.test(f.clave) && !(f.otro.trim() && f.otroOk === null);
}

/** Lo que va en el body de `registrar_llegada` / `cerrar_contenedor`. */
export function cuerpoFirma(f: FirmaForm, conNota: boolean): Record<string, unknown> {
  return {
    almacenista: f.almacenista,
    clave: f.clave,
    otro_verificacion: f.otro.trim() ? f.otro.trim().slice(0, 200) : null,
    otro_verificacion_ok: f.otro.trim() ? f.otroOk : null,
    ...(conNota ? { nota: f.nota.trim() ? f.nota.trim().slice(0, 2000) : null } : {}),
  };
}

const claseCampo =
  "w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[color:var(--portal-primary,#741DFE)] focus:ring-2 focus:ring-violet-100";

export function FirmaAlmacen({
  momento,
  valor,
  onChange,
  almacenistas,
  conNota,
}: {
  momento: "llegada" | "cierre";
  valor: FirmaForm;
  onChange: (cambios: Partial<FirmaForm>) => void;
  almacenistas: AlmacenistaClave[];
  /** Al cerrar la nota es la de siempre (notas_cierre), fuera de este bloque. */
  conNota: boolean;
}) {
  const t = useTranslations("recepcion.firma_almacen");
  const tOtro = useTranslations("seguridad.ingreso.form");
  const locale = (useParams()?.locale as string) || "es";
  const elegido = almacenistas.find((a) => a.nombre === valor.almacenista);
  const sinClave = !!elegido && elegido.tiene_clave !== undefined && !Number(elegido.tiene_clave);
  const id = `firma-almacen-${momento}`;

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <KeyRound className="w-4 h-4 text-[color:var(--portal-primary,#741DFE)]" />
        {t(momento === "llegada" ? "titulo_llegada" : "titulo_cierre")}
      </p>

      <CheckOtro
        detalle={valor.otro}
        onDetalle={(v) => onChange({ otro: v })}
        value={valor.otroOk}
        onChange={(v) => onChange({ otroOk: v })}
        label={tOtro("check_otro")}
        siAplica={tOtro("check_otro_si_aplica")}
        placeholder={tOtro("check_otro_placeholder")}
        yes={tOtro("yes")}
        no={tOtro("no")}
      />

      {conNota && (
        <div>
          <label htmlFor={`${id}-nota`} className="block text-xs font-semibold text-slate-600 mb-1.5">
            {t("nota")} <span className="font-normal text-slate-400">({tOtro("opcional")})</span>
          </label>
          <textarea
            id={`${id}-nota`}
            value={valor.nota}
            maxLength={2000}
            rows={2}
            onChange={(e) => onChange({ nota: e.target.value })}
            placeholder={t("nota_ph")}
            className={`${claseCampo} h-auto py-2.5`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-quien`} className="block text-xs font-semibold text-slate-600 mb-1.5">
            {t("quien")} <span className="text-red-500">*</span>
          </label>
          <select
            id={`${id}-quien`}
            value={valor.almacenista}
            onChange={(e) => onChange({ almacenista: e.target.value, clave: "" })}
            className={claseCampo}
          >
            <option value="">{almacenistas.length ? t("elegir") : t("sin_catalogo")}</option>
            {almacenistas.map((a) => (
              <option key={a.id} value={a.nombre}>
                {a.nombre}
              </option>
            ))}
          </select>
          {almacenistas.length === 0 && (
            <Link
              href={`/${locale}/seguridad/mercancia/personal`}
              className="mt-1 inline-block text-[11px] font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
            >
              {t("gestionar")}
            </Link>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-clave`} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
            {t("clave")} <span className="text-red-500">*</span>
            {/^\d{4,6}$/.test(valor.clave) && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden />}
          </label>
          <input
            id={`${id}-clave`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={valor.clave}
            disabled={!valor.almacenista || sinClave}
            onChange={(e) => onChange({ clave: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="••••"
            className={`${claseCampo} text-lg tracking-[0.4em] disabled:bg-slate-50`}
          />
        </div>
      </div>
      {sinClave ? (
        <p className="text-[11px] text-amber-700">
          {t("sin_clave_aviso", { nombre: valor.almacenista })}{" "}
          <Link
            href={`/${locale}/seguridad/mercancia/personal`}
            className="font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
          >
            {t("gestionar")}
          </Link>
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">{t("clave_ayuda")}</p>
      )}
    </div>
  );
}

/** Quién abrió o cerró el contenedor (con su clave) y lo que anotó. */
export function FirmaContenedorVista({
  momento,
  almacenista,
  otro,
  otroOk,
  nota,
}: {
  momento: "llegada" | "cierre";
  almacenista?: string | null;
  otro?: string | null;
  otroOk?: number | null;
  nota?: string | null;
}) {
  const t = useTranslations("recepcion.firma_almacen");
  const tOtro = useTranslations("seguridad.ingreso.form");
  if (!almacenista && !otro && !nota) return null;
  const ok = Number(otroOk) === 1;
  return (
    <div className="space-y-1 text-xs text-slate-600">
      {almacenista && (
        <p className="flex items-center gap-1.5">
          <KeyRound className="w-3 h-3 text-emerald-600" />
          <span>
            {t(momento === "llegada" ? "abrio" : "cerro")}: <span className="font-semibold text-slate-800">{almacenista}</span>{" "}
            <span className="text-slate-400">· {t("con_clave")}</span>
          </span>
        </p>
      )}
      {otro && (
        <p className="flex items-center gap-1.5">
          {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
          <span>
            {tOtro("check_otro")}: {otro} ·{" "}
            <span className={`font-semibold ${ok ? "text-emerald-700" : "text-red-600"}`}>{ok ? tOtro("yes") : tOtro("no")}</span>
          </span>
        </p>
      )}
      {nota && <p className="whitespace-pre-wrap">{nota}</p>}
    </div>
  );
}
