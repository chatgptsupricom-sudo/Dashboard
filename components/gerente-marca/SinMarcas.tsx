"use client";

import { Award, LifeBuoy } from "lucide-react";

/**
 * Lo único que ve un Gerente de Marca mientras el SuperAdmin no le asigna
 * marcas (Gerencia de Marca › Configuración). Sin marcas todas sus pantallas
 * saldrían vacías, así que el layout muestra esto en su lugar.
 */
export function SinMarcas() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          <Award className="text-amber-500" size={32} />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">¡Ups!</h1>
        <p className="text-slate-600">
          Todavía no tienes marcas asignadas en el panel.
        </p>
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl px-4 py-3">
          <LifeBuoy size={16} className="shrink-0" />
          Comunícate con soporte para que te asignen tus marcas.
        </p>
        <p className="text-xs text-slate-400">
          Cuando te las asignen, recarga la página para ver tu inventario, antigüedad, ventas y flyers.
        </p>
      </div>
    </div>
  );
}
