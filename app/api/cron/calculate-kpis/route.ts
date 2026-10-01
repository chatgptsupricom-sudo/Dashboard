import { callOdooRPC } from "@/lib/odoo"; // Asegúrate de que esta sea tu importación real
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // 1. Verificación de Seguridad
  //
  // El chequeo de CRON_SECRET va primero y aparte a propósito. Sin la variable
  // configurada, la comparación de abajo queda contra la cadena literal
  // "Bearer undefined", que es un header que cualquiera puede mandar: el
  // endpoint quedaba abierto a internet y con él el recálculo de KPIs contra
  // Odoo. Pasó de verdad en el entorno de prueba, que respondía 200 a
  // `Authorization: Bearer undefined`. Mejor no arrancar que arrancar abierto.
  if (!process.env.CRON_SECRET) {
    console.error("[cron-kpis] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  try {
    console.log(
      `[${new Date().toISOString()}] Iniciando cálculo de KPIs en Odoo...`,
    );

    // 2. Obtener los KPIs automatizados de tu Base de Datos (Ejemplo)
    // const kpisToCalculate = await prisma.kpi.findMany({ where: { isAutomated: true } });

    // Simulación de lo que trae tu BD:
    const kpisToCalculate = [
      { id: "1", sourceKey: "efectividad_facturacion" },
      { id: "2", sourceKey: "inventario_activo" },
    ];

    // 3. Iterar y calcular cada KPI
    for (const kpi of kpisToCalculate) {
      let calculatedValue = 0;

      switch (kpi.sourceKey) {
        // ==========================================
        // LÓGICA: EFECTIVIDAD DE FACTURACIÓN
        // ==========================================
        case "efectividad_facturacion":
          try {
            // Ejemplo de consulta XML-RPC a Odoo
            await callOdooRPC("connect");

            // Buscar pedidos confirmados esta semana
            const pedidos = await callOdooRPC("searchCount", "sale.order", [
              ["state", "=", "sale"],
              // ['date_order', '>=', fechaInicioSemana]
            ]);

            // Buscar facturas publicadas esta semana
            const facturas = await callOdooRPC("searchCount", "account.move", [
              ["move_type", "=", "out_invoice"],
              ["state", "=", "posted"],
              // ['invoice_date', '>=', fechaInicioSemana]
            ]);

            calculatedValue = pedidos > 0 ? (facturas / pedidos) * 100 : 0;
          } catch (e) {
            console.error("Error calculando efectividad_facturacion:", e);
          }
          break;

        // ==========================================
        // LÓGICA: SKU ACTIVOS (INVENTARIO)
        // ==========================================
        case "inventario_activo":
          try {
            await callOdooRPC("connect");
            const productosActivos = await callOdooRPC(
              "searchCount",
              "product.template",
              [
                ["active", "=", true],
                ["qty_available", ">", 0],
              ],
            );
            calculatedValue = productosActivos;
          } catch (e) {
            console.error("Error calculando inventario_activo:", e);
          }
          break;

        // ==========================================
        // OTROS KPIs...
        // ==========================================
        default:
          console.log(`No hay lógica definida para el KPI: ${kpi.sourceKey}`);
          continue; // Salta al siguiente KPI si no hay coincidencia
      }

      // 4. Guardar el valor en tu Base de Datos
      // await prisma.kPIValue.create({
      //   data: {
      //     kpiId: kpi.id,
      //     period: "2026-W28", // Generar el string de la semana actual
      //     value: calculatedValue
      //   }
      // });

      console.log(
        `✅ KPI [${kpi.sourceKey}] guardado con valor: ${calculatedValue}`,
      );
    }

    return NextResponse.json({ success: true, message: "Proceso completado" });
  } catch (error) {
    console.error("Error crítico en el cron:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
