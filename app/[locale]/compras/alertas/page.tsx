export default function AlertasComprasPage() {
  // Aquí posteriormente harías el fetch a tu API interna para traer las órdenes pendientes
  const ordenesPendientes = [];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Alertas de Aprobación</h1>
      <p className="text-gray-600 mb-6">
        Órdenes de compra que requieren de su aprobación para proceder.
      </p>

      <div className="bg-white shadow rounded-lg p-4">
        {ordenesPendientes.length === 0 ? (
          <p className="text-center text-gray-500 py-4">
            No hay órdenes de compra pendientes de aprobación.
          </p>
        ) : (
          <table className="w-full text-left border-collapse">
            {/* Estructura de tu tabla de aprobaciones */}
          </table>
        )}
      </div>
    </div>
  );
}
