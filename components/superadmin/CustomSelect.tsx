"use client";

import { ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function CustomSelect({
  label,
  value,
  placeholder,
  options,
  onSelect,
  searchable = false,
}: any) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isOpen]);

  const filtered = searchable
    ? options.filter(
        (o: any) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.subLabel?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  return (
    <div className="w-full space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
        {label}
      </label>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50 border border-slate-200/60 p-4 rounded-2xl cursor-pointer flex justify-between items-center hover:bg-slate-100/50 transition-all"
      >
        <span className="text-xs font-black text-slate-800 uppercase truncate">
          {value ? value.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed z-[9999] bg-white border border-slate-200 rounded-3xl shadow-2xl p-2 max-h-[400px] overflow-y-auto w-full"
              style={{
                top: `${coords.top + 8}px`,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                // Añade esto para asegurar que el contenido fluya bien:
                display: "flex",
                flexDirection: "column",
              }}
            >
              {searchable && (
                <div className="relative flex items-center bg-slate-50 rounded-2xl px-3 py-2 mb-2">
                  <Search size={14} className="text-slate-400 mr-2" />
                  <input
                    autoFocus
                    className="w-full bg-transparent text-xs font-bold outline-none"
                    placeholder="Buscar..."
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              <div className="divide-y divide-slate-50">
                {filtered.map((opt: any) => (
                  <div
                    key={opt.key}
                    onClick={() => {
                      onSelect(opt);
                      setIsOpen(false);
                    }}
                    className="p-3 hover:bg-blue-50 cursor-pointer flex flex-col gap-0.5"
                  >
                    <span className="text-xs font-black text-slate-800 uppercase leading-none">
                      {opt.label}
                    </span>
                    {opt.subLabel && (
                      <span className="text-[10px] font-mono text-slate-400 font-bold tracking-tight">
                        {opt.subLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
