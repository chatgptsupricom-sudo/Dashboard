"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  ToggleLeft,
  ToggleRight,
  Package,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

interface SpiffRule {
  id: number;
  company_id: number;
  brand_name: string;
  tipo: string;
  product_name: string | null;
  product_id: number | null;
  target_amount: number;
  spiff_amount: number;
  modo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  active: number;
  created_at: string;
}

interface OdooProduct {
  id: number;
  name: string;
  marca: string;
}

interface SpiffManagerProps {
  companyId?: number;
  showCompanyFilter?: boolean;
  title?: string;
  subtitle?: string;
}

const emptyForm = {
  brand_name: "",
  target_amount: "",
  spiff_amount: "",
  tipo: "marca",
  product_name: "",
  product_id: null as number | null,
  modo: "acumulado",
  fecha_inicio: "",
  fecha_fin: "",
};

export default function SpiffManager({
  companyId,
  showCompanyFilter = false,
  title = "Gestión de Spiffs",
  subtitle = "Crear, modificar y eliminar reglas de spiff",
}: SpiffManagerProps) {
  const [rules, setRules] = useState<SpiffRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<SpiffRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filterCompany, setFilterCompany] = useState<string>(companyId?.toString() || "");
  const [brands, setBrands] = useState<string[]>([]);
  const [products, setProducts] = useState<OdooProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  useEffect(() => {
    fetch("/api/spiff/brands", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]));
  }, []);

  const fetchProducts = useCallback((q: string, brand?: string) => {
    const params = new URLSearchParams();
    if (q) params.append("q", q);
    if (brand) params.append("brand", brand);
    fetch(`/api/spiff/products?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (form.tipo === "producto") {
      fetchProducts(productSearch, form.brand_name || undefined);
    }
  }, [productSearch, form.tipo, form.brand_name, fetchProducts]);

  const fetchRules = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (showCompanyFilter && filterCompany) params.append("company_id", filterCompany);
    else if (companyId) params.append("company_id", companyId.toString());

    fetch(`/api/spiff/rules?${params.toString()}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Error fetching rules");
        return res.json();
      })
      .then((data) => setRules(Array.isArray(data) ? data : []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, [companyId, filterCompany, showCompanyFilter]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSave = async () => {
    if (!form.brand_name || !form.target_amount || !form.spiff_amount) return;
    const body: any = {
      company_id: companyId || (filterCompany ? parseInt(filterCompany) : undefined),
      brand_name: form.brand_name,
      target_amount: parseFloat(form.target_amount),
      spiff_amount: parseFloat(form.spiff_amount),
      tipo: form.tipo,
      modo: form.modo,
      product_name: form.tipo === "producto" ? form.product_name : null,
      product_id: form.tipo === "producto" ? form.product_id : null,
      fecha_inicio: form.fecha_inicio || null,
      fecha_fin: form.fecha_fin || null,
    };

    if (editingRule) {
      await fetch("/api/spiff/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: editingRule.id, ...body }),
      });
    } else {
      await fetch("/api/spiff/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
    }
    setForm(emptyForm);
    setEditingRule(null);
    setShowForm(false);
    setProductSearch("");
    fetchRules();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta regla?")) return;
    await fetch("/api/spiff/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    });
    fetchRules();
  };

  const handleToggle = async (rule: SpiffRule) => {
    await fetch("/api/spiff/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: rule.id, active: rule.active ? 0 : 1 }),
    });
    fetchRules();
  };

  const startEdit = (rule: SpiffRule) => {
    setEditingRule(rule);
    setForm({
      brand_name: rule.brand_name,
      target_amount: rule.target_amount.toString(),
      spiff_amount: rule.spiff_amount.toString(),
      tipo: rule.tipo || "marca",
      product_name: rule.product_name || "",
      product_id: rule.product_id || null,
      modo: rule.modo || "acumulado",
      fecha_inicio: rule.fecha_inicio ? rule.fecha_inicio.split("T")[0] : "",
      fecha_fin: rule.fecha_fin ? rule.fecha_fin.split("T")[0] : "",
    });
    setProductSearch(rule.product_name || "");
    setShowForm(true);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Sin fin";
    return new Date(d).toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 rounded-2xl">
            <Award size={28} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900">{title}</h1>
            <p className="text-sm text-slate-400 font-medium">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingRule(null); setForm(emptyForm); setProductSearch(""); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors"
        >
          <Plus size={16} /> Nueva Regla
        </button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border border-amber-200 shadow-sm bg-amber-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-700">{editingRule ? "Editar Regla" : "Nueva Regla de Spiff"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-200 rounded-lg"><X size={16} /></button>
            </div>

            {/* Row 1: Tipo + Modo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Tipo de Regla</label>
                <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-0.5">
                  <button
                    onClick={() => setForm({ ...form, tipo: "marca", product_name: "", product_id: null })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.tipo === "marca" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Por Marca
                  </button>
                  <button
                    onClick={() => setForm({ ...form, tipo: "producto" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.tipo === "producto" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Por Producto
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Modo de Cálculo</label>
                <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-0.5">
                  <button
                    onClick={() => setForm({ ...form, modo: "acumulado" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.modo === "acumulado" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Acumulado
                  </button>
                  <button
                    onClick={() => setForm({ ...form, modo: "individual" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.modo === "individual" ? "bg-blue-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Individual
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Marca + Producto (si tipo=producto) + Montos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  {form.tipo === "producto" ? "Marca (filtro)" : "Marca"}
                </label>
                <select
                  value={form.brand_name}
                  onChange={(e) => setForm({ ...form, brand_name: e.target.value, product_name: "", product_id: null })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar marca...</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              {form.tipo === "producto" && (
                <div className="relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Producto</label>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); setForm({ ...form, product_name: e.target.value, product_id: null }); }}
                    onFocus={() => setShowProductDropdown(true)}
                    placeholder="Buscar producto..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                  />
                  {showProductDropdown && products.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {products.slice(0, 20).map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setForm({ ...form, product_name: p.name, product_id: p.id }); setProductSearch(p.name); setShowProductDropdown(false); }}
                          className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-amber-50 transition-colors border-b last:border-none"
                        >
                          <span className="text-slate-700">{p.name}</span>
                          <span className="text-slate-400 ml-2">({p.marca})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Meta de Venta ($)</label>
                <input
                  type="number"
                  value={form.target_amount}
                  onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                  placeholder="5000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Row 3: Spiff por meta + Fechas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Spiff por Meta ($)</label>
                <input
                  type="number"
                  value={form.spiff_amount}
                  onChange={(e) => setForm({ ...form, spiff_amount: e.target.value })}
                  placeholder="100"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Fecha Inicio</label>
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Fecha Fin</label>
                <input
                  type="date"
                  value={form.fecha_fin}
                  onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Mode info */}
            <div className="mt-3 p-2.5 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium">
                {form.modo === "acumulado"
                  ? "Acumulado: Se suman todas las ventas de la marca/producto y se calcula el spiff sobre el total acumulado."
                  : "Individual: Se calcula el spiff por cada venta/factura individual que alcance la meta."}
                {form.fecha_inicio || form.fecha_fin ? ` | Vigencia: ${form.fecha_inicio || "Sin inicio"} → ${form.fecha_fin || "Sin fin"}` : " | Sin rango de fechas (siempre activo)"}
              </p>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors"
              >
                <Save size={14} /> {editingRule ? "Actualizar" : "Crear"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-900 text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <Award size={16} className="text-amber-500" /> Reglas de Spiff
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-slate-400 font-medium">Cargando...</div>
          ) : rules.length === 0 ? (
            <div className="py-12 text-center">
              <Award size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400 font-medium">No hay reglas de spiff configuradas</p>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="bg-slate-50 px-5 py-2.5 flex items-center text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <span className="flex-1">Tipo / Nombre</span>
                <span className="w-16 text-center">Modo</span>
                <span className="w-24 text-center">Meta</span>
                <span className="w-20 text-center">Spiff</span>
                <span className="w-24 text-center">Vigencia</span>
                <span className="w-16 text-center">Estado</span>
                <span className="w-20 text-center">Acciones</span>
              </div>
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center px-5 py-3 border-b last:border-none hover:bg-slate-50/50 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {rule.tipo === "producto" ? (
                        <Package size={12} className="text-blue-500 flex-shrink-0" />
                      ) : (
                        <Award size={12} className="text-amber-500 flex-shrink-0" />
                      )}
                      <p className="text-xs font-bold text-slate-700 uppercase truncate">{rule.brand_name}</p>
                    </div>
                    {rule.tipo === "producto" && rule.product_name && (
                      <p className="text-[10px] text-slate-400 truncate pl-5">{rule.product_name}</p>
                    )}
                  </div>
                  <div className="w-16 text-center">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${rule.modo === "acumulado" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                      {rule.modo === "acumulado" ? "Acum." : "Indiv."}
                    </span>
                  </div>
                  <div className="w-24 text-center">
                    <span className="text-xs font-black text-slate-600 tabular-nums">${rule.target_amount.toLocaleString()}</span>
                  </div>
                  <div className="w-20 text-center">
                    <span className="text-xs font-black text-amber-600 tabular-nums">${rule.spiff_amount.toLocaleString()}</span>
                  </div>
                  <div className="w-24 text-center">
                    <span className="text-[9px] font-bold text-slate-500">
                      {rule.fecha_inicio || rule.fecha_fin ? `${formatDate(rule.fecha_inicio)} → ${formatDate(rule.fecha_fin)}` : "Siempre"}
                    </span>
                  </div>
                  <div className="w-16 text-center">
                    <button onClick={() => handleToggle(rule)} className={`${rule.active ? "text-emerald-500" : "text-slate-300"}`}>
                      {rule.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                  <div className="w-20 flex gap-1 justify-center">
                    <button onClick={() => startEdit(rule)} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
