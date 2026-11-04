"use client";

import { IntegracionPagos } from "@/components/cxc/IntegracionPagos";

// El reporte "Integración de Pagos" de Odoo (lib/cxc/integracionPagos.ts).
export default function IntegracionDePagoPage() {
  return <IntegracionPagos api="/api/superadmin/integraciondepago" eligeSede={true} />;
}
