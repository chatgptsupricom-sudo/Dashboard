"use client";

import { useAuthStore } from "@/lib/stores/auth.store";
import { ChevronDown, FileText, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Partner {
  id: number;
  name: string;
  vat: string;
}

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ONES = [
  "",
  "Un",
  "Dos",
  "Tres",
  "Cuatro",
  "Cinco",
  "Seis",
  "Siete",
  "Ocho",
  "Nueve",
  "Diez",
  "Once",
  "Doce",
  "Trece",
  "Catorce",
  "Quince",
  "Dieciséis",
  "Diecisiete",
  "Dieciocho",
  "Diecinueve",
  "Veinte",
  "Veintiún",
  "Veintidós",
  "Veintitrés",
  "Veinticuatro",
  "Veinticinco",
  "Veintiséis",
  "Veintisiete",
  "Veintiocho",
  "Veintinueve",
  "Treinta",
  "Treinta y uno",
];

function dayInSpanish(n: number): string {
  if (n >= 1 && n <= 31) return ONES[n] || String(n);
  return String(n);
}

function yearSuffix(y: number): string {
  if (y === 2026) return "Veintiséis";
  if (y === 2025) return "Veinticinco";
  return String(y);
}

function SignatureSVG() {
  return (
    <svg
      width="140"
      height="55"
      viewBox="0 0 140 55"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <path
        d="M10 40 C12 38, 15 20, 20 18 C25 16, 22 35, 28 30 C32 27, 30 15, 35 14 C40 13, 38 32, 42 28 C46 24, 44 12, 50 10 C56 8, 52 30, 58 26 C62 23, 60 14, 65 12 C70 10, 68 28, 72 25 C76 22, 78 15, 82 14 C86 13, 84 22, 88 20 C92 18, 95 30, 100 28 C105 26, 108 35, 112 32 C116 29, 118 22, 122 20 C126 18, 130 25, 132 24"
        stroke="#000"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M25 42 C30 40, 45 43, 55 41 C65 39, 80 42, 95 40"
        stroke="#000"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function ReferenciaComercialPage() {
  const { user } = useAuthStore();
  const userCids = user?.cids;
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [yearsRelation, setYearsRelation] = useState(2);
  const letterRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userCids) params.set("companyId", String(userCids));
      const res = await fetch(
        `/api/superadmin/cuentas-por-cobrar/partners?${params}`,
      );
      const json = await res.json();
      if (json.success && json.data) {
        setPartners(json.data);
      }
    } catch (e) {
      console.error("Error fetching partners:", e);
    }
    setLoading(false);
  }, [userCids]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const filtered = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vat.includes(searchTerm),
  );

  const dayNum = today.getDate();
  const dayWord = dayInSpanish(dayNum);
  const monthName = MONTHS_ES[today.getMonth()];
  const yearNum = today.getFullYear();
  const yearSuf = yearSuffix(yearNum);
  const yearsWord = dayInSpanish(yearsRelation);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !letterRef.current) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Referencia Comercial</title>
<style>
@page { margin: 0; size: A4 portrait; }
html, body { margin: 0; padding: 0; width: 210mm; height: 297mm; }
body { font-family: 'Times New Roman', Times, serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 60px 70px 40px; position: relative; overflow: hidden; box-sizing: border-box; }
svg { display: block; }
</style></head><body><div class="page">${letterRef.current.innerHTML}</div></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const letterContent = selectedPartner ? (
    <div
      style={{
        fontFamily: "'Times New Roman', Times, serif",
        color: "#000",
        width: "100%",
        height: "100%",
        position: "relative",
        fontSize: "15px",
      }}
    >
      {/* ========== WATERMARK CENTRADO EN LA HOJA ========== */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "48%",
          transform: "translate(-50%, -50%)",
          opacity: 0.06,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <img src="/osclogo1.jpg" alt="" style={{ width: "500px" }} />
      </div>

      {/* ========== HEADER: Logo OSC izquierda ========== */}
      <div style={{ width: "170px", marginBottom: "0" }}>
        <img
          src="/osclogo.jpg"
          alt="OSC"
          style={{ width: "170px", display: "block" }}
        />
        <div
          style={{
            fontSize: "12px",
            color: "#333",
            marginTop: "1px",
            textAlign: "center",
          }}
        >
          RIF: J-31163115-1
        </div>
      </div>

      {/* ========== FECHA derecha ========== */}
      <div
        style={{
          textAlign: "right",
          fontSize: "15px",
          marginTop: "50px",
          marginBottom: "50px",
        }}
      >
        Valencia, {dayNum} de {monthName} del {yearNum}
      </div>

      {/* ========== TITULO ========== */}
      <div
        style={{
          textAlign: "center",
          fontSize: "16.5px",
          fontWeight: "bold",
          textDecoration: "underline",
          margin: "25px 0 30px",
        }}
      >
        A quien pueda interesar
      </div>

      {/* ========== CUERPO TEXTO ========== */}
      <div
        style={{
          fontSize: "15px",
          lineHeight: "2.1",
          textAlign: "justify",
          padding: "0 5px",
        }}
      >
        <p style={{ marginBottom: "20px" }}>
          Por medio de la presente se hace constar que la empresa{" "}
          <strong>{selectedPartner.name}</strong>, RIF{" "}
          <strong>{selectedPartner.vat}</strong> mantiene relaciones{" "}
          <strong>comerciales</strong> y maneja{" "}
          <strong>negociaciones mensuales puntuales</strong>&nbsp;de
          manera&nbsp;<strong>satisfactoria</strong>, desde hace{" "}
          <strong>
            {yearsRelation < 10 ? "0" : ""}
            {yearsRelation} años ({yearsWord.toLowerCase()} años)
          </strong>
          , siendo responsable y cumpliendo los acuerdos establecidos.
        </p>
        <p>
          Constancia que se expide a petición de parte interesada&nbsp;a los{" "}
          {dayWord} ({dayNum}) días del mes de {monthName.toLowerCase()}{" "}
          &nbsp;del año dos mil {yearSuf} ({yearNum}).
        </p>
      </div>

      {/* ========== FIRMA ========== */}
      <div
        style={{
          position: "relative",
          marginTop: "50px",
          minHeight: "260px",
          padding: "0 5px",
        }}
      >
        {/* Contenido firma */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            paddingTop: "50px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "14px", color: "#222", marginBottom: "0" }}>
            Coordinación Administrativa
          </div>

          {/* Firma imagen */}
          <div style={{ margin: "5px auto 8px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/VictorFirma3.png"
              alt="Firma"
              style={{ height: "70px", display: "block", margin: "0 auto" }}
            />
          </div>

          <div
            style={{ fontWeight: "bold", fontSize: "15px", lineHeight: "1.3" }}
          >
            Lic. Victor Molina
          </div>
          <div
            style={{ fontWeight: "bold", fontSize: "15px", lineHeight: "1.3" }}
          >
            Coord. Administrativo y Contable
          </div>
          <div
            style={{ fontWeight: "bold", fontSize: "15px", lineHeight: "1.3" }}
          >
            Telf. 0424-4099671
          </div>
          <div
            style={{ fontWeight: "bold", fontSize: "15px", lineHeight: "1.3" }}
          >
            Telf. 0241-8728311
          </div>
        </div>
      </div>

      {/* ========== FOOTER LINEA - FIJO ABAJO PEGADO AL BORDE ========== */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          borderTop: "1.5px solid #000",
          padding: "8px 40px",
          fontSize: "11px",
          textAlign: "center",
          color: "#333",
          lineHeight: "1.5",
        }}
      >
        Valencia Zona Ind. Sur. Av. Ernesto Berrind, CEI Arturo Michelena Galpón
        C4 Valencia edo Carabobo | Telefax: (0241) 1326646 | 8728319 e-mail:
        venta04@osc2004.com Copyright©2010 | Todos los derechos de propiedad
        intelectual reservada, imágenes propias y referencias
      </div>
    </div>
  ) : null;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          Referencia Comercial
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Seleccione un cliente para generar la carta de referencia
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cliente
            </label>
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-full flex items-center justify-between bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-left hover:border-blue-400 transition"
              >
                <span
                  className={
                    selectedPartner ? "text-slate-800" : "text-slate-400"
                  }
                >
                  {selectedPartner
                    ? `${selectedPartner.name} ${selectedPartner.vat ? `(${selectedPartner.vat})` : ""}`
                    : "Seleccionar cliente..."}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {dropdownOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                  <div className="sticky top-0 bg-white p-2 border-b border-slate-100">
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                      <Search size={14} className="text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm w-full"
                        autoFocus
                      />
                    </div>
                  </div>
                  {loading ? (
                    <div className="p-4 text-center text-slate-400 text-sm">
                      Cargando...
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-sm">
                      No se encontraron clientes
                    </div>
                  ) : (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedPartner(p);
                          setDropdownOpen(false);
                          setSearchTerm("");
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition flex justify-between ${selectedPartner?.id === p.id ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
                      >
                        <span className="truncate">{p.name}</span>
                        {p.vat && (
                          <span className="text-slate-400 ml-2 shrink-0">
                            {p.vat}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Años de relación
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={yearsRelation}
              onChange={(e) => setYearsRelation(parseInt(e.target.value) || 1)}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Print button */}
      {selectedPartner && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <Printer size={16} />
            Imprimir / Descargar PDF
          </button>
        </div>
      )}

      {/* Vista previa */}
      {selectedPartner && (
        <div className="bg-slate-200 rounded-lg py-8">
          <div
            className="mx-auto bg-white shadow-xl"
            style={{
              width: "210mm",
              height: "297mm",
              padding: "60px 70px 40px",
              position: "relative",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            <div
              ref={letterRef}
              style={{ height: "100%", position: "relative" }}
            >
              {letterContent}
            </div>
          </div>
        </div>
      )}

      {!selectedPartner && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText size={48} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-400">
            Seleccione un cliente para ver la vista previa de la carta
          </p>
        </div>
      )}
    </div>
  );
}
