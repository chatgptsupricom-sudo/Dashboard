"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileArchive, FileText, Images, Loader2 } from "lucide-react";
import {
  descargarIndividuales,
  descargarPdf,
  descargarZip,
  type FlyerADescargar,
  type ResultadoDescarga,
} from "@/lib/banco-imagenes/descargas";

type Modo = "individuales" | "pdf" | "zip";

interface Props {
  /** Arma la lista a descargar en el momento del clic (con o sin precio). */
  obtenerFlyers: (conPrecio: boolean) => FlyerADescargar[];
  /** Texto del botón */
  etiqueta?: string;
  className?: string;
  /** Si el aviso de "no se bajaron todos" va debajo del botón (true) o al lado. */
  avisoEnBloque?: boolean;
}

/**
 * Menú para bajar varios flyers de una vez: cada uno como PNG, todos en un PDF
 * (una página por flyer) o todos en un .zip. Si el navegador frena las
 * descargas sueltas, ofrece el .zip.
 */
export default function DescargaMultiple({ obtenerFlyers, etiqueta = "Descargar", className, avisoEnBloque }: Props) {
  const [conPrecio, setConPrecio] = useState(true);
  const [trabajando, setTrabajando] = useState<{ modo: Modo; hechos: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; ofrecerZip: boolean } | null>(null);

  const ejecutar = async (modo: Modo) => {
    const flyers = obtenerFlyers(conPrecio);
    if (flyers.length === 0 || trabajando) return;
    setAviso(null);
    setTrabajando({ modo, hechos: 0, total: flyers.length });
    const progreso = (hechos: number, total: number) => setTrabajando({ modo, hechos, total });
    let r: ResultadoDescarga;
    try {
      r =
        modo === "individuales"
          ? await descargarIndividuales(flyers, progreso)
          : modo === "pdf"
            ? await descargarPdf(flyers, progreso)
            : await descargarZip(flyers, progreso);
    } catch (e) {
      console.error("Descarga de flyers:", e);
      setAviso({ texto: "No se pudo generar la descarga.", ofrecerZip: false });
      setTrabajando(null);
      return;
    }
    setTrabajando(null);

    const partes: string[] = [];
    if (r.fallidos.length > 0) {
      partes.push(
        `${r.fallidos.length} flyer${r.fallidos.length > 1 ? "s" : ""} no se pudo cargar: ${r.fallidos.slice(0, 5).join(", ")}${r.fallidos.length > 5 ? "…" : ""}.`
      );
    }
    // No hay forma de saber si el navegador bloqueó las descargas seguidas:
    // se avisa siempre que fueron varias, con el .zip a mano.
    if (modo === "individuales" && r.ok > 1) {
      partes.push("Si el navegador bloqueó alguna descarga, bájalos en un .zip.");
    }
    if (partes.length > 0) setAviso({ texto: partes.join(" "), ofrecerZip: modo === "individuales" && r.ok > 1 });
  };

  const textoTrabajando = trabajando
    ? `${trabajando.modo === "pdf" ? "Armando PDF" : trabajando.modo === "zip" ? "Armando .zip" : "Descargando"} ${trabajando.hechos}/${trabajando.total}`
    : null;

  return (
    <div className={avisoEnBloque ? "space-y-2" : "flex items-center gap-2"}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={!!trabajando} className={className}>
            {trabajando ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
            {textoTrabajando ?? etiqueta}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs text-slate-500">Descargar seleccionados</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={conPrecio}
            onCheckedChange={(v) => setConPrecio(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            Con precio
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => ejecutar("individuales")}>
            <Images className="w-4 h-4 mr-2" />
            <div>
              <p className="text-sm">Individuales</p>
              <p className="text-[11px] text-slate-500">Cada flyer en su propio PNG</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ejecutar("pdf")}>
            <FileText className="w-4 h-4 mr-2" />
            <div>
              <p className="text-sm">Un PDF</p>
              <p className="text-[11px] text-slate-500">Una página por flyer</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => ejecutar("zip")}>
            <FileArchive className="w-4 h-4 mr-2" />
            <div>
              <p className="text-sm">Agrupados (.zip)</p>
              <p className="text-[11px] text-slate-500">Todos los PNG en un archivo</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {aviso && (
        <p className={`text-[11px] text-slate-600 ${avisoEnBloque ? "" : "max-w-xs"}`}>
          {aviso.texto}{" "}
          {aviso.ofrecerZip && (
            <button onClick={() => ejecutar("zip")} className="font-semibold underline hover:no-underline">
              Bajar .zip
            </button>
          )}{" "}
          <button onClick={() => setAviso(null)} className="text-slate-400 hover:text-slate-600">
            Cerrar
          </button>
        </p>
      )}
    </div>
  );
}
