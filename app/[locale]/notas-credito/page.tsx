"use client";

import { NotasCredito } from "@/components/notas-credito/NotasCredito";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

/** Notas de crédito con aprobación en cadena (lib/notas-credito). Entra quien tenga un paso, y el SuperAdmin. */
export default function NotasCreditoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <NotasCredito />
    </Suspense>
  );
}
