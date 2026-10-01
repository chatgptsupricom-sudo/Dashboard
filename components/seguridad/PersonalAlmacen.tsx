"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import MercanciaCatalogoNombre from "./MercanciaCatalogoNombre";
import { PageHeader } from "./mercancia-ui";

/**
 * Personal de Almacen: almacenistas y choferes en una sola seccion.
 *
 * Los registra solo Almacen (la API rechaza el alta de cualquier otro rol).
 * Seguridad no administra esta lista: solo la elige en el formulario de
 * mercancia.
 */
export default function PersonalAlmacen({ volverA }: { volverA: string }) {
  const tp = useTranslations("seguridad.mercancia.personal_almacen");
  const ta = useTranslations("seguridad.mercancia.almacenistas_catalogo");
  const tc = useTranslations("seguridad.mercancia.choferes_catalogo");

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={Users}
        titulo={tp("titulo")}
        subtitulo={tp("subtitulo")}
        volverA={volverA}
      />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        <MercanciaCatalogoNombre
          embebido
          endpoint="/api/seguridad/mercancia/catalogo/almacenistas"
          listKey="almacenistas"
          namespace="seguridad.mercancia.almacenistas_catalogo"
          titulo={ta("titulo")}
          subtitulo={ta("subtitulo")}
          campoLabel={ta("campo")}
          campoPlaceholder={ta("campo_ph")}
          vacioTexto={ta("vacio")}
          errorTexto={ta("error")}
        />
        <MercanciaCatalogoNombre
          embebido
          endpoint="/api/seguridad/mercancia/catalogo/choferes"
          listKey="choferes"
          namespace="seguridad.mercancia.choferes_catalogo"
          titulo={tc("titulo")}
          subtitulo={tc("subtitulo")}
          campoLabel={tc("campo")}
          campoPlaceholder={tc("campo_ph")}
          vacioTexto={tc("vacio")}
          errorTexto={tc("error")}
        />
      </main>
    </div>
  );
}
