"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";

interface PresentationContextType {
  isPresentationMode: boolean;
  togglePresentationMode: () => void;
}

const PresentationContext = createContext<PresentationContextType>({
  isPresentationMode: false,
  togglePresentationMode: () => {},
});

export function PresentationModeProvider({ children }: { children: React.ReactNode }) {
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const togglePresentationMode = useCallback(() => {
    setIsPresentationMode(prev => !prev);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        togglePresentationMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePresentationMode]);

  return (
    <PresentationContext.Provider value={{ isPresentationMode, togglePresentationMode }}>
      {children}
      {isPresentationMode && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "#dc2626", color: "white", textAlign: "center",
          padding: "6px 16px", fontSize: 14, fontWeight: 700,
          fontFamily: "system-ui, sans-serif"
        }}>
          🎤 MODO PRESENTACIÓN ACTIVO — Datos ocultos — Presiona Ctrl+Shift+P para desactivar
        </div>
      )}
      <button
        onClick={togglePresentationMode}
        style={{
          position: "fixed", bottom: 80, right: 20, zIndex: 9998,
          background: isPresentationMode ? "#dc2626" : "#1e293b",
          color: "white", border: "none", borderRadius: 12,
          padding: "10px 18px", fontSize: 13, fontWeight: 600,
          cursor: "pointer", fontFamily: "system-ui, sans-serif",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          transition: "all 0.2s"
        }}
      >
        {isPresentationMode ? "🎤 Desactivar Presentación" : "🎤 Modo Presentación"}
      </button>
    </PresentationContext.Provider>
  );
}

export function usePresentationMode() {
  return useContext(PresentationContext);
}
