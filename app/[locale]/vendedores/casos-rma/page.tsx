import { CasosRmaClientes } from "@/components/vendedores/rma/CasosRmaClientes";

/**
 * RMA de los clientes del vendedor (solo lectura). La ruta no se llama
 * /vendedores/rma porque el guard de middleware.ts manda todo lo que contiene
 * "/rma" al rol RMA.
 */
export default function CasosRmaPage() {
  return <CasosRmaClientes />;
}
