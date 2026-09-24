"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Keyboard, Loader2, ScanBarcode } from "lucide-react";

/**
 * Campo para la pistola de codigos de barras.
 *
 * La pistola funciona como un teclado: "escribe" lo que lee y pulsa Enter.
 * Este campo tiene que tener el foco para recibirlo (se lo devuelve solo
 * despues de cada lectura). En el telefono o la tablet no abre el teclado de
 * la pantalla (inputMode="none"): con la pistola por Bluetooth o USB-OTG no
 * hace falta, y taparia la mitad de la pantalla. Con el boton del teclado se
 * puede escribir un codigo a mano.
 */

export type ItemPistola = { id: number; codigo: string | null; producto: string; lleva_serial: boolean };

export type ResultadoEscaneo =
  | { resultado: "conteo"; item_id: number; cantidad: number; codigo: string }
  | { resultado: "seleccionado"; item_id: number; codigo: string }
  | {
      resultado: "serial";
      item_id: number;
      cantidad: number;
      serial: { id: number; item_id: number; serial: string; escaneado_por: string | null; created_at: string };
      en_otro_packing_list: string | null;
    };

type Mensaje = { tipo: "ok" | "error" | "aviso"; texto: string };

/** Pitido corto: agudo si salio bien, grave si no (en el patio no se mira la pantalla). */
function pitar(bien: boolean) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = bien ? 1400 : 300;
    gan.gain.value = 0.05;
    osc.connect(gan);
    gan.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (bien ? 0.08 : 0.35));
    osc.onended = () => ctx.close();
  } catch {
    // Sin audio: solo el aviso en pantalla.
  }
}

export default function Pistola({
  recepcionId,
  items,
  seleccionado,
  onResultado,
}: {
  recepcionId: number;
  items: ItemPistola[];
  seleccionado: number | null;
  onResultado: (r: ResultadoEscaneo) => void;
}) {
  const t = useTranslations("recepcion");
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [teclado, setTeclado] = useState(false);
  const [conFoco, setConFoco] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  // Codigo que no se reconocio: se pregunta de que producto es.
  const [desconocido, setDesconocido] = useState<string | null>(null);

  const producto = (id: number | null) => items.find((i) => i.id === id) || null;
  const activo = producto(seleccionado);

  const enfocar = () => {
    setTimeout(() => campo.current?.focus(), 0);
  };
  // Al elegir un producto con serial, el campo queda listo para pistolear.
  useEffect(() => {
    enfocar();
  }, [seleccionado]);

  const enviar = async (codigo: string, extra: Record<string, unknown> = {}) => {
    const limpio = codigo.trim();
    if (!limpio) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/recepcion/${recepcionId}/escaneo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: limpio, item_id: seleccionado, ...extra }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.resultado === "repetido") {
        pitar(false);
        setMensaje({
          tipo: "error",
          texto: t("pistola_repetido", { serial: j.serial, producto: producto(j.item_id)?.producto || "" }),
        });
        return;
      }
      if (!res.ok) {
        pitar(false);
        setMensaje({ tipo: "error", texto: j.error || t("error") });
        return;
      }
      if (j.resultado === "desconocido") {
        pitar(false);
        setDesconocido(j.codigo);
        setMensaje(null);
        return;
      }
      pitar(true);
      onResultado(j as ResultadoEscaneo);
      const p = producto(j.item_id);
      if (j.resultado === "conteo") {
        setMensaje({ tipo: "ok", texto: t("pistola_conteo", { producto: p?.producto || "", cantidad: j.cantidad }) });
      } else if (j.resultado === "seleccionado") {
        setMensaje({ tipo: "ok", texto: t("pistola_seleccionado", { producto: p?.producto || "" }) });
      } else if (j.resultado === "serial") {
        setMensaje(
          j.en_otro_packing_list
            ? {
                tipo: "aviso",
                texto: t("pistola_serial_en_otro", {
                  serial: j.serial.serial,
                  cantidad: j.cantidad,
                  referencia: j.en_otro_packing_list,
                }),
              }
            : { tipo: "ok", texto: t("pistola_serial", { serial: j.serial.serial, cantidad: j.cantidad }) },
        );
      }
    } catch {
      pitar(false);
      setMensaje({ tipo: "error", texto: t("error") });
    } finally {
      setEnviando(false);
      enfocar();
    }
  };

  const leer = () => {
    const c = texto;
    setTexto("");
    void enviar(c);
  };

  // Respuesta a "¿de que producto es?".
  const asignar = async (item: ItemPistola, comoSerial: boolean) => {
    const codigo = desconocido;
    setDesconocido(null);
    if (!codigo) return;
    if (comoSerial) {
      // Es un serial de ese producto: se selecciona y se vuelve a mandar.
      onResultado({ resultado: "seleccionado", item_id: item.id, codigo });
      await enviar(codigo, { item_id: item.id });
    } else {
      // Es el codigo de la caja de ese producto: se aprende.
      await enviar(codigo, { aprender_item_id: item.id });
    }
  };

  const estilos: Record<Mensaje["tipo"], string> = {
    ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
    error: "bg-red-50 text-red-700 border-red-200",
    aviso: "bg-amber-50 text-amber-800 border-amber-200",
  };

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className={`relative flex-1 flex items-center gap-2 h-11 px-3 rounded-lg border bg-white ${
            conFoco ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-200"
          }`}
          onClick={enfocar}
        >
          <ScanBarcode className={`w-5 h-5 shrink-0 ${conFoco ? "text-violet-600" : "text-slate-400"}`} />
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                leer();
              }
            }}
            onFocus={() => setConFoco(true)}
            onBlur={() => setConFoco(false)}
            inputMode={teclado ? "text" : "none"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={conFoco ? t("pistola_lista") : t("pistola_tocar")}
            aria-label={t("pistola_titulo")}
            className="flex-1 min-w-0 bg-transparent text-sm font-mono focus:outline-none"
          />
          {enviando && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>
        <button
          type="button"
          onClick={() => {
            setTeclado((v) => !v);
            enfocar();
          }}
          aria-pressed={teclado}
          title={t("pistola_teclado")}
          className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border ${
            teclado ? "border-violet-400 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500"
          }`}
        >
          <Keyboard className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-slate-600">
        {activo ? (
          <>
            {t("pistola_activo")}: <span className="font-semibold text-violet-700">{activo.producto}</span>
          </>
        ) : (
          t("pistola_ayuda")
        )}
      </p>

      {mensaje && (
        <p role="status" className={`text-xs font-medium rounded-lg border px-3 py-2 ${estilos[mensaje.tipo]}`}>
          {mensaje.texto}
        </p>
      )}

      {desconocido && (
        <div className="rounded-lg border border-amber-300 bg-white p-3 space-y-2">
          <p className="text-sm text-slate-800">
            {t("pistola_desconocido", { codigo: desconocido })}
          </p>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {items.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate">{i.producto}</p>
                  <p className="text-[11px] text-slate-400">{i.codigo || "—"}</p>
                </div>
                {i.lleva_serial && (
                  <button
                    type="button"
                    onClick={() => void asignar(i, true)}
                    className="h-8 px-2.5 rounded-md bg-violet-600 text-white text-xs font-semibold"
                  >
                    {t("pistola_es_serial")}
                  </button>
                )}
                {i.codigo && (
                  <button
                    type="button"
                    onClick={() => void asignar(i, false)}
                    className="h-8 px-2.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-700"
                  >
                    {t("pistola_es_codigo")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setDesconocido(null);
              enfocar();
            }}
            className="text-xs font-semibold text-slate-500 hover:underline"
          >
            {t("pistola_ignorar")}
          </button>
        </div>
      )}
    </div>
  );
}
