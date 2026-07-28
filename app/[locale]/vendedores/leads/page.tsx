"use client";
import { BoardTab } from "@/components/leads/KanbanBoard";

export default function VendedoresLeadsPage() {
  return (
    <main>
      <BoardTab userRole="VENDEDOR" />
    </main>
  );
}
