import type { Metadata } from "next";
import { SorteoCaracas } from "@/components/sorteo/SorteoCaracas";

/**
 * Sorteo de clientes de Caracas, página PÚBLICA (sin login). No está en
 * `isProtectedPath` de middleware.ts y es ruta pública en
 * components/providers/auth-provider.tsx. Qué datos expone: ver /api/sorteo.
 */
export const metadata: Metadata = {
  title: "Gran Sorteo Supricom · Caracas",
  description: "Ruleta del sorteo de clientes de Supricom Caracas: cada $5.000 en compras es 1 ticket.",
  robots: { index: false, follow: false },
};

export default function SorteoPublicoPage() {
  return <SorteoCaracas modo="publico" />;
}
