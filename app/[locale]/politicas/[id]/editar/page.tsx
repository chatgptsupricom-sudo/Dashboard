"use client";

import { EditorPolitica } from "@/components/politicas/EditorPolitica";
import { useParams } from "next/navigation";

export default function EditarPoliticaPage() {
  const { id } = useParams<{ id: string }>();
  return <EditorPolitica id={Number(id)} />;
}
