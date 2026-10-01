"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface AnimatedBackgroundProps {
  effect?: "curves" | "geometry" | "toggle";
}

export function AnimatedBackground({
  effect = "curves",
}: AnimatedBackgroundProps) {
  const [showGeometry, setShowGeometry] = useState(false);

  if (effect === "toggle") {
    return (
      <div className="relative w-full h-full overflow-hidden">
        {showGeometry ? <GeometryEffect /> : <CurvesEffect />}

        {/* Toggle Button */}
        <button
          onClick={() => setShowGeometry(!showGeometry)}
          className="absolute bottom-4 right-4 text-xs text-gray-400 hover:text-gray-600 transition opacity-50 hover:opacity-100 z-10"
          title="Toggle background effect"
        >
          {showGeometry ? "✓ 3D" : "✓ Curves"}
        </button>
      </div>
    );
  }

  return effect === "geometry" ? <GeometryEffect /> : <CurvesEffect />;
}

function CurvesEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f8fafc]">
      {/* Mancha azul vibrante con movimiento dinámico por toda la pantalla */}
      <motion.div
        className="absolute w-[85%] h-[85%] rounded-full bg-gradient-to-br from-blue-600 via-blue-400 to-transparent opacity-70 blur-[110px]"
        animate={{
          // Trayectoria que cubre extremos y centro
          x: ["-25%", "45%", "0%", "-15%", "40%", "-25%"],
          y: ["-15%", "10%", "45%", "50%", "-20%", "-15%"],
          // Rotación para evitar que se vea estático
          rotate: [0, 90, 180, 270, 360],
          // Pulso sutil de tamaño
          scale: [1, 1.15, 0.95, 1.1, 1],
        }}
        transition={{
          // 14 segundos: el balance justo entre "suave" y "dinámico"
          duration: 14,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Líneas topográficas decorativas para dar textura */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
        viewBox="0 0 1200 800"
      >
        <path
          d="M0 150 Q 350 200 700 80 T 1200 150 M0 350 Q 350 400 700 280 T 1200 350"
          stroke="currentColor"
          fill="transparent"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function GeometryEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Fondo base azul oscuro */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100" />

      {/* Formas geométricas flotantes */}
      <motion.div
        className="absolute top-1/3 right-1/4 w-64 h-64"
        animate={{
          rotate: [0, 360],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: "#1e6efd", stopOpacity: 0.4 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "#87cfff", stopOpacity: 0.2 }}
              />
            </linearGradient>
          </defs>

          {/* Octaedro de cristal */}
          <motion.g
            animate={{
              scale: [1, 1.1, 1],
              rotateX: [0, 360],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Cuerpo principal */}
            <polygon
              points="100,20 180,100 100,180 20,100"
              fill="url(#grad1)"
              stroke="#1e6efd"
              strokeWidth="2"
              opacity="0.6"
            />

            {/* Detalles de facetas */}
            <circle
              cx="100"
              cy="100"
              r="40"
              fill="none"
              stroke="#1e6efd"
              strokeWidth="1"
              opacity="0.3"
            />
            <circle
              cx="100"
              cy="100"
              r="60"
              fill="none"
              stroke="#87cfff"
              strokeWidth="1"
              opacity="0.2"
            />

            {/* Puntos de brillo */}
            <circle cx="100" cy="60" r="3" fill="#87cfff" opacity="0.8" />
            <circle cx="140" cy="100" r="3" fill="#87cfff" opacity="0.8" />
            <circle cx="100" cy="140" r="3" fill="#87cfff" opacity="0.8" />
            <circle cx="60" cy="100" r="3" fill="#87cfff" opacity="0.8" />
          </motion.g>
        </svg>
      </motion.div>

      {/* Esferas flotantes */}
      <motion.div
        className="absolute -top-20 -left-20 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500 to-transparent opacity-30 blur-3xl"
        animate={{
          y: [0, 50, 0],
          x: [0, -30, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className="absolute bottom-20 right-20 w-56 h-56 rounded-full bg-gradient-to-tl from-blue-400 to-transparent opacity-25 blur-3xl"
        animate={{
          y: [0, -40, 0],
          x: [0, 40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
