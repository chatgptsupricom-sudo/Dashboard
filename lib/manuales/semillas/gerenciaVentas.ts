import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Gerencia de Ventas (name "Gerencia De Ventas" en la
// tabla roles; se compara en minúsculas). Nombres de pantallas y botones del
// panel a nov-2026. Lo marcado "(propuesta)" lo confirma la Dirección antes de
// publicar. El proceso de venta en Odoo está en MP-VEN-00 / MP-VEN-01.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_GERENCIA_VENTAS: Semilla = {
  codigo: "MR-GVE-01",
  titulo: "Manual de Gerencia de Ventas",
  area: "Ventas",
  version: "0.1",
  tipo: "manual",
  roles: ["gerencia de ventas"],
  contenido: {
    objetivo:
      "Que el equipo de ventas de la sede llegue a su cuota con una cartera sana: cada vendedor con su meta, sus visitas planificadas y cumplidas, sus clientes en riesgo atendidos y su cobranza al día, y que la Dirección vea en el Stoplight la situación real de la sede.\n\nEste manual es la rutina del gerente. El proceso de venta en Odoo (cotización, descuentos, confirmación) está en MP-VEN-00 y MP-VEN-01, donde el Gerente de Ventas es el dueño del proceso. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica a la Gerencia de Ventas de Valencia, Caracas y Panamá; cada gerente ve su sede.\n- Cubre: cuotas, seguimiento diario de la venta, planificación y control de visitas, cartera en riesgo, cobranza por vendedor, incentivos (spiff), actividades del equipo, reportes e indicadores.\n- No cubre: la facturación, la cobranza día a día (Cuentas por Cobrar), los cupos de crédito (MP-VEN-02) ni las metas de la sede en el Stoplight (las fija la Dirección).\n\nREGLAS DEL ROL\n- G1. Cada vendedor activo tiene su cuota cargada antes del día 3 del mes (propuesta). La cuota de un vendedor se cambia una sola vez al mes.\n- G2. Las visitas de cada semana se revisan y se marcan (realizada o no realizada) a más tardar el lunes siguiente (propuesta).\n- G3. Todo cliente en rojo en el Semáforo tiene una acción asignada a su vendedor.\n- G4. Las reglas de spiff tienen vigencia y no se solapan: una venta no paga dos veces.\n- G5. Las aprobaciones de descuentos y precios fuera de tabla se anotan en el chatter del pedido en Odoo (MP-VEN-01).",
    responsables: [
      { rol: "Gerencia de Ventas", responsabilidad: "Hace los pasos de este manual en su sede y responde por la cuota y la cartera del equipo." },
      { rol: "Vendedor", responsabilidad: "Vende, planifica sus visitas, atiende sus leads y su cartera (manual MR-VEN-01)." },
      { rol: "Asistente de Ventas", responsabilidad: "Ve cuotas y reportes, y registra el método de retiro de los pedidos." },
      { rol: "Cuentas por Cobrar", responsabilidad: "Cobra, asigna plazos y límites y avisa los clientes excedidos." },
      { rol: "Dirección (SuperAdmin)", responsabilidad: "Fija las metas y pesos del Stoplight y los umbrales del Semáforo, y aprueba las solicitudes de personal." },
    ],
    definiciones: [
      { termino: "Cuota", definicion: "Meta de facturación del mes de cada vendedor, sin IVA. La meta de la sede en el Stoplight la fija la Dirección; si no hay, es la suma de las cuotas." },
      { termino: "Cuota al día", definicion: "La parte de la cuota que corresponde a los días hábiles ya transcurridos del mes." },
      { termino: "Cobertura territorial", definicion: "Visitas foráneas realizadas ÷ foráneas planificadas hasta hoy. Mínimo 70 %." },
      { termino: "Semáforo de clientes", definicion: "Cada cliente en verde, amarillo o rojo según cómo viene comprando contra su propio historial." },
      { termino: "Spiff", definicion: "Incentivo por vender una marca o producto con meta. Se configura por regla, con vigencia." },
      { termino: "Cuenta EPP", definicion: "Cliente clave con meta anual de compra, en Reportes Comerciales." },
      { termino: "Con o sin IVA", definicion: "Facturado, cuota y reportes de venta van sin IVA; cobrado, cartera y pedidos van con IVA. Por eso no cuadran 1:1." },
    ],
    pasos: [
      PASO(
        "Cargar las cuotas del mes",
        "Gerencia de Ventas · al empezar el mes",
        "/gerente_venta/cuota",
        "- En Cuota, con \"Mes actual\", revisa la cuota de cada vendedor.\n- Para cambiarla, el lápiz de su tarjeta y \"Guardar Registro\". Solo se puede cambiar una vez por vendedor en el mes: revisa el número antes de guardar.\n- Queda registrado quién la cambió y el valor anterior.\n\nCriterio de salida: todos los vendedores activos con cuota antes del día 3 (regla G1).",
        "Un vendedor que dejó la empresa no aparece: avisa a Monitoreo Leads para apagarlo y reasigna sus clientes en Odoo.",
      ),
      PASO(
        "Seguir la venta todos los días",
        "Gerencia de Ventas · todos los días",
        "/gerente_venta/reporte-diario",
        "- Abre el Reporte Diario: cuánto lleva cada vendedor contra su cuota al día, los pedidos sin facturar y el ranking.\n- Habla con los que están por debajo de su cuota al día. \"Imagen\" baja el reporte para compartirlo con el equipo.\n- En el Dashboard revisa las ventas del mes, el crecimiento y los productos y marcas que más y menos se venden.\n\nCriterio de salida: cada vendedor sabe cuánto le falta y qué va a hacer hoy.",
        "\"Venta + Pedidos\" suma la venta sin IVA con pedidos con IVA: úsalo como referencia, no como cifra exacta.",
      ),
      PASO(
        "Revisar y controlar las visitas",
        "Gerencia de Ventas · cada semana",
        "/gerente_venta/planificacion",
        "- En Planificación de visitas elige al asesor y la semana: revisa que tenga 7 visitas o más, con cliente, zona, tema y objetivo.\n- Corrige o completa su plan si hace falta y pulsa \"Guardar\".\n- Al terminar la semana, marca cada visita \"Realizada\" o \"No realizada\" (con el motivo). Solo las realizadas cuentan en el Stoplight.\n- En \"Resumen del mes\" revisa la cobertura territorial de cada asesor y del equipo.\n\nCriterio de salida: visitas de la semana marcadas a más tardar el lunes siguiente (regla G2).",
        "Guarda el plan antes de marcar visitas. Una visita marcada como realizada ya no se edita.",
      ),
      PASO(
        "Atender la cartera en riesgo",
        "Gerencia de Ventas · cada semana",
        "/semaforo-clientes",
        "- En el Semáforo de clientes, pestaña \"Por vendedor\": qué vendedores tienen más clientes en rojo y más facturación en riesgo.\n- Haz clic en un vendedor para ver sus clientes; revisa los rojos y los que empeoraron contra la semana pasada.\n- Pide a cada vendedor una acción por cliente en rojo (llamada, visita, oferta) y que la anote en Odoo (regla G3).\n- Si un cliente necesita otro vendedor, reasígnalo en Odoo.\n- En Reporte de Ventas, pestaña \"Clientes inactivos\", revisa los que no compran hace 3 o 6 meses.\n\nCriterio de salida: ningún cliente en rojo sin acción de su vendedor en la semana.",
      ),
      PASO(
        "Vigilar la cobranza del equipo",
        "Gerencia de Ventas · cada semana",
        "/gerente_venta/cobranza",
        "- En Cuentas por Cobrar (Cobranza de vendedores) revisa por vendedor lo facturado, lo cobrado, lo por cobrar y lo vencido.\n- Abre un vendedor para ver sus clientes con deuda vencida y baja su estado de cuenta en Excel para revisarlo con él.\n- Con Cuentas por Cobrar, decide qué clientes con deuda vencida solo compran de contado (MP-VEN-02).\n\nCriterio de salida: cada vendedor conoce sus clientes vencidos y tiene fecha de cobro.",
      ),
      PASO(
        "Configurar los incentivos (spiff)",
        "Gerencia de Ventas · al empezar el período",
        "/gerente_venta/spiff",
        "- En Spiff, pestaña \"Reglas\", \"Nueva Regla\": por marca o producto, por monto o cantidad, la meta, el spiff por meta y las fechas de vigencia.\n- Si el panel avisa que se solapa con otra regla activa, corrígela: el spiff se pagaría dos veces (regla G4).\n- En \"Resumen del mes\" revisa quién ganó, cuánto se paga y quién está cerca de la meta; baja el Excel para el pago.",
      ),
      PASO(
        "Asignar tareas al equipo",
        "Gerencia de Ventas",
        "/gestion/actividades",
        "- En Actividades, \"Asignar\": elige a la persona de tu sede, el título, la fecha límite y la descripción.\n- En \"Asignadas por Mí\" sigues cómo van (pendiente, en curso, culminada).\n- Con el selector de usuario ves las actividades de cada persona del equipo.",
      ),
      PASO(
        "Revisar los indicadores y reportar",
        "Gerencia de Ventas · cada semana y al cierre",
        "/gerente_venta/StoplightReport",
        "- En el Stoplight Report revisa los indicadores de Ventas de la sede: cuota, margen, visitas, efectividad de cotizaciones, activación de cartera, clientes nuevos y cobertura de marcas.\n- Lleva a la reunión con la Dirección lo que está en rojo y el plan para corregirlo.\n- Reportes Comerciales: venta del trimestre por marca, vendedor y cliente, y las Cuentas EPP con su meta anual (las mantienes tú: \"Agregar cuenta\").\n- Reporte de Ventas: desglose por vendedor, cliente, marca y producto, con Excel.\n- Opiniones: lo que responden los clientes sobre su ejecutivo de ventas y RMA; comparte con cada vendedor lo suyo.",
      ),
    ],
    documentos:
      "REGISTROS\n- Cuotas y su historial (quién y cuándo): panel, Cuota.\n- Planes de visitas y su resultado: panel, Planificación de visitas.\n- Reglas de spiff: panel, Spiff.\n- Actividades asignadas: panel, Actividades.\n- Cuentas EPP y su meta: panel, Reportes Comerciales.\n- Aprobaciones de descuentos y precios, reasignación de clientes: Odoo.\n\nINDICADORES (Stoplight de Ventas; metas de la Dirección)\n- Cumplimiento de cuota de la sede.\n- Visitas y cobertura territorial (mínimo 70 %).\n- Efectividad de cierre de cotizaciones, activación de cartera, clientes nuevos y cobertura de marcas.\n- Clientes en rojo sin acción en la semana. Meta: 0 (propuesta).\n- Visitas de la semana sin marcar el lunes. Meta: 0 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta (cuotas antes del día 3, visitas marcadas el lunes, acción sobre clientes en rojo).",
      },
    ],
  },
};

export const TUTORIAL_GERENCIA_VENTAS: Semilla = {
  codigo: "TU-GVE-01",
  titulo: "Tutorial del panel: Gerencia de Ventas",
  area: "Ventas",
  version: "0.1",
  tipo: "tutorial",
  roles: ["gerencia de ventas"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de la Gerencia de Ventas) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de ventas de tu sede.\n- Todo es de tu sede; no hay selector de sede.\n- Las ventas salen de Odoo desde abril de 2026 y de Smartbit antes.\n- Cada pantalla cuenta distinto: facturado y cuota van sin IVA; cobrado, cartera y pedidos con IVA; algunas restan las notas de crédito y otras no. Si dos números no cuadran, revisa el «Ojo» de cada paso.\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "Cuota al día", definicion: "La parte de la cuota que corresponde a los días hábiles ya pasados." },
      { termino: "Foránea", definicion: "Visita fuera de la zona habitual: cuenta para la cobertura territorial." },
      { termino: "Semáforo", definicion: "Verde, amarillo o rojo según cómo compra cada cliente contra su historial." },
      { termino: "Spiff", definicion: "Incentivo por vender una marca o producto con meta." },
      { termino: "EPP", definicion: "Cuenta clave con meta anual de compra." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/gerente_venta",
        "Las ventas de tu sede.\n- Elige el mes o un rango de fechas.\n- Tarjetas: ventas del mes, producto estrella, clientes activos y crecimiento.\n- Historial de facturación, top vendedores del mes, marcas y productos más y menos vendidos, y top 5 clientes.\n- Se actualiza solo cuando entran ventas nuevas.",
      ),
      PASO(
        "Reporte Diario",
        "Menú › Reporte Diario",
        "/gerente_venta/reporte-diario",
        "La venta de cada vendedor contra su cuota al día.\n- Elige la fecha.\n- Tarjetas del mes (días hábiles y transcurridos) y totales (meta, cuota al día, venta %, pedidos %).\n- Ranking de vendedores con cuota, cuota al día, venta, % y posición, y su gráfica.\n- \"Imagen\" y \"Excel\" para compartirlo.",
        "Los pedidos sin facturar van con IVA y la venta sin IVA.",
      ),
      PASO(
        "Cuota",
        "Menú › Cuota",
        "/gerente_venta/cuota",
        "La meta de cada vendedor y cómo va.\n- Elige el rango (\"Mes actual\").\n- Barra total del equipo y una tarjeta por vendedor: progreso, meta, facturado, cuánto falta, ritmo necesario por día y cuánto para el 150 %.\n- El lápiz de cada tarjeta cambia su cuota (una vez por vendedor en el mes).",
      ),
      PASO(
        "Planificación de visitas",
        "Menú › Planificación de visitas",
        "/gerente_venta/planificacion",
        "El plan de visitas de cada asesor.\n- Elige el asesor y la semana.\n- Indicadores: visitas de la semana (meta 7), foráneas del mes y cobertura territorial.\n- Zona, marcas priorizadas y el cronograma de lunes a viernes (mañana y tarde); en cada puesto, cliente, zona, tema, objetivo y si es foránea.\n- \"Guardar\" y, después, marca cada visita \"Realizada\" o \"No realizada\".\n- \"Resumen del mes\": la cobertura de cada asesor y del equipo. \"Excel\" baja el plan.",
      ),
      PASO(
        "Semáforo de clientes",
        "Menú › Semáforo de clientes",
        "/semaforo-clientes",
        "La cartera de tu sede según cómo viene comprando cada cliente.\n- Elige 30, 60 o 90 días.\n- Tarjetas: verdes, amarillos, rojos, dejaron de comprar y facturación en riesgo; haz clic para filtrar.\n- Pestaña \"Clientes\": filtra por vendedor o color, \"Solo los que cambiaron de color\"; haz clic en un cliente para ver por qué está así y sus compras de cada mes.\n- Pestaña \"Por vendedor\": cuántos clientes en riesgo tiene cada uno; haz clic para ver los suyos.\n- \"Cómo se calcula\" explica las reglas. Excel.",
        "La comparación con la semana pasada sale solo con la ventana de 90 días.",
      ),
      PASO(
        "Cuentas por Cobrar (Cobranza de vendedores)",
        "Menú › Cuentas por Cobrar",
        "/gerente_venta/cobranza",
        "La cobranza de cada vendedor.\n- Elige el mes.\n- Tarjetas: facturado del mes (sin IVA), cobrado del mes, por cobrar y vencido hoy.\n- Tabla por vendedor con facturado vs cobrado; haz clic para ver sus clientes y \"Exportar estado de cuenta\".\n- \"Incluir asistentes de ventas y cuentas internas\" viene apagado.\n- Excel general.",
        "Lo cobrado va con IVA y lo facturado sin IVA: no se comparan 1:1.",
      ),
      PASO(
        "Estado de Cuentas",
        "Menú › Estado de Cuentas",
        "/gerente_venta/estado-cuenta",
        "Lo que debe cada cliente, por vendedor.\n- Elige el vendedor, luego el cliente.\n- Antigüedad de la deuda y sus facturas; haz clic en una para ver productos y pagos.\n- Para bajarlo en Excel, usa Cuentas por Cobrar (Cobranza de vendedores).",
      ),
      PASO(
        "Spiff",
        "Menú › Spiff",
        "/gerente_venta/spiff",
        "Los incentivos de tu sede.\n- \"Resumen del mes\": spiff a pagar, quién ganó, quién está cerca de la meta, por vendedor y por regla. Excel.\n- \"Reglas\": \"Nueva Regla\" (marca o producto, monto o cantidad, meta, spiff, vigencia); editar, activar, desactivar o eliminar. El panel avisa si dos reglas se solapan.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Las tareas del equipo.\n- \"Asignar\": a una persona de tu sede, con título, fecha límite y descripción.\n- \"Mis Actividades\" (con el selector, las de cualquier persona del equipo) y \"Asignadas por Mí\".\n- Tablero de pendientes, en curso y culminadas.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/gerente_venta/StoplightReport",
        "Los indicadores de Ventas de tu sede en semáforo.\n- Elige el mes o un rango; pestañas Resumen, Semanal, Mensual, Trimestral y Anual.\n- Haz clic en un indicador para ver su detalle.\n- Las metas y pesos los fija la Dirección.",
      ),
      PASO(
        "Reporte de Ventas",
        "Menú › Reporte de Ventas",
        "/gerente_venta/reporte-ventas",
        "El detalle de lo vendido.\n- \"Desglose\": filtra por vendedor, cliente, marca y fechas; tabla por vendedor, cliente, marca y producto, y el comparativo mensual.\n- \"Clientes inactivos\": los que no compran hace 3 o 6 meses, por vendedor.\n- Excel en las dos.",
        "Aquí no restan las notas de crédito.",
      ),
      PASO(
        "Reportes Comerciales",
        "Menú › Reportes Comerciales",
        "/reportes-comerciales",
        "El reporte trimestral de la sede.\n- Elige la marca y el trimestre.\n- \"Resumen\": venta, unidades, facturas, clientes y rankings por cliente, producto, departamento, vendedor y marca.\n- \"Cuentas EPP\": las cuentas clave con su meta anual y cuánto llevan; \"Agregar cuenta\", editar o eliminar.\n- Excel.",
        "La consulta es pesada: puede tardar hasta casi dos minutos.",
      ),
      PASO(
        "Mapa de Clientes",
        "Menú › Mapa de Clientes",
        "/gerente_venta/mapa_clientes",
        "Dónde están los clientes.\n- Período o \"Historial Total\", y vendedor.\n- Mapa por estado, ranking de penetración (haz clic en un estado para filtrar) y directorio de clientes con su facturación.",
      ),
      PASO(
        "Inventario",
        "Menú › Inventario",
        "/gerente_venta/inventory",
        "El stock de tu sede por producto y almacén.\n- Busca y filtra por almacén, marca y categoría; \"Bajo Stock\" muestra los de 20 unidades o menos.",
      ),
      PASO(
        "Opiniones",
        "Menú › Opiniones",
        "/gerente_venta/opiniones",
        "Lo que responden los clientes en la encuesta sobre su ejecutivo de ventas y el servicio de RMA.\n- Filtra por ejecutivo y fechas, \"Consultar\".\n- Valoraciones, resumen por pregunta y cada respuesta con sus comentarios. Excel.",
      ),
      PASO(
        "Solicitudes de personal",
        "Menú › Solicitudes de personal",
        "/solicitudes-personal",
        "Para pedir personal para tu equipo: \"Nueva solicitud\" con cargo, motivo, urgencia, perfil y funciones. La aprueba la Dirección y RRHH hace la búsqueda; ves el avance y anotas tu entrevista técnica. La pantalla trae su propio recorrido.",
      ),
      PASO(
        "Políticas y Acuerdos",
        "Menú › Políticas y Acuerdos",
        "/politicas",
        "Las políticas vigentes de tu sede. Abre las \"Pendientes de leer\" y pulsa \"Leído y entendido\".",
      ),
    ],
    documentos:
      "- No puedes cambiar una cuota: ya se cambió este mes. Si es urgente, pídeselo a la Dirección.\n- No puedes marcar una visita: guarda el plan primero.\n- Un vendedor no aparece en las listas: está retirado o inactivo.\n- Dos pantallas dan montos distintos: unas van con IVA y otras sin IVA, y no todas restan las notas de crédito.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Gerencia de Ventas." }],
  },
};
