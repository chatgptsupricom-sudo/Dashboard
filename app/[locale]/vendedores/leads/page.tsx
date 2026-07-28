"use client";
import { BoardTab } from "@/components/leads/KanbanBoard";
import { useAuthStore } from "@/lib/stores/auth.store";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VendedoresLeadsPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const sellerActivo = (user as any)?.activo;

  useEffect(() => {
    if (sellerActivo === 0) {
      router.replace("/vendedores");
    }
  }, [sellerActivo, router]);

  if (sellerActivo === 0) {
    return (
      <div className="p-10 text-center text-slate-400 font-medium">
        No tienes acceso a esta sección. Contacta a tu administrador.
      </div>
    );
  }

  return (
    <main>
      <BoardTab userRole="VENDEDOR" />
    </main>
  );
}
