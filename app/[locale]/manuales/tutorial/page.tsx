"use client";

import { ListaManuales } from "@/components/manuales/ListaManuales";

// "Tutorial" del menú de cada rol: el recorrido por su panel (si hay uno solo, se abre directo).
export default function TutorialPage() {
  return <ListaManuales tipo="tutorial" />;
}
