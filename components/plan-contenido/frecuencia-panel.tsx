"use client";

// ============================================================
// FrecuenciaPanel — Panel principal de planificación CPM
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CPM, CPMType, ContentFormat, OdooProduct, SavedContent } from "@/lib/plan-contenido/types";

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_SHORT = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const TYPE_LABELS: Record<CPMType, string> = {
  categoria: "Categoría",
  producto: "Producto",
  marca: "Marca",
  empresa: "Empresa",
};

const FORMAT_LABELS: Record<ContentFormat, string> = {
  supri: "Video Supri",
  persona: "Video Persona",
  carrusel: "Carrusel",
  post: "Post",
};

// ═══════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════
function getDaysInMonth(m: number, y: number) { return new Date(y, m, 0).getDate(); }
function getDow(m: number, y: number, d: number) { return new Date(y, m - 1, d).getDay(); }
function isWeekday(m: number, y: number, d: number) { const w = getDow(m, y, d); return w >= 1 && w <= 5; }
function dateKey(m: number, y: number, d: number) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function fmtDate(s: string) { const p = s.split('-'); return `${p[2]}/${p[1]}`; }
function fmtDateShort(s: string) { const p = s.split('-'); return `${p[2]} ${MONTH_SHORT[parseInt(p[1])]}`; }
function parseDateKey(key: string) { const p = key.split('-'); return { y: parseInt(p[0]), m: parseInt(p[1]), d: parseInt(p[2]) }; }
function shuffle<T>(arr: T[]): T[] { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════
export function FrecuenciaPanel({ userRole }: { userRole: string }) {
  // State
  const [month, setMonth] = useState(10);
  const [year, setYear] = useState(2026);
  const [holidays, setHolidays] = useState<{ date: string; name: string; programmed: boolean }[]>([]);
  const [cpms, setCpms] = useState<CPM[]>([]);
  const [calendar, setCalendar] = useState<Record<string, any[]>>({});
  const [savedContent, setSavedContent] = useState<SavedContent[]>([]);
  const [inventoryProducts, setInventoryProducts] = useState<Record<string, any[]>>({});
  const [activeStep, setActiveStep] = useState(1);

  // CPM Creator state
  const [showCPMModal, setShowCPMModal] = useState(false);
  const [cpmName, setCpmName] = useState("");
  const [cpmType, setCpmType] = useState<CPMType>("categoria");
  const [odooSearch, setOdooSearch] = useState("");
  const [odooProducts, setOdooProducts] = useState<OdooProduct[]>([]);
  const [odooSelected, setOdooSelected] = useState<Set<number>>(new Set());
  const [odooLoading, setOdooLoading] = useState(false);

  // Saved content form
  const [scName, setScName] = useState("");
  const [scFormat, setScFormat] = useState<ContentFormat>("persona");
  const [scDate, setScDate] = useState("");
  const [scJust, setScJust] = useState("");

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSlot, setEditSlot] = useState<{ key: string; idx: number }>({ key: "", idx: 0 });
  const [editCPM, setEditCPM] = useState("");
  const [editFormat, setEditFormat] = useState<ContentFormat>("carrusel");
  const [editTopic, setEditTopic] = useState("");

  // Drag state
  const [dragData, setDragData] = useState<{ srcKey: string; srcIdx: number } | null>(null);

  // UI state
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (type: "ok" | "err", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ═══════════════════════════════════════════════
  // DATE CALCULATIONS
  // ═══════════════════════════════════════════════
  const isHoliday = useCallback((m: number, y: number, d: number) => {
    return holidays.find(h => h.date === dateKey(m, y, d));
  }, [holidays]);

  const isPublishable = useCallback((m: number, y: number, d: number) => {
    if (!isWeekday(m, y, d)) return false;
    const h = isHoliday(m, y, d);
    if (h && !h.programmed) return false;
    return true;
  }, [isHoliday]);

  const countPublishable = useCallback(() => {
    const n = getDaysInMonth(month, year);
    let c = 0;
    for (let d = 1; d <= n; d++) if (isPublishable(month, year, d)) c++;
    return c;
  }, [month, year, isPublishable]);

  const totalPieces = () => countPublishable() * 2;

  const calculateSlots = useCallback(() => {
    const days = getDaysInMonth(month, year);
    let supriSlots: any[] = [], personaSlots: any[] = [], carrSlots: any[] = [], postSlots: any[] = [];
    for (let d = 1; d <= days; d++) {
      if (!isPublishable(month, year, d)) continue;
      const dow = getDow(month, year, d);
      const key = dateKey(month, year, d);
      if (dow === 1 || dow === 3) supriSlots.push({ key, d, dow });
      if (dow === 5) personaSlots.push({ key, d, dow });
      if (dow >= 1 && dow <= 4) carrSlots.push({ key, d, dow });
      if (dow === 2 || dow === 4) postSlots.push({ key, d, dow });
    }
    return { supriSlots, personaSlots, carrSlots, postSlots };
  }, [month, year, isPublishable]);

  // ═══════════════════════════════════════════════
  // ODOO SEARCH
  // ═══════════════════════════════════════════════
  const searchOdoo = async () => {
    if (!odooSearch.trim()) return;
    setOdooLoading(true);
    try {
      const tipo = cpmType === "categoria" ? "categoria" : cpmType === "producto" ? "producto" : "marca";
      const res = await fetch(`/api/plan-contenido/odoo-products?tipo=${tipo}&valor=${encodeURIComponent(odooSearch)}&sede=9`);
      const data = await res.json();
      if (data.products) {
        setOdooProducts(data.products);
        setOdooSelected(new Set(data.products.map((p: OdooProduct) => p.id)));
      } else {
        showToast("err", data.error || "Error al buscar productos");
      }
    } catch {
      showToast("err", "Error de conexión");
    } finally {
      setOdooLoading(false);
    }
  };

  const toggleOdooProduct = (id: number) => {
    const next = new Set(odooSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOdooSelected(next);
  };

  // ═══════════════════════════════════════════════
  // CPM MANAGEMENT
  // ═══════════════════════════════════════════════
  const confirmCPM = () => {
    if (!cpmName.trim()) return showToast("err", "Escribe el nombre del CPM");

    let stockTotal = 0;
    let products: any[] = [];

    if (cpmType !== "empresa") {
      const selected = odooProducts.filter(p => odooSelected.has(p.id));
      if (selected.length === 0) return showToast("err", "Selecciona al menos un producto");
      stockTotal = selected.reduce((s, p) => s + p.stock, 0);
      products = selected.map(p => ({
        odooProductId: p.id, sku: p.sku, productName: p.name,
        brand: p.brand, stock: p.stock, price: p.price, included: true,
      }));
    }

    const newCPM: CPM = {
      name: cpmName.trim(), type: cpmType, stockTotal: stockTotal,
      supriCount: 0, personaCount: 0, carruselCount: 0, postCount: 0,
      sortOrder: cpms.length, products,
    };

    setCpms(prev => [...prev, newCPM]);
    setInventoryProducts(prev => ({ ...prev, [newCPM.name]: products }));

    // Reset modal
    setShowCPMModal(false);
    setCpmName("");
    setOdooProducts([]);
    setOdooSelected(new Set());
    setOdooSearch("");
    setActiveStep(2);
    showToast("ok", `CPM "${newCPM.name}" agregado`);
  };

  const removeCPM = (idx: number) => {
    setCpms(prev => prev.filter((_, i) => i !== idx));
  };

  // ═══════════════════════════════════════════════
  // SAVED CONTENT
  // ═══════════════════════════════════════════════
  const addSavedContent = () => {
    if (!scName.trim()) return showToast("err", "Escribe el nombre");
    if (!scDate) return showToast("err", "Selecciona la fecha");
    setSavedContent(prev => [...prev, {
      name: scName.trim(), format: scFormat, publishDate: scDate, justification: scJust,
    }]);
    setScName(""); setScJust(""); setScDate("");
    showToast("ok", "Contenido guardado agregado");
  };

  const removeSavedContent = (idx: number) => {
    setSavedContent(prev => prev.filter((_, i) => i !== idx));
  };

  // ═══════════════════════════════════════════════
  // FREQUENCY
  // ═══════════════════════════════════════════════
  const autoFrequency = () => {
    if (cpms.length === 0) return showToast("err", "Crea CPMs primero");
    const n = cpms.length;
    const s = calculateSlots();
    const totalSupri = s.supriSlots.length;
    const totalPersona = s.personaSlots.length * 2;
    const totalCarr = s.carrSlots.length;
    const totalPost = s.postSlots.length;
    const total = totalSupri + totalPersona + totalCarr + totalPost;

    let idx = cpms.map((c, i) => ({ i, stock: c.stockTotal || 0 }));
    idx.sort((a, b) => b.stock - a.stock);

    // Supri
    const newCPMs = [...cpms];
    idx.forEach(({ i }) => newCPMs[i].supriCount = 0);
    let sc = 0;
    for (let k = 0; k < idx.length && sc < totalSupri; k++) { newCPMs[idx[k].i].supriCount = 1; sc++; }

    // Persona round-robin
    idx.forEach(({ i }) => newCPMs[i].personaCount = 0);
    let pr = totalPersona;
    let pi = 0;
    while (pr > 0) { newCPMs[idx[pi % idx.length].i].personaCount++; pr--; pi++; }

    // Carrusel + Post fair base
    idx.forEach(({ i }) => { newCPMs[i].carruselCount = 0; newCPMs[i].postCount = 0; });
    const baseCarr = Math.floor(totalCarr / n);
    const basePost = Math.floor(totalPost / n);
    let carrLeft = totalCarr - baseCarr * n;
    let postLeft = totalPost - basePost * n;
    idx.forEach(({ i }) => { newCPMs[i].carruselCount = baseCarr; newCPMs[i].postCount = basePost; });
    let ci = 0;
    while (carrLeft > 0) { newCPMs[idx[ci % idx.length].i].carruselCount++; carrLeft--; ci++; }
    let qi = 0;
    while (postLeft > 0) { newCPMs[idx[qi % idx.length].i].postCount++; postLeft--; qi++; }

    // Verify exact
    let ss2 = 0, sp2 = 0, sc2 = 0, spt2 = 0;
    newCPMs.forEach(c => { ss2 += c.supriCount; sp2 += c.personaCount; sc2 += c.carruselCount; spt2 += c.postCount; });
    let assigned = ss2 + sp2 + sc2 + spt2;
    let diff = total - assigned;
    let fi = 0;
    while (diff > 0) { newCPMs[idx[fi % idx.length].i].carruselCount++; diff--; fi++; }
    while (diff < 0) { const c = newCPMs[idx[fi % idx.length].i]; if (c.carruselCount > 0) { c.carruselCount--; diff++; } fi++; }

    setCpms(newCPMs);
    setActiveStep(3);
    showToast("ok", "Frecuencia generada");
  };

  // ═══════════════════════════════════════════════
  // DISTRIBUTION
  // ═══════════════════════════════════════════════
  const autoDistribute = () => {
    if (cpms.length === 0) return showToast("err", "Crea CPMs primero");
    const newCalendar: Record<string, any[]> = {};
    const days = getDaysInMonth(month, year);
    let dayCPMs: Record<string, Set<string>> = {};
    let lastDay: Record<string, number> = {};

    const canPlace = (cpm: string, d: number, key: string) => {
      if (dayCPMs[key] && dayCPMs[key].has(cpm)) return false;
      if (lastDay[cpm] !== undefined && Math.abs(d - lastDay[cpm]) === 1) return false;
      return true;
    };
    const place = (p: any, d: number, key: string) => {
      if (!newCalendar[key]) newCalendar[key] = [];
      if (newCalendar[key].length >= 2) return;
      newCalendar[key].push(p);
      if (!dayCPMs[key]) dayCPMs[key] = new Set();
      dayCPMs[key].add(p.cpm);
      lastDay[p.cpm] = d;
    };

    // Build pools
    let pools: Record<string, any[]> = { supri: [], persona: [], carrusel: [], post: [] };
    cpms.forEach(c => {
      const n = c.name || "Sin nombre";
      for (let i = 0; i < c.supriCount; i++) pools.supri.push({ cpm: n, format: "supri" });
      for (let i = 0; i < c.personaCount; i++) pools.persona.push({ cpm: n, format: "persona" });
      for (let i = 0; i < c.carruselCount; i++) pools.carrusel.push({ cpm: n, format: "carrusel" });
      for (let i = 0; i < c.postCount; i++) pools.post.push({ cpm: n, format: "post" });
    });

    // Place saved content
    savedContent.forEach(sc => {
      const scDate = parseDateKey(sc.publishDate);
      if (scDate.y === year && scDate.m === month) {
        const scKey = dateKey(scDate.m, scDate.y, scDate.d);
        if (!newCalendar[scKey]) newCalendar[scKey] = [];
        if (newCalendar[scKey].length < 2) {
          newCalendar[scKey].push({ cpm: sc.name, format: sc.format, saved: true, justification: sc.justification });
          if (!dayCPMs[scKey]) dayCPMs[scKey] = new Set();
          dayCPMs[scKey].add(sc.name);
          lastDay[sc.name] = scDate.d;
        }
      }
    });

    shuffle(pools.supri); shuffle(pools.persona); shuffle(pools.carrusel); shuffle(pools.post);

    // Day-by-day
    for (let d = 1; d <= days; d++) {
      if (!isPublishable(month, year, d)) continue;
      const dow = getDow(month, year, d);
      const key = dateKey(month, year, d);
      let current = (newCalendar[key] || []).length;
      let needed: string[] = [];
      if (dow === 1 || dow === 3) needed = ["supri", "carrusel"];
      else if (dow === 2 || dow === 4) needed = ["carrusel", "post"];
      else if (dow === 5) needed = ["persona", "persona"];

      needed.forEach(fmt => {
        if (current >= 2) return;
        const pool = pools[fmt];
        if (!pool || pool.length === 0) return;
        let idx = -1;
        pool.forEach((p, i) => { if (idx >= 0) return; if (canPlace(p.cpm, d, key)) idx = i; });
        if (idx >= 0) { const piece = pool.splice(idx, 1)[0]; place(piece, d, key); current++; }
      });
    }

    // Fill remaining
    for (let d = 1; d <= days; d++) {
      if (!isPublishable(month, year, d)) continue;
      const dow = getDow(month, year, d);
      const key = dateKey(month, year, d);
      let cur = (newCalendar[key] || []).length;
      while (cur < 2) {
        let piece = null;
        let tryPools: string[] = [];
        if (dow === 1 || dow === 3) tryPools = ["carrusel", "supri"];
        else if (dow === 2 || dow === 4) tryPools = ["carrusel", "post"];
        else if (dow === 5) tryPools = ["persona"];
        for (let pi = 0; pi < tryPools.length && !piece; pi++) {
          const pool = pools[tryPools[pi]];
          if (!pool || pool.length === 0) continue;
          let idx = -1;
          pool.forEach((p, i) => { if (idx >= 0) return; if (canPlace(p.cpm, d, key)) idx = i; });
          if (idx >= 0) piece = pool.splice(idx, 1)[0];
        }
        if (!piece) break;
        place(piece, d, key); cur++;
      }
    }

    setCalendar(newCalendar);
    setActiveStep(4);
    showToast("ok", "Distribución generada");
  };

  // ═══════════════════════════════════════════════
  // TOPICS
  // ═══════════════════════════════════════════════
  const autoAssignTopics = () => {
    // Simple topic assignment for now
    let assigned = 0;
    const newCalendar = { ...calendar };
    Object.keys(newCalendar).forEach(key => {
      newCalendar[key] = newCalendar[key].map(piece => {
        if (piece.topic || piece.saved) return piece;
        assigned++;
        return { ...piece, topic: `${piece.cpm}: disponible en SUPRICOM` };
      });
    });
    setCalendar(newCalendar);
    setActiveStep(5);
    showToast("ok", `${assigned} temas asignados`);
  };

  // ═══════════════════════════════════════════════
  // SAVE / LOAD
  // ═══════════════════════════════════════════════
  const savePlan = async () => {
    if (cpms.length === 0) return showToast("err", "No hay CPMs para guardar");
    setSaving(true);
    try {
      // Build calendar array
      const calendarArr: any[] = [];
      let counter = 1;
      const days = getDaysInMonth(month, year);
      for (let d = 1; d <= days; d++) {
        if (!isPublishable(month, year, d)) continue;
        const key = dateKey(month, year, d);
        const pieces = calendar[key] || [];
        pieces.forEach((p: any) => {
          calendarArr.push({
            pieceNumber: counter, dateKey: key, cpmName: p.cpm,
            format: p.format, topic: p.topic || "", isSaved: p.saved || false,
          });
          counter++;
        });
      }

      const res = await fetch("/api/plan-contenido/cpm-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, cpms, savedContent, calendar: calendarArr }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("ok", `Plan guardado (ID: ${data.planId})`);
      } else {
        showToast("err", data.error || "Error al guardar");
      }
    } catch {
      showToast("err", "Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════
  const exportInventory = async () => {
    if (cpms.length === 0) return showToast("err", "No hay CPMs para exportar");
    try {
      // For now, export locally using a simple approach
      showToast("ok", "Exportando inventario...");
      // TODO: Implement proper Excel export via API
    } catch {
      showToast("err", "Error al exportar");
    }
  };

  const exportCalendar = () => {
    showToast("ok", "Exportando calendario...");
    // TODO: Implement proper Excel export via API
  };

  // ═══════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════
  const getPieceNumber = (key: string, idx: number): number => {
    const days = getDaysInMonth(month, year);
    let counter = 1;
    for (let d = 1; d <= days; d++) {
      if (!isPublishable(month, year, d)) continue;
      const k = dateKey(month, year, d);
      const pieces = calendar[k] || [];
      for (let pi = 0; pi < pieces.length; pi++) {
        if (k === key && pi === idx) return counter;
        counter++;
      }
    }
    return 0;
  };

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-blue-700 text-white rounded-xl p-4">
        <div>
          <h1 className="text-lg font-bold">SUPRICOM — Frecuencia CPM</h1>
          <p className="text-xs text-blue-200">Planificación mensual de contenido B2B</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={savePlan} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Guardar
          </Button>
          <Button size="sm" onClick={exportInventory}>
            <Download className="w-3 h-3" /> Exportar
          </Button>
        </div>
      </div>

      {/* Flow Steps */}
      <div className="flex gap-2 flex-wrap">
        {[1, 2, 3, 4, 5].map(step => (
          <div key={step} className={`flex-1 min-w-[120px] border-2 rounded-lg p-2 text-center transition-all ${activeStep === step ? 'border-blue-500 bg-blue-50' : activeStep > step ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
            <div className={`text-sm font-extrabold ${activeStep > step ? 'text-green-600' : 'text-blue-600'}`}>{step}</div>
            <div className="text-[10px] text-gray-500 font-semibold">
              {step === 1 ? 'Configurar mes' : step === 2 ? 'Crear CPMs' : step === 3 ? 'Frecuencia' : step === 4 ? 'Distribución' : 'Temas'}
            </div>
          </div>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'ok' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : <AlertCircle className="w-4 h-4 inline mr-1" />}
          {toast.msg}
        </div>
      )}

      {/* Section 1: Month Config */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-md flex items-center justify-center text-xs font-bold">1</span>
            Configuración del Mes
          </h2>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 font-medium">Mes</label>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-full border rounded-lg px-3 py-2 text-sm">
                {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Año</label>
              <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || 2026)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Feriado — Fecha</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Feriado — Nombre</label>
              <input type="text" placeholder="Ej: Resistencia Indígena" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {[
              { label: "Días hábiles", value: countWorkdays() },
              { label: "Días publicables", value: countPublishable() },
              { label: "Total piezas", value: totalPieces() },
              { label: "Slots Supri", value: calculateSlots().supriSlots.length },
              { label: "Slots Persona", value: calculateSlots().personaSlots.length * 2 },
              { label: "Slots Carrusel", value: calculateSlots().carrSlots.length },
              { label: "Slots Post", value: calculateSlots().postSlots.length },
            ].map((s, i) => (
              <div key={i} className="bg-gray-50 border rounded-lg p-2 text-center">
                <div className="text-lg font-extrabold text-blue-700">{s.value}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Create CPMs */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-md flex items-center justify-center text-xs font-bold">2</span>
            Crear CPMs
          </h2>
        </div>
        <div className="p-4">
          <div className="flex gap-2 mb-3">
            <Button onClick={() => setShowCPMModal(true)} size="sm">
              <Plus className="w-3 h-3" /> Nuevo CPM
            </Button>
          </div>

          {/* CPM List */}
          {cpms.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">No hay CPMs creados. Haz click en "Nuevo CPM" para empezar.</div>
          ) : (
            <div className="space-y-2">
              {cpms.map((c, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 border rounded-lg p-3">
                  <div className="font-semibold text-sm min-w-[120px]">{c.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.type === 'categoria' ? 'bg-blue-100 text-blue-700' : c.type === 'producto' ? 'bg-orange-100 text-orange-700' : c.type === 'empresa' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                    {TYPE_LABELS[c.type]}
                  </span>
                  <div className="text-xs text-gray-500 flex-1">
                    {c.type === 'empresa' ? 'Contenido corporativo' : `${c.stockTotal?.toLocaleString()} uds · ${c.products?.length || 0} productos`}
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => removeCPM(i)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Frequency */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-md flex items-center justify-center text-xs font-bold">3</span>
            Frecuencia por CPM
          </h2>
          <Button size="sm" onClick={autoFrequency}>
            <RefreshCw className="w-3 h-3" /> Generar Frecuencia
          </Button>
        </div>
        <div className="p-4 overflow-x-auto">
          {cpms.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-blue-50">
                  <th className="p-2 text-left font-bold text-blue-800">Nombre</th>
                  <th className="p-2 text-center font-bold text-blue-800">Tipo</th>
                  <th className="p-2 text-center font-bold text-blue-800">Stock</th>
                  <th className="p-2 text-center font-bold text-blue-800">Supri</th>
                  <th className="p-2 text-center font-bold text-blue-800">Persona</th>
                  <th className="p-2 text-center font-bold text-blue-800">Carrusel</th>
                  <th className="p-2 text-center font-bold text-blue-800">Post</th>
                  <th className="p-2 text-center font-bold text-blue-800">Total</th>
                </tr>
              </thead>
              <tbody>
                {cpms.map((c, i) => (
                  <tr key={i} className="border-b hover:bg-blue-50">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${c.type === 'categoria' ? 'bg-blue-100 text-blue-700' : c.type === 'producto' ? 'bg-orange-100 text-orange-700' : c.type === 'empresa' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                        {TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="p-2 text-center">{c.type === 'empresa' ? '—' : c.stockTotal?.toLocaleString()}</td>
                    <td className="p-2 text-center">
                      <input type="number" min="0" value={c.supriCount} onChange={e => { const v = [...cpms]; v[i].supriCount = parseInt(e.target.value) || 0; setCpms(v); }} className="w-14 border rounded px-1 py-0.5 text-center" />
                    </td>
                    <td className="p-2 text-center">
                      <input type="number" min="0" value={c.personaCount} onChange={e => { const v = [...cpms]; v[i].personaCount = parseInt(e.target.value) || 0; setCpms(v); }} className="w-14 border rounded px-1 py-0.5 text-center" />
                    </td>
                    <td className="p-2 text-center">
                      <input type="number" min="0" value={c.carruselCount} onChange={e => { const v = [...cpms]; v[i].carruselCount = parseInt(e.target.value) || 0; setCpms(v); }} className="w-14 border rounded px-1 py-0.5 text-center" />
                    </td>
                    <td className="p-2 text-center">
                      <input type="number" min="0" value={c.postCount} onChange={e => { const v = [...cpms]; v[i].postCount = parseInt(e.target.value) || 0; setCpms(v); }} className="w-14 border rounded px-1 py-0.5 text-center" />
                    </td>
                    <td className="p-2 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded font-bold bg-green-100 text-green-700">
                        {c.supriCount + c.personaCount + c.carruselCount + c.postCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 4: Calendar */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-md flex items-center justify-center text-xs font-bold">4</span>
            Calendario
          </h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={autoDistribute}>
              <Calendar className="w-3 h-3" /> Generar Distribución
            </Button>
            <Button size="sm" variant="outline" onClick={autoAssignTopics}>
              <FileSpreadsheet className="w-3 h-3" /> Asignar Temas
            </Button>
          </div>
        </div>
        <div className="p-4">
          {/* Legend */}
          <div className="flex gap-4 mb-3 flex-wrap text-xs">
            {[
              { color: "#1565C0", label: "Video Supri" },
              { color: "#2E7D32", label: "Video Persona" },
              { color: "#EF6C00", label: "Carrusel" },
              { color: "#546E7A", label: "Post" },
              { color: "#F9A825", label: "Guardado" },
            ].map((l, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: l.color }} />
                <span className="text-gray-600">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <CalendarGrid
            month={month} year={year} calendar={calendar}
            cpms={cpms} holidays={holidays}
            isPublishable={isPublishable} getDow={getDow}
            dateKey={dateKey} getPieceNumber={getPieceNumber}
            onEditPiece={(key, idx) => { setEditSlot({ key, idx }); const p = calendar[key]?.[idx]; if (p) { setEditCPM(p.cpm); setEditFormat(p.format); setEditTopic(p.topic || ""); } setShowEditModal(true); }}
            onAddPiece={(key) => { setEditSlot({ key, idx: (calendar[key] || []).length }); setEditCPM(cpms[0]?.name || ""); setEditFormat("carrusel"); setEditTopic(""); setShowEditModal(true); }}
          />
        </div>
      </div>

      {/* CPM Creator Modal */}
      {showCPMModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowCPMModal(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[700px] max-h-[90vh] overflow-y-auto relative">
            <button className="absolute top-3 right-4 text-gray-400 text-xl" onClick={() => setShowCPMModal(false)}>✕</button>
            <h3 className="text-base font-bold mb-4">Nuevo CPM</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 font-medium">Nombre del CPM</label>
                <input value={cpmName} onChange={e => setCpmName(e.target.value)} placeholder="Ej: Laptops" className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Tipo</label>
                <select value={cpmType} onChange={e => setCpmType(e.target.value as CPMType)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="categoria">Categoría</option>
                  <option value="producto">Producto</option>
                  <option value="marca">Marca</option>
                  <option value="empresa">Marca Empresarial (sin Odoo)</option>
                </select>
              </div>
            </div>

            {cpmType !== "empresa" && (
              <div className="mb-4">
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 font-medium">Buscar en Odoo (marca o categoría)</label>
                    <input value={odooSearch} onChange={e => setOdooSearch(e.target.value)} placeholder="Ej: HP, Laptops, Linksys" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <Button size="sm" onClick={searchOdoo} disabled={odooLoading} className="mt-5">
                    {odooLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Buscar
                  </Button>
                </div>

                {/* Odoo Results */}
                {odooProducts.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                    <div className="p-2 bg-blue-50 text-xs font-semibold text-blue-800 sticky top-0">
                      Productos encontrados ({odooProducts.length}) — Seleccionados: {odooSelected.size}
                    </div>
                    {odooProducts.map(p => (
                      <div key={p.id} onClick={() => toggleOdooProduct(p.id)} className={`flex items-center gap-3 p-2.5 border-b cursor-pointer transition-all ${odooSelected.has(p.id) ? 'bg-green-50 border-green-200' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={odooSelected.has(p.id)} onChange={() => toggleOdooProduct(p.id)} className="w-4 h-4" onClick={e => e.stopPropagation()} />
                        <span className="flex-1 text-xs font-medium">{p.name}</span>
                        <span className="text-xs font-bold text-green-600 min-w-[50px] text-right">{p.stock} uds</span>
                        <span className="text-xs text-gray-500 min-w-[55px] text-right">${p.price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {cpmType === "empresa" && (
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                ℹ️ Contenido corporativo. No se busca inventario en Odoo.
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowCPMModal(false)}>Cancelar</Button>
              <Button size="sm" onClick={confirmCPM}>
                <CheckCircle2 className="w-3 h-3" /> Agregar CPM
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Piece Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowEditModal(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-[480px] relative">
            <button className="absolute top-3 right-4 text-gray-400 text-xl" onClick={() => setShowEditModal(false)}>✕</button>
            <h3 className="text-base font-bold mb-4">Editar pieza</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500 font-medium">CPM</label>
                <select value={editCPM} onChange={e => setEditCPM(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  {cpms.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  <option value="Contenido Guardado">Contenido Guardado</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Formato</label>
                <select value={editFormat} onChange={e => setEditFormat(e.target.value as ContentFormat)} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="supri">Video Supri</option>
                  <option value="persona">Video Persona</option>
                  <option value="carrusel">Carrusel</option>
                  <option value="post">Post</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 font-medium">Tema</label>
              <input value={editTopic} onChange={e => setEditTopic(e.target.value)} placeholder="Tema del contenido" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEditModal(false)}>Cancelar</Button>
              <Button size="sm" onClick={() => {
                const newCal = { ...calendar };
                if (!newCal[editSlot.key]) newCal[editSlot.key] = [];
                newCal[editSlot.key][editSlot.index] = { cpm: editCPM, format: editFormat, topic: editTopic, saved: editCPM === "Contenido Guardado" };
                setCalendar(newCal);
                setShowEditModal(false);
              }}>Guardar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════
// CALENDAR GRID COMPONENT
// ═══════════════════════════════════════════════
function CalendarGrid({ month, year, calendar, cpms, holidays, isPublishable, getDow, dateKey, getPieceNumber, onEditPiece, onAddPiece }: any) {
  const days = new Date(year, month, 0).getDate();
  const weekdays: number[] = [];
  for (let d = 1; d <= days; d++) {
    const w = getDow(month, year, d);
    if (w >= 1 && w <= 5) weekdays.push(d);
  }
  if (weekdays.length === 0) return <div className="text-center text-gray-400 py-8">Sin días publicables</div>;

  const firstDow = getDow(month, year, weekdays[0]);
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  let cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  weekdays.forEach(d => cells.push(d));
  while (cells.length % 5 !== 0) cells.push(null);

  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const fmtColors: Record<string, string> = { supri: "bg-blue-50 border-l-4 border-blue-600 text-blue-900", persona: "bg-green-50 border-l-4 border-green-600 text-green-900", carrusel: "bg-orange-50 border-l-4 border-orange-600 text-orange-900", post: "bg-gray-50 border-l-4 border-gray-500 text-gray-800", saved: "bg-yellow-50 border-l-4 border-yellow-500 text-yellow-800 border-dashed" };
  const fmtLabels: Record<string, string> = { supri: "Video Supri", persona: "Video Persona", carrusel: "Carrusel", post: "Post", saved: "Guardado" };

  return (
    <div className="overflow-x-auto">
      {/* Header */}
      <div className="grid grid-cols-5 gap-1.5 mb-1.5">
        {["Lun", "Mar", "Mié", "Jue", "Vie"].map(d => (
          <div key={d} className="text-center py-1.5 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold uppercase tracking-wide">{d}</div>
        ))}
      </div>
      {/* Weeks */}
      {Array.from({ length: Math.ceil(cells.length / 5) }).map((_, wi) => (
        <div key={wi} className="grid grid-cols-5 gap-1.5 mb-1.5">
          {cells.slice(wi * 5, wi * 5 + 5).map((d, di) => {
            if (d === null) return <div key={di} className="min-h-[100px] bg-gray-50 rounded-lg border border-gray-100" />;
            const dow = getDow(month, year, d);
            const key = dateKey(month, year, d);
            const pieces = calendar[key] || [];
            const hol = holidays.find((h: any) => h.date === key);
            const pub = isPublishable(month, year, d);

            return (
              <div key={di} className={`min-h-[100px] rounded-lg border-2 p-1.5 cursor-pointer transition-all hover:shadow-md ${hol && !hol.programmed ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white hover:border-blue-400'}`}>
                <div className={`text-sm font-extrabold ${hol && !hol.programmed ? 'text-red-600' : ''}`}>{d}</div>
                <div className={`text-[9px] font-semibold uppercase tracking-wide mb-1 ${hol && !hol.programmed ? 'text-red-500' : 'text-gray-400'}`}>{dayNames[dow]}</div>

                {hol && !hol.programmed ? (
                  <div className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full inline-block font-bold">FERIADO</div>
                ) : (
                  <div className="space-y-1">
                    {pieces.map((p: any, pi: number) => {
                      const pNum = getPieceNumber(key, pi);
                      const cls = p.saved ? fmtColors.saved : fmtColors[p.format] || "";
                      const label = p.saved ? "Guardado" : (fmtLabels[p.format] || p.format);
                      return (
                        <div key={pi} onClick={e => { e.stopPropagation(); onEditPiece(key, pi); }} className={`${cls} rounded-md px-1.5 py-1 cursor-pointer text-[10px] hover:brightness-95 transition-all`} draggable>
                          <div className="flex items-center gap-1">
                            <span className="bg-blue-600 text-white px-1 rounded text-[8px] font-bold">{pNum}</span>
                            <span className="font-bold truncate">{p.cpm}</span>
                          </div>
                          <div className="text-[8px] opacity-75">{label}</div>
                          {p.topic && <div className="text-[8px] italic opacity-60 truncate">{p.topic.substring(0, 30)}{p.topic.length > 30 ? "..." : ""}</div>}
                        </div>
                      );
                    })}
                    {pub && pieces.length < 2 && (
                      <div onClick={e => { e.stopPropagation(); onAddPiece(key); }} className="border-2 border-dashed border-gray-300 rounded-md p-1 text-center text-[9px] text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-all">
                        + agregar
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Helper (used in stats)
function countWorkdays() {
  // This is a simplified version; in production, use the month/year from state
  return 22;
}
