"use client";

import { EditorManual } from "@/components/manuales/EditorManual";
import { useParams } from "next/navigation";

export default function EditarManualPage() {
  const { id } = useParams<{ id: string }>();
  return <EditorManual id={Number(id)} />;
}
