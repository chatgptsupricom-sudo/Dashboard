"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Search, Wrench, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/stores/auth.store";

interface OdooProduct {
  id: number;
  default_code: string;
  name: string;
  hardware: string;
  brand: string;
  model: string;
  list_price: number;
  type: string;
  invoice_number: string;
  image: string;
}

export default function RmaNuevoPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "es";

  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_code: "",
    hardware: "",
    brand: "",
    model: "",
    invoice_number: "",
    client_name: "",
    client_phone: "",
    serial_quantity: "",
    reported_fault: "",
    status: "recibido",
  });
  const [hasSerial, setHasSerial] = useState<"yes" | "no" | null>(null);

  // Product search state
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<OdooProduct[]>([]);
  const [searchingProduct, setSearchingProduct] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [odooProductId, setOdooProductId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setProductResults([]);
      setShowDropdown(false);
      return;
    }

    try {
      setSearchingProduct(true);
      const res = await fetch(`/api/rma/products?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setProductResults(data);
      setShowDropdown(data.length > 0);
    } catch (error) {
      console.error("Error searching products:", error);
      setProductResults([]);
    } finally {
      setSearchingProduct(false);
    }
  }, []);

  const handleProductCodeChange = (value: string) => {
    setForm((prev) => ({ ...prev, product_code: value }));
    setOdooProductId(null);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchProducts(value);
    }, 300);
  };

  const handleSelectProduct = (product: OdooProduct) => {
    setForm((prev) => ({
      ...prev,
      product_code: product.default_code,
      hardware: product.hardware,
      brand: product.brand,
      model: product.model,
    }));
    setOdooProductId(product.id);
    setShowDropdown(false);
    setProductResults([]);

    // If serial is already selected as yes, fetch invoice from Odoo
    if (hasSerial === "yes") {
      fetchInvoiceForProduct(product.id);
    }
  };

  const fetchInvoiceForProduct = async (productId: number) => {
    try {
      const res = await fetch(`/api/rma/products?q=${encodeURIComponent(form.product_code)}&fetch_invoice=1`);
      const data = await res.json();
      const product = data.find((p: OdooProduct) => p.id === productId);
      if (product?.invoice_number) {
        setForm((prev) => ({ ...prev, invoice_number: product.invoice_number }));
      }
    } catch (error) {
      console.error("Error fetching invoice:", error);
    }
  };

  const handleClearProduct = () => {
    setForm((prev) => ({
      ...prev,
      product_code: "",
      hardware: "",
      brand: "",
      model: "",
      invoice_number: "",
    }));
    setOdooProductId(null);
    setProductSearch("");
    setHasSerial(null);
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.client_name || !form.reported_fault || !hasSerial) {
      alert(t("required_fields"));
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/rma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          created_by: user?.name || user?.email || "Usuario Actual",
          odoo_product_id: odooProductId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/${locale}/rma/casos/${data.id}`);
      } else {
        alert(data.error || "Error al crear caso");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al crear caso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/rma`)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Wrench className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("new_case")}</h1>
            <p className="text-sm text-slate-500">{t("new_case_desc")}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Producto */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("product_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Code with Autocomplete */}
            <div className="relative" ref={dropdownRef}>
              <Label className="text-sm font-medium text-slate-700">{t("product_code")}</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={form.product_code}
                  onChange={(e) => handleProductCodeChange(e.target.value)}
                  placeholder={t("product_code_placeholder")}
                  className="pl-10 pr-8"
                  onFocus={() => {
                    if (productResults.length > 0) setShowDropdown(true);
                  }}
                />
                {form.product_code && (
                  <button
                    type="button"
                    onClick={handleClearProduct}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {searchingProduct && (
                  <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && productResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                  {productResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelectProduct(product)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{product.default_code}</p>
                          <p className="text-xs text-slate-500">{product.model}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400">{product.brand}</span>
                          {product.hardware && (
                            <p className="text-[10px] text-blue-500">{product.hardware}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("hardware")}</Label>
                <Input
                  value={form.hardware}
                  onChange={(e) => handleChange("hardware", e.target.value)}
                  placeholder={t("hardware_placeholder")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("brand")}</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => handleChange("brand", e.target.value)}
                  placeholder={t("brand_placeholder")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("model")}</Label>
                <Input
                  value={form.model}
                  onChange={(e) => handleChange("model", e.target.value)}
                  placeholder={t("model_placeholder")}
                />
              </div>
            </div>

            {/* Serial number question */}
            <div className="pt-2">
              <Label className="text-sm font-medium text-slate-700">¿El producto tiene número de serial? *</Label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hasSerial"
                    value="yes"
                    checked={hasSerial === "yes"}
                    onChange={() => {
                      setHasSerial("yes");
                      if (odooProductId) {
                        fetchInvoiceForProduct(odooProductId);
                      }
                    }}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">Sí</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hasSerial"
                    value="no"
                    checked={hasSerial === "no"}
                    onChange={() => {
                      setHasSerial("no");
                      setForm((prev) => ({ ...prev, invoice_number: "" }));
                    }}
                    className="accent-blue-600"
                  />
                  <span className="text-sm text-slate-700">No</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("serial_quantity")}</Label>
                <Input
                  value={form.serial_quantity}
                  onChange={(e) => handleChange("serial_quantity", e.target.value)}
                  placeholder={t("serial_placeholder")}
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("invoice_number")}</Label>
                <Input
                  value={form.invoice_number}
                  onChange={(e) => handleChange("invoice_number", e.target.value)}
                  placeholder={t("invoice_placeholder")}
                  disabled={hasSerial === "yes"}
                  className={hasSerial === "yes" ? "bg-slate-100" : ""}
                  title={hasSerial === "yes" ? "La factura se trae automáticamente de Odoo" : "Ingresa el número de factura manualmente"}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cliente */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("client_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("client_name")} *</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => handleChange("client_name", e.target.value)}
                  placeholder={t("client_name_placeholder")}
                  required
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Teléfono del cliente</Label>
                <Input
                  value={form.client_phone}
                  onChange={(e) => handleChange("client_phone", e.target.value)}
                  placeholder="Ej: +58 424 1234567"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Falla */}
        <Card className="rounded-3xl border-none shadow-sm mb-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">{t("fault_info")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">{t("reported_fault")} *</Label>
              <Textarea
                value={form.reported_fault}
                onChange={(e) => handleChange("reported_fault", e.target.value)}
                placeholder={t("reported_fault_placeholder")}
                rows={4}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">{t("status_label")}</Label>
                <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recibido">{t("status_recibido")}</SelectItem>
                    <SelectItem value="reparado">{t("status_reparado")}</SelectItem>
                    <SelectItem value="nota_credito">{t("status_nota_credito")}</SelectItem>
                    <SelectItem value="no_procesado">{t("status_no_procesado")}</SelectItem>
                    <SelectItem value="reingresado">{t("status_reingresado")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push(`/${locale}/rma`)}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {t("save_case")}
          </Button>
        </div>
      </form>
    </div>
  );
}
