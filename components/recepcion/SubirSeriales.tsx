"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

/**
 * Carga masiva de los seriales de un renglon: Almacen los pega (uno por linea)
 * o sube el archivo que manda el proveedor (Excel, CSV o texto), los revisa y
 * los carga de una vez, en vez de pistolearlos uno por uno. Las reglas son las
 * de la pistola (POST /api/recepcion/[id]/seriales).
 */

type Resultado = {
  agregados: number;
  repetidos: string[];
  repetidos_en_lista: string[];
  sobran: string[];
  en_otro: Array<{ serial: string; referencia: string }>;
};

/** Seriales de un texto: uno por linea, o separados por coma, punto y coma o tabulador. */
const separar = (texto: string) =>
  texto
    .split(/[\r\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Un titulo de columna, no un serial ("Serial", "S/N", "Numero de serie"). */
const esTitulo = (s: string) => /^(serial(es)?|s\/?n|n[uú]mero de serie|serie|series|imei)$/i.test(s.trim());

/**
 * Los seriales de un Excel: la columna que dice "Serial" (o similar) y, si
 * ninguna lo dice, la primera con datos. Una celda por serial.
 */
async function serialesDeExcel(archivo: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  let col = -1;
  let desde = 0;
  for (let f = 0; f < Math.min(20, filas.length) && col === -1; f++) {
    const c = (filas[f] || []).findIndex((v) => esTitulo(String(v ?? "")));
    if (c !== -1) {
      col = c;
      desde = f + 1;
    }
  }
  if (col === -1) {
    col = Math.max(0, (filas.find((f) => (f || []).some((v) => String(v ?? "").trim())) || []).findIndex((v) => String(v ?? "").trim()));
  }
  return filas
    .slice(desde)
    .map((f) => String((f || [])[col] ?? "").trim())
    .filter((s) => s && !esTitulo(s));
}

export default function SubirSeriales({
  recepcionId,
  itemId,
  producto,
  contenedorId,
  onListo,
  onCerrar,
}: {
  recepcionId: number;
  itemId: number;
  producto: string;
  /** El contenedor que descarga este telefono (mientras se cuenta). */
  contenedorId: number | null;
  /** Se cargaron seriales: la pantalla recarga la recepcion. */
  onListo: () => void;
  onCerrar: () => void;
}) {
  const t = useTranslations("recepcion.subir_seriales");
  const [texto, setTexto] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const seriales = separar(texto).filter((s) => !esTitulo(s));
  const unicos = new Set(seriales.map((s) => s.toUpperCase().replace(/\s+/g, ""))).size;

  const leerArchivo = async (archivo: File) => {
    setError(null);
    setResultado(null);
    setLeyendo(true);
    try {
      const leidos = /\.(xlsx|xls)$/i.test(archivo.name) ? await serialesDeExcel(archivo) : separar(await archivo.text());
      if (!leidos.length) {
        setError(t("archivo_vacio"));
        return;
      }
      setTexto(leidos.join("\n"));
    } catch {
      setError(t("archivo_error"));
    } finally {
      setLeyendo(false);
    }
  };

  const cargar = async () => {
    setError(null);
    setResultado(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/recepcion/${recepcionId}/seriales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, seriales, contenedor_id: contenedorId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || t("error"));
      setResultado(j);
      if (j.agregados > 0) {
        setTexto("");
        onListo();
      }
    } catch (e: any) {
      setError(e?.message || t("error"));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{t("titulo")}</p>
          <p className="text-[11px] text-slate-500 truncate">{producto}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t("cerrar")}
          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[11px] text-slate-600">{t("ayuda")}</p>
      <label
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 ${
          leyendo || enviando ? "opacity-40 pointer-events-none" : "cursor-pointer hover:bg-slate-50"
        }`}
      >
        {leyendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        {t("archivo")}
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void leerArchivo(f);
          }}
        />
      </label>
      <textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
        rows={6}
        spellCheck={false}
        placeholder={t("placeholder")}
        aria-label={t("titulo")}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">
          {t("contador", { count: seriales.length })}
          {unicos < seriales.length && ` · ${t("repetidos_lista", { count: seriales.length - unicos })}`}
        </span>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={enviando || seriales.length === 0}
          className="ml-auto inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-40"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {t("cargar", { count: unicos })}
        </button>
      </div>
      {resultado && (
        <div className="space-y-1 text-[11px]">
          <p className="font-semibold text-emerald-700">{t("agregados", { count: resultado.agregados })}</p>
          {resultado.repetidos.length > 0 && (
            <p className="text-amber-800">
              {t("ya_estaban", { count: resultado.repetidos.length, lista: resultado.repetidos.slice(0, 10).join(", ") })}
            </p>
          )}
          {resultado.sobran.length > 0 && (
            <p className="text-red-700">
              {t("sobran", { count: resultado.sobran.length, lista: resultado.sobran.slice(0, 10).join(", ") })}
            </p>
          )}
          {resultado.en_otro.length > 0 && (
            <p className="text-amber-800">
              {t("en_otro", {
                count: resultado.en_otro.length,
                lista: resultado.en_otro
                  .slice(0, 10)
                  .map((x) => `${x.serial} (${x.referencia})`)
                  .join(", "),
              })}
            </p>
          )}
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
