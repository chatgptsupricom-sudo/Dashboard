"use client";

import { VistaManual } from "@/components/manuales/VistaManual";
import type { Manual } from "@/lib/manuales/datos";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ArrowLeft, Loader2, Pencil, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ManualPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const { user } = useAuthStore();
  const esSuper = String(user?.role || "").toLowerCase().trim() === "superadmin";
  const [manual, setManual] = useState<Manual | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/manuales/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j) => setManual(j.manual))
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="space-y-4 p-4 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/${locale}/manuales`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Manuales
        </Link>
        {manual && (
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            {esSuper && (
              <Link
                href={`/${locale}/manuales/${id}/editar`}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Pencil className="h-4 w-4" /> Editar
              </Link>
            )}
          </div>
        )}
      </div>
      {error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!manual && !error && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      {manual && <VistaManual manual={manual} />}
    </div>
  );
}
