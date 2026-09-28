"use client";

import { InventarioCasos } from "@/components/rma/InventarioCasos";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

// useSearchParams (dentro de InventarioCasos) necesita un Suspense para el build.
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <InventarioCasos procedencia="supricom" />
    </Suspense>
  );
}
