export const metadata = {
  title: "Inteligencia de precios | Inteligencia de Negocio",
  description: "Precios de la competencia ordenados y comparados con los de Supricom",
};

/**
 * Inteligencia de precios: el tablero HTML (public/inteligencia-precios/index.html)
 * dentro del panel. El HTML no trae datos: los pide con la sesión a
 * /api/inteligencia-negocio/precios (listas cargadas, ventas de Odoo y el
 * reporte mensual) y su botón «Cargar listas» sube las listas de los
 * mayoristas para ordenarlas (lib/inteligencia-negocio/precios).
 */
export default function PreciosPage() {
  return (
    <div className="-m-4 md:-m-8">
      <iframe
        src="/inteligencia-precios/index.html"
        title="Inteligencia de precios"
        className="block w-full border-0 bg-[#f3f4f6]"
        style={{ height: "calc(100dvh - 4rem)" }}
      />
    </div>
  );
}
