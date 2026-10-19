"use client";

// Recompra de clientes de leads + los leads de Excel de antes del panel.
// Se entra desde Cierres; vive bajo /adminleads para heredar el guard de rol.

import LeadsHistoricos from "@/components/leads/LeadsHistoricos";
import LeadsPorRevisar from "@/components/leads/LeadsPorRevisar";
import RecompraClientes from "@/components/leads/RecompraClientes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export default function RecompraPage() {
  const [tab, setTab] = useState("recompra");
  const [porRevisar, setPorRevisar] = useState<number | null>(null);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Recompra de clientes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Cuántas veces volvió a comprar cada cliente después de la primera venta que cerró un lead.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 rounded-2xl">
          <TabsTrigger value="recompra" className="rounded-xl">Recompra</TabsTrigger>
          <TabsTrigger value="excel" className="rounded-xl">Leads de Excel</TabsTrigger>
          <TabsTrigger value="revisar" className="rounded-xl">
            Por revisar{porRevisar ? ` (${porRevisar})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recompra">
          <RecompraClientes onVerSinRif={() => setTab("revisar")} />
        </TabsContent>
        <TabsContent value="excel">
          <LeadsHistoricos />
        </TabsContent>
        <TabsContent value="revisar">
          <LeadsPorRevisar onCambio={setPorRevisar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
