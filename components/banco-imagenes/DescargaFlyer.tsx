"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { descargarFlyer, type FlyerADescargar } from "@/lib/banco-imagenes/descargas";

interface Props {
  /** Arma el flyer en el momento del clic (con o sin precio); null = nada abierto. */
  obtenerFlyer: (conPrecio: boolean) => FlyerADescargar | null;
  /** Colores del botón "Descargar con Precio" */
  claseConPrecio: string;
}

/**
 * Botones "Descargar con/sin Precio" del editor. Armar el PNG tarda unos
 * segundos en el celular: mientras tanto el botón muestra un loader y los dos
 * quedan deshabilitados; si falla, se avisa debajo (antes solo iba a la consola).
 */
export default function DescargaFlyer({ obtenerFlyer, claseConPrecio }: Props) {
  const [descargando, setDescargando] = useState<"con" | "sin" | null>(null);
  const [error, setError] = useState(false);

  const descargar = async (conPrecio: boolean) => {
    const flyer = obtenerFlyer(conPrecio);
    if (!flyer || descargando) return;
    setError(false);
    setDescargando(conPrecio ? "con" : "sin");
    try {
      await descargarFlyer(flyer);
    } catch (e) {
      console.error("Descarga de flyer:", e);
      setError(true);
    } finally {
      setDescargando(null);
    }
  };

  const icono = (cual: "con" | "sin") =>
    descargando === cual ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />;

  return (
    <>
      <Button
        onClick={() => descargar(true)}
        disabled={!!descargando}
        className={`w-full text-white h-11 text-sm font-semibold ${claseConPrecio}`}
      >
        {icono("con")}
        {descargando === "con" ? "Generando flyer…" : "Descargar con Precio"}
      </Button>
      <Button onClick={() => descargar(false)} disabled={!!descargando} variant="outline" className="w-full h-11 text-sm">
        {icono("sin")}
        {descargando === "sin" ? "Generando flyer…" : "Descargar sin Precio"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600 text-center">
          No se pudo descargar el flyer. Intenta de nuevo; si sigue fallando, ábrelo en el navegador del teléfono (no
          desde WhatsApp o Instagram).
        </p>
      )}
    </>
  );
}
