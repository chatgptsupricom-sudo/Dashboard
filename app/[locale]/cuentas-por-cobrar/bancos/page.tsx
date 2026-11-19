"use client";

import ConciliacionBancaria from "@/components/administracion/ConciliacionBancaria";

// Cuentas por Cobrar: solo los comprobantes de los clientes (Administracion concilia el estado de cuenta).
export default function ComprobantesBancariosCxCPage() {
  return <ConciliacionBancaria modo="cxc" />;
}
