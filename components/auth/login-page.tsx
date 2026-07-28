"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatedBackground } from "./animated-background";
import { LoginForm } from "./login-form";

export function LoginPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#f8fafc]">
      <AnimatedBackground effect="curves" />

      <div className="relative z-10 w-screen h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          /* Bordes extra redondeados y sombra suave profunda */
          className="w-full max-w-[420px] bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] p-12 border border-white/40 flex flex-col items-center"
        >
          {/* Logo más grande */}
          {/* 3. Contenedor del Logo: Aumentamos el margen inferior para dar aire */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mb-14 w-full flex justify-center px-4"
          >
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/LOGO%20SUPRICOM%202026-N6SbKZ6A9MEirf101HifmpfeaRIAJa.png"
              alt="SUPRICOM Logo"
              // Aumentamos el ancho base a 320 para que tenga más peso visual
              width={420}
              height={200}
              priority
              // Usamos 'h-16' o 'h-20' para forzar una altura mayor manteniendo la proporción
              className="h-16 w-auto object-contain drop-shadow-sm"
            />
          </motion.div>

          <div className="w-full">
            <LoginForm />
          </div>

          {/* Selector de idioma mejor ubicado (abajo de la card) */}
          {/* <div className="mt-8">
            <LanguageSwitcher />
          </div>*/}

          <motion.p className="text-center text-[8px] text-gray-400 mt-8 tracking-widest uppercase">
            © 2026 SUPRICOM. Todos los derechos reservados.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
