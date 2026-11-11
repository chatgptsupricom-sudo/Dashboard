"use client";

import { EditorManual } from "@/components/manuales/EditorManual";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Nuevo() {
  const tipo = useSearchParams().get("tipo") === "tutorial" ? "tutorial" : "manual";
  return <EditorManual id={null} tipoInicial={tipo} />;
}

export default function NuevoManualPage() {
  return (
    <Suspense>
      <Nuevo />
    </Suspense>
  );
}
