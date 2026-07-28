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
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";

interface SpiffRule {
  id: number;
  company_id: number;
  brand_name: string;
  target_amount: number;
  spiff_amount: number;
  active: number;
  created_at: string;
}

interface SpiffManagerProps {
  companyId?: number;
  showCompanyFilter?: boolean;
  title?: string;
  subtitle?: string;
}

export default function SpiffManager({
  companyId,
  showCompanyFilter = false,
  title = "Gestión de Spiffs",
  subtitle = "Crear, modificar y eliminar reglas de spiff por marca",
}: SpiffManagerProps) {
  const [rules, setRules] = useState<SpiffRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<SpiffRule | null>(null);
  const [form, setForm] = useState({ brand_name: "", target_amount: "", spiff_amount: "" });
  const [filterCompany, setFilterCompany] = useState<string>(companyId?.toString() || "");
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/spiff/brands", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]));
  }, []);

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
    const body = {
      company_id: companyId || (filterCompany ? parseInt(filterCompany) : undefined),
      brand_name: form.brand_name,
      target_amount: parseFloat(form.target_amount),
      spiff_amount: parseFloat(form.spiff_amount),
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
    setForm({ brand_name: "", target_amount: "", spiff_amount: "" });
    setEditingRule(null);
    setShowForm(false);
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
    });
    setShowForm(true);
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
          onClick={() => { setShowForm(!showForm); setEditingRule(null); setForm({ brand_name: "", target_amount: "", spiff_amount: "" }); }}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Marca</label>
                <select
                  value={form.brand_name}
                  onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar marca...</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
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
              <div className="bg-slate-50 px-5 py-2.5 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <span>Marca</span>
                <span>Meta</span>
                <span>Spiff/Meta</span>
                <span>Estado</span>
                <span className="text-right">Acciones</span>
              </div>
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-4 px-5 py-3 border-b last:border-none hover:bg-slate-50/50 transition-all">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-700 uppercase">{rule.brand_name}</p>
                  </div>
                  <div className="w-28 text-right">
                    <span className="text-xs font-black text-slate-600 tabular-nums">${rule.target_amount.toLocaleString()}</span>
                  </div>
                  <div className="w-28 text-right">
                    <span className="text-xs font-black text-amber-600 tabular-nums">${rule.spiff_amount.toLocaleString()}</span>
                  </div>
                  <div className="w-20 text-center">
                    <button onClick={() => handleToggle(rule)} className={`${rule.active ? "text-emerald-500" : "text-slate-300"}`}>
                      {rule.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                  <div className="flex gap-1 w-20 justify-end">
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
