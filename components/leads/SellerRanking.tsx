import { motion } from "framer-motion";
import { Award, Medal, Target, Trophy } from "lucide-react";
import React from "react";
import { Lead } from "../types";

interface SellerRankingProps {
  leads: Lead[];
  currentUser: string;
}

export const SellerRanking: React.FC<SellerRankingProps> = ({
  leads,
  currentUser,
}) => {
  const sellerStats = Array.from(
    new Set(leads.map((l) => l.vendedor).filter(Boolean)),
  )
    .map((seller) => {
      const sellerLeads = leads.filter((l) => l.vendedor === seller);
      const closedSales = sellerLeads.filter(
        (l) => l.estatus === "CERRADO_VENTA" || l.estatus === "CERRADO",
      ).length;
      const totalLeads = sellerLeads.length;
      const efficiency = totalLeads > 0 ? (closedSales / totalLeads) * 100 : 0;

      return { name: seller!, closedSales, totalLeads, efficiency };
    })
    .sort((a, b) => b.efficiency - a.efficiency);

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-zinc-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-700" />;
    return (
      <span className="w-6 text-center font-bold text-zinc-400">
        {index + 1}
      </span>
    );
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs mt-6">
      <h3 className="text-lg font-bold text-zinc-950 flex items-center gap-2 mb-6">
        <Target className="w-5 h-5 text-blue-600" />
        Ranking de Efectividad por Vendedor
      </h3>

      <div className="space-y-3">
        {sellerStats.map((seller, index) => (
          <motion.div
            key={seller.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`flex items-center p-3 rounded-xl border ${
              seller.name === currentUser
                ? "bg-blue-50 border-blue-200"
                : "bg-white border-zinc-100"
            }`}
          >
            <div className="w-10 flex items-center justify-center">
              {getRankIcon(index)}
            </div>

            <div className="flex-1">
              <p
                className={`font-semibold text-sm ${seller.name === currentUser ? "text-blue-900" : "text-zinc-800"}`}
              >
                {seller.name}{" "}
                {seller.name === currentUser && (
                  <span className="text-[10px] ml-2 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    Tú
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {seller.closedSales} ventas / {seller.totalLeads} leads
              </p>
            </div>

            <div className="font-bold text-lg text-zinc-900">
              {seller.efficiency.toFixed(1)}
              <span className="text-xs font-normal text-zinc-400 ml-1">%</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
