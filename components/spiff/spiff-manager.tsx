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
  Building2,
  Trophy,
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

interface Company {
  cid: string;
  name: string;
}

interface SpiffManagerProps {
  companyId?: number;
  showCompanyFilter?: boolean;
  title?: string;
  subtitle?: string;
}

const emptyForm = {
  company_id: "",
  brand_name: "",
  target_amount: "",
  spiff_amount: "",
  tipo: "marca",
  product_name: "",
  product_id: null as number | null,
  modo: "monto",
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
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [rankingModal, setRankingModal] = useState<{ rule: SpiffRule; data: any[]; loading: boolean } | null>(null);

  useEffect(() => {
    if (showCompanyFilter) {
      fetch("/api/superadmin/empresas", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setCompanies(Array.isArray(data) ? data : []))
        .catch(() => setCompanies([]));
    }
  }, [showCompanyFilter]);

  useEffect(() => {
    setBrandsLoading(true);
    fetch("/api/spiff/brands", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(() => setBrands([]))
      .finally(() => setBrandsLoading(false));
  }, []);

  useEffect(() => {
    if (form.tipo === "producto") {
      const params = new URLSearchParams();
      if (form.brand_name) params.append("brand", form.brand_name);
      fetch(`/api/spiff/products?${params.toString()}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setProducts(Array.isArray(data) ? data : []))
        .catch(() => setProducts([]));
    }
  }, [form.tipo, form.brand_name]);

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

    let selectedCompanyId: number | undefined;
    if (showCompanyFilter) {
      selectedCompanyId = form.company_id ? parseInt(form.company_id) : undefined;
    } else {
      selectedCompanyId = companyId;
    }

    const body: any = {
      company_id: selectedCompanyId,
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
      company_id: rule.company_id?.toString() || "",
      brand_name: rule.brand_name,
      target_amount: rule.target_amount.toString(),
      spiff_amount: rule.spiff_amount.toString(),
      tipo: rule.tipo || "marca",
      product_name: rule.product_name || "",
      product_id: rule.product_id || null,
      modo: rule.modo || "monto",
      fecha_inicio: rule.fecha_inicio ? rule.fecha_inicio.split("T")[0] : "",
      fecha_fin: rule.fecha_fin ? rule.fecha_fin.split("T")[0] : "",
    });
    setShowForm(true);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Sin fin";
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return d;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
  };

  const getCompanyName = (companyId: number) => {
    const company = companies.find((c) => parseInt(c.cid) === companyId);
    return company?.name || `CID ${companyId}`;
  };

  const isMontoMode = form.modo === "monto";

  const handleViewRanking = async (rule: SpiffRule) => {
    setRankingModal({ rule, data: [], loading: true });
    try {
      const res = await fetch(`/api/vendedores/spiff?company_id=${rule.company_id}`, { credentials: "include" });
      const json = await res.json();
      const sellerBrandData = json.sellerBrandData || {};
      const ruleMeta = rule.target_amount;
      const ruleTarget = rule.target_amount;
      const ruleSpiff = rule.spiff_amount;

      const rows = Object.entries(sellerBrandData)
        .map(([nombre, sbd]: [string, any]) => {
          if (nombre === "Asistente de Ventas" || nombre.toUpperCase().trim() === "MARIA AUXILIADORA TOVAR CARO") return null;
          const brandKey = Object.keys(sbd.marcas || {}).find(
            (k) => k.toLowerCase() === rule.brand_name.toLowerCase()
          );
          const brandInfo = brandKey ? sbd.marcas[brandKey] : { monto: 0, cantidad: 0, spiff: 0 };
          const metaAlcanzadas = rule.modo === "monto"
            ? Math.floor(brandInfo.monto / ruleTarget)
            : Math.floor(brandInfo.cantidad / ruleTarget);
          const spiffGanado = metaAlcanzadas * ruleSpiff;
          return {
            nombre,
            unidades: brandInfo.cantidad,
            monto: brandInfo.monto,
            metaAlcanzadas,
            spiff: spiffGanado,
          };
        })
        .filter(Boolean)
        .filter((r: any) => r.monto > 0 || r.unidades > 0)
        .sort((a, b) => b.spiff - a.spiff || b.monto - a.monto);

      setRankingModal({ rule, data: rows, loading: false });
    } catch {
      setRankingModal((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  const groupedRules = showCompanyFilter
    ? rules.reduce<Record<number, SpiffRule[]>>((acc, rule) => {
        const cid = rule.company_id;
        if (!acc[cid]) acc[cid] = [];
        acc[cid].push(rule);
        return acc;
      }, {})
    : null;

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
        <div className="flex items-center gap-3">
          {showCompanyFilter && (
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
            >
              <option value="">Todas las empresas</option>
              {companies.map((c) => (
                <option key={c.cid} value={c.cid}>{c.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => { setShowForm(!showForm); setEditingRule(null); setForm(emptyForm); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors"
          >
            <Plus size={16} /> Nueva Regla
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="rounded-2xl border border-amber-200 shadow-sm bg-amber-50/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-700">{editingRule ? "Editar Regla" : "Nueva Regla de Spiff"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-slate-200 rounded-lg"><X size={16} /></button>
            </div>

            {/* Row 0: Empresa (superAdmin only) */}
            {showCompanyFilter && (
              <div className="mb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Empresa</label>
                <select
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                >
                  <option value="">Seleccionar empresa...</option>
                  {companies.map((c) => (
                    <option key={c.cid} value={c.cid}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

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
                    onClick={() => setForm({ ...form, modo: "monto" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.modo === "monto" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Monto
                  </button>
                  <button
                    onClick={() => setForm({ ...form, modo: "cantidad" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.modo === "cantidad" ? "bg-blue-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    Cantidad
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Marca + Producto + Meta */}
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
                  <option value="">{brandsLoading ? "Cargando marcas..." : "Seleccionar marca..."}</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              {form.tipo === "producto" && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Producto</label>
                  <select
                    value={form.product_id || ""}
                    onChange={(e) => {
                      const selected = products.find((p) => p.id === parseInt(e.target.value));
                      setForm({
                        ...form,
                        product_id: selected ? selected.id : null,
                        product_name: selected ? selected.name : "",
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                  >
                    <option value="">{!form.brand_name ? "Primero selecciona marca..." : products.length === 0 ? "Cargando productos..." : "Seleccionar producto..."}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                  {isMontoMode ? "Meta de Venta ($)" : "Meta de Unidades"}
                </label>
                <input
                  type="number"
                  value={form.target_amount}
                  onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                  placeholder={isMontoMode ? "5000" : "100"}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-white outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* Row 3: Spiff + Fechas */}
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

            <div className="mt-3 p-2.5 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium">
                {isMontoMode
                  ? "Monto: Se suman las ventas ($) de la marca/producto y se calcula el spiff cuando el total supera la meta."
                  : "Cantidad: Se suman las unidades vendidas y se calcula el spiff cuando se alcanza la meta de unidades."}
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
          ) : showCompanyFilter && groupedRules ? (
            <div className="flex flex-col">
              {Object.entries(groupedRules)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([companyIdStr, groupRules]) => (
                  <div key={companyIdStr} className="border-b last:border-none">
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
                      <Building2 size={14} className="text-slate-400" />
                      <span className="text-xs font-black text-slate-600 uppercase">{getCompanyName(parseInt(companyIdStr))}</span>
                      <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-md">{groupRules.length} reglas</span>
                    </div>
                    {groupRules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onEdit={startEdit}
                        onDelete={handleDelete}
                        onToggle={handleToggle}
                        onViewRanking={handleViewRanking}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                ))}
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
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  onViewRanking={handleViewRanking}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking Modal */}
      {rankingModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setRankingModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-h-[80vh] overflow-hidden shadow-2xl w-fit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Trophy size={20} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">Ranking de Spiff</h2>
                  <p className="text-[11px] text-slate-400 font-medium">{rankingModal.rule.brand_name}</p>
                </div>
              </div>
              <button
                onClick={() => setRankingModal(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
              {rankingModal.loading ? (
                <div className="py-12 text-center text-slate-400 font-medium">Cargando ranking...</div>
              ) : rankingModal.data.length === 0 ? (
                <div className="py-12 text-center">
                  <Trophy size={36} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-sm text-slate-400">No hay datos de ranking</p>
                </div>
              ) : (
                <div className="flex flex-col max-h-[50vh] overflow-y-auto">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="w-10 py-2 text-center">#</th>
                        <th className="py-2 text-left px-3">Vendedor</th>
                        <th className="w-16 py-2 text-center">Unidad</th>
                        <th className="w-24 py-2 text-center">Monto</th>
                        <th className="w-16 py-2 text-center">Metas</th>
                        <th className="w-20 py-2 text-center">Spiff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingModal.data
                        .sort((a, b) => b.spiff - a.spiff || b.monto - a.monto)
                        .map((seller, i) => (
                          <tr key={seller.nombre} className="border-b last:border-none hover:bg-slate-50/50 transition-all">
                            <td className="py-3 text-center">
                              {i === 0 ? <Trophy size={16} className="text-yellow-500 inline" /> :
                               i === 1 ? <Trophy size={16} className="text-slate-400 inline" /> :
                               i === 2 ? <Trophy size={16} className="text-amber-600 inline" /> :
                               <span className="text-xs font-black text-slate-300">{i + 1}</span>}
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-xs font-bold text-slate-700">{seller.nombre}</span>
                            </td>
                            <td className="py-3 text-center">
                              <span className="text-[10px] font-bold text-slate-600">{seller.unidades}</span>
                            </td>
                            <td className="py-3 text-center">
                              <span className="text-[10px] font-bold text-slate-700 tabular-nums">${seller.monto.toLocaleString()}</span>
                            </td>
                            <td className="py-3 text-center">
                              <span className={`text-[10px] font-black ${seller.metaAlcanzadas > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                {seller.metaAlcanzadas}x
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              <span className={`text-xs font-black ${seller.spiff > 0 ? "text-amber-600" : "text-slate-400"}`}>
                                ${seller.spiff.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
  onViewRanking,
  formatDate,
}: {
  rule: SpiffRule;
  onEdit: (rule: SpiffRule) => void;
  onDelete: (id: number) => void;
  onToggle: (rule: SpiffRule) => void;
  onViewRanking: (rule: SpiffRule) => void;
  formatDate: (d: string | null) => string;
}) {
  return (
    <div
      className="flex items-center px-5 py-3 border-b last:border-none hover:bg-slate-50/50 cursor-pointer transition-all"
      onClick={() => onViewRanking(rule)}
    >
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
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${rule.modo === "monto" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
          {rule.modo === "monto" ? "Monto" : "Cant."}
        </span>
      </div>
      <div className="w-24 text-center">
        <span className="text-xs font-black text-slate-600 tabular-nums">
          {rule.modo === "monto" ? `$${rule.target_amount.toLocaleString()}` : `${rule.target_amount} uds`}
        </span>
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
        <button onClick={(e) => { e.stopPropagation(); onToggle(rule); }} className={`${rule.active ? "text-emerald-500" : "text-slate-300"}`}>
          {rule.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
        </button>
      </div>
      <div className="w-20 flex gap-1 justify-center">
        <button onClick={(e) => { e.stopPropagation(); onEdit(rule); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors">
          <Pencil size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(rule.id); }} className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
