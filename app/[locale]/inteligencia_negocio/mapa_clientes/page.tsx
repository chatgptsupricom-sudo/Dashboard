// Mapa de Clientes del SuperAdmin. No vive en /inteligencia_negocio/vendedores:
// el middleware manda al Dashboard a todo el que no sea vendedor si la ruta
// contiene "/vendedores" (lo mismo le pasó a Gerencia de Operaciones).
export { default } from "../../superadmin/vendedores/page";
