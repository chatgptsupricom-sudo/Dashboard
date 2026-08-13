"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BrandProduct {
  code: string;
  name: string;
  qty: number;
}

interface BrandData {
  name: string;
  qty: number;
  products: BrandProduct[];
}

interface CategoryData {
  name: string;
  qty: number;
}

interface ProductStatsProps {
  brands: BrandData[];
  categories: CategoryData[];
  loading?: boolean;
}

const PALETTES = [
  { bubble: "#3b82f6", light: "#60a5fa", glow: "rgba(59,130,246,0.35)", bg: "#eff6ff", text: "#1e40af" },
  { bubble: "#8b5cf6", light: "#a78bfa", glow: "rgba(139,92,246,0.35)", bg: "#f5f3ff", text: "#6d28d9" },
  { bubble: "#10b981", light: "#34d399", glow: "rgba(16,185,129,0.35)", bg: "#ecfdf5", text: "#047857" },
  { bubble: "#f97316", light: "#fb923c", glow: "rgba(249,115,22,0.35)", bg: "#fff7ed", text: "#c2410c" },
  { bubble: "#f43f5e", light: "#fb7185", glow: "rgba(244,63,94,0.35)", bg: "#fff1f2", text: "#be123c" },
  { bubble: "#06b6d4", light: "#22d3ee", glow: "rgba(6,182,212,0.35)", bg: "#ecfeff", text: "#0e7490" },
  { bubble: "#eab308", light: "#facc15", glow: "rgba(234,179,8,0.35)", bg: "#fefce8", text: "#a16207" },
  { bubble: "#6366f1", light: "#818cf8", glow: "rgba(99,102,241,0.35)", bg: "#eef2ff", text: "#4338ca" },
  { bubble: "#14b8a6", light: "#2dd4bf", glow: "rgba(20,184,166,0.35)", bg: "#f0fdfa", text: "#0f766e" },
  { bubble: "#ec4899", light: "#f472b6", glow: "rgba(236,72,153,0.35)", bg: "#fdf2f8", text: "#be185d" },
  { bubble: "#84cc16", light: "#a3e635", glow: "rgba(132,204,22,0.35)", bg: "#f7fee7", text: "#4d7c0f" },
  { bubble: "#d946ef", light: "#e879f9", glow: "rgba(217,70,239,0.35)", bg: "#fdf4ff", text: "#a21caf" },
  { bubble: "#0ea5e9", light: "#38bdf8", glow: "rgba(14,165,233,0.35)", bg: "#f0f9ff", text: "#0369a1" },
  { bubble: "#7c3aed", light: "#a78bfa", glow: "rgba(124,58,237,0.35)", bg: "#f5f3ff", text: "#6d28d9" },
  { bubble: "#ef4444", light: "#f87171", glow: "rgba(239,68,68,0.35)", bg: "#fef2f2", text: "#b91c1c" },
];

function getBubbleSize(qty: number, maxQty: number): number {
  const min = 70;
  const max = 170;
  if (maxQty === 0) return min;
  const ratio = Math.sqrt(qty / maxQty);
  return Math.round(min + ratio * (max - min));
}

export function BrandBubbles({ brands, categories, loading }: ProductStatsProps) {
  const [hoveredBrand, setHoveredBrand] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const handleMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    containerRef.current.addEventListener("mousemove", handleMove);
    return () => containerRef.current?.removeEventListener("mousemove", handleMove);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="h-6 bg-slate-200 rounded w-40 mb-4 animate-pulse"></div>
          <div className="flex flex-wrap gap-4 justify-center items-end h-48">
            {[1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="w-24 h-24 bg-slate-100 rounded-full animate-pulse"></div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="h-6 bg-slate-200 rounded w-40 mb-4 animate-pulse"></div>
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-20 bg-slate-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const maxQty = brands.length > 0 ? brands[0].qty : 0;
  const maxCatQty = categories.length > 0 ? categories[0].qty : 1;

  return (
    <div className="space-y-6">
      {/* ── Brands Bubble Scene ───────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative bg-gradient-to-br from-slate-50 via-white to-slate-100 rounded-2xl border border-slate-200 overflow-visible"
      >
        {/* Parallax orb decorations */}
        <motion.div
          className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-[0.15] blur-3xl pointer-events-none"
          style={{ backgroundColor: "#3b82f6" }}
          animate={{ x: mousePos.x * 0.02, y: mousePos.y * 0.02 }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
        />
        <motion.div
          className="absolute -bottom-20 -right-10 w-72 h-72 rounded-full opacity-[0.12] blur-3xl pointer-events-none"
          style={{ backgroundColor: "#8b5cf6" }}
          animate={{ x: mousePos.x * -0.03, y: mousePos.y * -0.03 }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-2 mb-2 pt-6 px-6">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-slate-900">Marcas más vendidas</h3>
        </div>

        {/* Bubble container */}
        <div className="relative px-6 pb-32 pt-2 min-h-[260px]">
          <div className="relative flex flex-wrap gap-3 justify-center items-end">
            {brands.map((brand, idx) => {
              const palette = PALETTES[idx % PALETTES.length];
              const size = getBubbleSize(brand.qty, maxQty);
              const isHovered = hoveredBrand === idx;
              const anyHovered = hoveredBrand !== null;
              const dim = anyHovered && !isHovered ? 0.2 : 1;
              const productsCount = brand.products.length;

              return (
                <div key={brand.name} className="relative flex flex-col items-center" style={{ zIndex: isHovered ? 30 : 10 }}>
                  {isHovered && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1.6, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute rounded-full pointer-events-none"
                      style={{ width: size, height: size, boxShadow: `0 0 60px ${palette.glow}` }}
                    />
                  )}

                  <motion.div
                    className="relative cursor-pointer rounded-full flex items-center justify-center text-white select-none"
                    style={{
                      width: size,
                      height: size,
                      background: `radial-gradient(circle at 30% 30%, ${palette.light}, ${palette.bubble})`,
                      boxShadow: `0 8px 24px ${palette.glow}, inset 0 -4px 12px rgba(0,0,0,0.15), inset 0 4px 8px rgba(255,255,255,0.2)`,
                    }}
                    initial={{ scale: 0, y: 40, opacity: 0 }}
                    animate={{
                      scale: 1,
                      y: isHovered ? -14 : [0, -6, 0],
                      opacity: dim,
                    }}
                    transition={{
                      scale: { type: "spring", stiffness: 260, damping: 20, delay: idx * 0.05 },
                      y: isHovered
                        ? { type: "spring", stiffness: 300, damping: 20 }
                        : { duration: 3 + idx * 0.3, repeat: Infinity, ease: "easeInOut", delay: idx * 0.1 },
                      opacity: { duration: 0.3 },
                    }}
                    whileHover={{ scale: 1.12 }}
                    onMouseEnter={() => setHoveredBrand(idx)}
                    onMouseLeave={() => setHoveredBrand(null)}
                  >
                    <div
                      className="absolute inset-0 rounded-full opacity-50 pointer-events-none"
                      style={{ background: "radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.6) 0%, transparent 50%)" }}
                    />
                    <div className="relative px-1 text-center">
                      <div className="font-extrabold uppercase tracking-wide leading-tight" style={{ fontSize: Math.max(9, size / 9) }}>
                        {brand.name.length > 11 ? brand.name.slice(0, 10) + "…" : brand.name}
                      </div>
                      <div className="font-semibold opacity-80 mt-0.5" style={{ fontSize: Math.max(8, size / 14) }}>
                        {brand.qty.toLocaleString()} uds
                      </div>
                    </div>
                  </motion.div>

                  {/* Root products growing from bubble */}
                  <AnimatePresence>
                    {isHovered && productsCount > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full left-1/2 -translate-x-1/2 z-40 pointer-events-none pt-0"
                      >
                        {/* SVG roots from bubble downward */}
                        <svg width="300" height="80" viewBox="0 0 300 80" className="overflow-visible block mx-auto">
                          {/* Central trunk */}
                          <motion.path
                            d={`M 150 0 L 150 35`}
                            stroke={palette.bubble}
                            strokeWidth="2.5"
                            fill="none"
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.15 }}
                          />
                          {/* Branches from trunk to product pills */}
                          {brand.products.slice(0, 8).map((_, pIdx) => {
                            const total = Math.min(productsCount, 8);
                            const spacing = 270 / (total + 1);
                            const x = 15 + spacing * (pIdx + 1);
                            return [
                              <motion.path
                                key={`branch-${pIdx}`}
                                d={`M 150 35 Q ${(150 + x) / 2} 50 ${x} 72`}
                                stroke={palette.bubble}
                                strokeWidth="1.5"
                                fill="none"
                                strokeLinecap="round"
                                opacity={0.45}
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ delay: 0.1 + pIdx * 0.05, duration: 0.2 }}
                              />,
                              <motion.circle
                                key={`node-${pIdx}`}
                                cx={x}
                                cy={72}
                                r="3"
                                fill={palette.bubble}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.15 + pIdx * 0.05, type: "spring", stiffness: 300 }}
                              />,
                            ];
                          })}
                        </svg>

                        {/* Product pills row */}
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex flex-wrap gap-1.5 justify-center max-w-[360px] -mt-3"
                        >
                          {brand.products.slice(0, 10).map((product, pIdx) => (
                            <motion.div
                              key={product.code || pIdx}
                              initial={{ opacity: 0, scale: 0.5, y: -6 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.5, y: -6 }}
                              transition={{ delay: 0.25 + pIdx * 0.04, type: "spring", stiffness: 400, damping: 24 }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-md border whitespace-nowrap"
                              style={{
                                backgroundColor: `rgba(255,255,255,0.85)`,
                                borderColor: `${palette.bubble}40`,
                                boxShadow: `0 2px 8px ${palette.glow}`,
                              }}
                            >
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: palette.bubble }} />
                              <span className="text-[10px] font-semibold text-slate-700 truncate max-w-[110px]">
                                {product.code || "—"}
                              </span>
                              <span className="text-[10px] font-bold shrink-0" style={{ color: palette.text }}>
                                {product.qty}
                              </span>
                            </motion.div>
                          ))}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Categories ─────────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-slate-50 via-white to-slate-50 rounded-2xl border border-slate-200 p-6 overflow-hidden">
        <motion.div
          className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.08] blur-2xl pointer-events-none"
          style={{ backgroundColor: "#10b981" }}
          animate={{ x: mousePos.x * 0.01, y: mousePos.y * 0.01 }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
        />

        <div className="relative z-10 flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-slate-900">Categorías más vendidas</h3>
        </div>
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {categories.map((cat, idx) => {
            const palette = PALETTES[idx % PALETTES.length];
            const pct = Math.round((cat.qty / maxCatQty) * 100);
            return (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: idx * 0.04, type: "spring", stiffness: 200, damping: 22 }}
                whileHover={{ y: -4, scale: 1.03 }}
                className="relative rounded-2xl p-4 border backdrop-blur-sm cursor-default overflow-hidden"
                style={{
                  backgroundColor: `${palette.bg}80`,
                  borderColor: `${palette.bubble}30`,
                }}
              >
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
                  <motion.div
                    className="h-full"
                    style={{ backgroundColor: palette.bubble }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.3 + idx * 0.05, duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full opacity-20 blur-md" style={{ backgroundColor: palette.bubble }} />
                <p className="text-xs font-semibold truncate" style={{ color: palette.text }}>{cat.name}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{cat.qty.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">unidades vendidas</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}