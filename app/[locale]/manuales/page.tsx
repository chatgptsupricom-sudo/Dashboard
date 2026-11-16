"use client";

import { ListaManuales } from "@/components/manuales/ListaManuales";

// Procesos: todos los manuales y tutoriales. Otro rol: su "Manual" (lo publicado para él).
export default function ManualesPage() {
  return <ListaManuales tipo="manual" />;
}
