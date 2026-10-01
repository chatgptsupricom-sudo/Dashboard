"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { X, Calendar } from "lucide-react";
import ModalMonthPicker from "./ModalMonthPicker";

interface VisitasSemanalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiPrefix: string;
  /** company_id para las lecturas (GET); null cuando no se manda (vendedor / gerente de operaciones). */
  queryCompanyId: number | null;
  /** company_id para el alta (POST); null cuando no se manda (vendedor). */
  postCompanyId: number | null;
  /** El gerente de operaciones ve el modal en solo lectura: sin formulario ni borrar. */
  gerenteOpsMode: boolean;
  /** Vendedores disponibles para el selector (de kpiData.sellers). */
  sellers: any[];
  defaultMes: string;
}

const EMPTY_FORM = {
  seller_name: "",
  seller_user_id: "" as string | number,
  client_name: "",
  is_prospect: false,
  visit_date: new Date().toISOString().split("T")[0],
};

// Modal "Visitas semanales": alta de visitas (vendedor + cliente/prospecto +
// fecha) y listado del mes, con borrado. Autocontenido. Extraído de
// StoplightReport.tsx (audit #23).
export default function VisitasSemanalesModal({
  isOpen, onClose, apiPrefix, queryCompanyId, postCompanyId, gerenteOpsMode, sellers, defaultMes,
}: VisitasSemanalesModalProps) {
  const t = useTranslations("stoplight");
  const locale = useLocale();

  const [mes, setMes] = useState(defaultMes);
  const [loading, setLoading] = useState(false);
  const [visitas, setVisitas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [clientesLoading, setClientesLoading] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const buildQuery = (extras: Record<string, string> = {}) => {
    const params = new URLSearchParams({ mes, ...extras });
    if (queryCompanyId != null) params.set("company_id", String(queryCompanyId));
    return params.toString();
  };

  useEffect(() => {
    if (isOpen) {
      setMes(defaultMes);
      setForm({ ...EMPTY_FORM, visit_date: new Date().toISOString().split("T")[0] });
      setFormError(null);
      setClientSearch("");
      setDropdownOpen(false);
    }
  }, [isOpen, defaultMes]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${apiPrefix}/weekly-visits?${buildQuery()}`);
        const json = await res.json();
        if (!cancelled && json.success) setVisitas(json.data);
      } catch (e) {
        console.error("Error fetching visitas:", e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mes, queryCompanyId, apiPrefix]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-client-dropdown]")) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const fetchClientes = async (sellerName: string) => {
    try {
      setClientesLoading(true);
      const seller = sellers.find((s: any) => s.nombre === sellerName);
      if (!seller) { setClientes([]); return; }
      const res = await fetch(`${apiPrefix}/seller-clients?${buildQuery({ seller_user_id: String(seller.user_id) })}`);
      const data = await res.json();
      if (data.success) setClientes(data.data);
    } catch (e) {
      console.error("Error fetching clients:", e);
    } finally {
      setClientesLoading(false);
    }
  };

  const submit = async () => {
    setFormError(null);
    if (!form.seller_name || !form.client_name || !form.visit_date) {
      setFormError(t("completa_campos"));
      return;
    }
    setFormLoading(true);
    try {
      const fd = new FormData();
      fd.append("seller_name", form.seller_name);
      fd.append("client_name", form.client_name);
      fd.append("is_prospect", String(form.is_prospect));
      fd.append("visit_date", form.visit_date);
      if (postCompanyId != null) fd.append("company_id", String(postCompanyId));

      const res = await fetch(`${apiPrefix}/weekly-visits`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        const resVisits = await fetch(`${apiPrefix}/weekly-visits?${buildQuery()}`);
        const jsonVisits = await resVisits.json();
        if (jsonVisits.success) setVisitas(jsonVisits.data);
        setForm({ ...EMPTY_FORM, visit_date: new Date().toISOString().split("T")[0] });
      } else {
        setFormError(json.error || t("error_guardar_visita"));
      }
    } catch (e) {
      console.error("Error saving visit:", e);
      setFormError(t("error_guardar_visita"));
    }
    setFormLoading(false);
  };

  const remove = async (id: number) => {
    try {
      const res = await fetch(`${apiPrefix}/weekly-visits?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setVisitas((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (e) {
      console.error("Error deleting visit:", e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Calendar size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{t("visitas_title")}</h2>
              <p className="text-sm text-slate-500 mt-1">
                {t("visitas_subtitle", { count: sellers.length, mes })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModalMonthPicker value={mes} onChange={setMes} />
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              {t("loading")}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Formulario Nueva Visita */}
              {!gerenteOpsMode && (
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("registrar_visita")}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Selector de Vendedor */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t("vendedor_label")}</label>
                    <select
                      value={form.seller_name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const seller = sellers.find((s: any) => s.nombre === name);
                        setForm({ ...form, seller_name: name, seller_user_id: seller?.user_id || "", client_name: "" });
                        setClientSearch("");
                        setDropdownOpen(false);
                        if (name) fetchClientes(name);
                        else setClientes([]);
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="">{t("seleccionar_vendedor")}</option>
                      {sellers.map((s: any, i: number) => (
                        <option key={`${s.id}-${i}`} value={s.nombre}>{s.nombre}</option>
                      ))}
                    </select>
                  </div>

                  {/* Selector de Cliente / Prospecto */}
                  <div className="relative" data-client-dropdown>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t("cliente_label")}</label>
                    {form.is_prospect ? (
                      <input
                        type="text"
                        value={form.client_name}
                        onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                        placeholder={t("nombre_prospecto")}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          value={clientSearch || form.client_name}
                          onChange={(e) => {
                            setClientSearch(e.target.value);
                            setForm({ ...form, client_name: "" });
                            setDropdownOpen(true);
                          }}
                          onFocus={() => { if (form.seller_name) setDropdownOpen(true); }}
                          placeholder={
                            !form.seller_name
                              ? t("selecciona_primero")
                              : clientesLoading
                                ? t("cargando_clientes")
                                : t("buscar_cliente")
                          }
                          disabled={!form.seller_name || clientesLoading}
                          className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                        {dropdownOpen && form.seller_name && !clientesLoading && (
                          <div className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                            {clientes.filter((c: any) =>
                              c.name.toLowerCase().includes(clientSearch.toLowerCase())
                            ).length === 0 ? (
                              <div className="px-3 py-2 text-xs text-slate-400">{t("no_clientes")}</div>
                            ) : (
                              clientes
                                .filter((c: any) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                .map((c: any, i: number) => (
                                  <button
                                    key={`${c.id}-${i}`}
                                    type="button"
                                    onClick={() => {
                                      setForm({ ...form, client_name: c.name });
                                      setClientSearch("");
                                      setDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors truncate"
                                  >
                                    {c.name}
                                  </button>
                                ))
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={form.is_prospect}
                        onChange={(e) => {
                          setForm({ ...form, is_prospect: e.target.checked, client_name: "" });
                          setClientSearch("");
                          setDropdownOpen(false);
                        }}
                        className="rounded border-slate-300"
                      />
                      {t("prospecto")}
                    </label>
                  </div>

                  {/* Fecha de Visita */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{t("fecha_visita")}</label>
                    <input
                      type="date"
                      value={form.visit_date}
                      onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                </div>
                <div className="mt-4 flex items-center justify-end gap-3">
                  {formError && (
                    <span className="text-xs text-rose-600">{formError}</span>
                  )}
                  <button
                    onClick={submit}
                    disabled={formLoading || !form.seller_name || !form.client_name || !form.visit_date}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {formLoading ? t("guardando") : t("guardar_visita")}
                  </button>
                </div>
              </div>
              )}

              {/* Lista de Visitas */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-4">{t("visitas_registradas", { count: visitas.length })}</h3>
                {visitas.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">
                    {t("no_visitas")}
                  </div>
                ) : (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b">
                          <th className="p-3 text-left font-medium text-slate-600">{t("fecha")}</th>
                          <th className="p-3 text-left font-medium text-slate-600">{t("vendedor")}</th>
                          <th className="p-3 text-left font-medium text-slate-600">{t("cliente")}</th>
                          <th className="p-3 text-center font-medium text-slate-600">{t("tipo")}</th>
                          {!gerenteOpsMode && <th className="p-3 text-center font-medium text-slate-600">{t("acciones")}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visitas.map((visita: any) => (
                          <tr key={visita.id} className="border-b hover:bg-indigo-50/40 transition-colors">
                            <td className="p-3 text-slate-800">
                              {new Date(visita.visit_date).toLocaleDateString(locale)}
                            </td>
                            <td className="p-3 font-medium text-slate-800">{visita.seller_name}</td>
                            <td className="p-3 text-slate-800">{visita.client_name}</td>
                            <td className="p-3 text-center">
                              {visita.is_prospect ? (
                                <span className="px-2 py-0.5 bg-amber-100 text-indigo-700 rounded text-xs font-medium">
                                  {t("prospecto_label")}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                                  {t("cliente")}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {!gerenteOpsMode && (
                              <button
                                onClick={() => remove(visita.id)}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                {t("eliminar")}
                              </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
