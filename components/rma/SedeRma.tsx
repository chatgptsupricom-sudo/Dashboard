"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "@/lib/stores/auth.store";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";

/**
 * Sede que mira el SuperAdmin en las pantallas de RMA. Las APIs de RMA
 * filtran con `?company_id=`; sin elegir (null) ve todas las sedes juntas.
 * Se guarda en localStorage para que se mantenga al cambiar de pantalla.
 */
const useSedeRmaStore = create<{ companyId: number | null; setCompanyId: (v: number | null) => void }>()(
  persist((set) => ({ companyId: null, setCompanyId: (companyId) => set({ companyId }) }), {
    name: "rma-sede",
  }),
);

function esSuperAdmin(user: any): boolean {
  return String(user?.role || "").toLowerCase().trim() === "superadmin";
}

/** Sede elegida por el SuperAdmin; null para los demás roles o con "Todas". */
export function useSedeRma(): number | null {
  const { user } = useAuthStore();
  const companyId = useSedeRmaStore((s) => s.companyId);
  return esSuperAdmin(user) ? companyId : null;
}

/** Agrega `company_id` a la URL de una API de RMA si hay sede elegida. */
export function conSede(url: string, companyId: number | null): string {
  if (!companyId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}company_id=${companyId}`;
}

/** Botones de sede arriba de las pantallas de RMA, solo para el SuperAdmin. */
export function SelectorSedeRma() {
  const { user } = useAuthStore();
  const { companyId, setCompanyId } = useSedeRmaStore();
  if (!esSuperAdmin(user)) return null;

  const opciones: [number | null, string][] = [
    [null, "Todas las sedes"],
    ...Object.entries(NOMBRES_SUCURSAL).map(([id, nombre]) => [Number(id), nombre] as [number, string]),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-8 pt-4" role="group" aria-label="Sede">
      <span className="text-xs font-medium text-slate-500">Sede:</span>
      {opciones.map(([id, nombre]) => (
        <button
          key={nombre}
          type="button"
          onClick={() => setCompanyId(id)}
          aria-pressed={companyId === id}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            companyId === id
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {nombre}
        </button>
      ))}
    </div>
  );
}
