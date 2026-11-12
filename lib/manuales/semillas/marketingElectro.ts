import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Marketing y Electrodomésticos (name "marketing y
// electrodomesticos"). Nombres de pantallas y botones del panel a nov-2026.
// Tiene las vistas de Inteligencia de Negocio menos Leads, Clasificación, Por
// llegar y Rotación productos; además Ventas e Inventario por marca (todas las
// marcas), rotación y Tendencia de Compras. Solo lee, salvo sus Actividades,
// el orden del menú y sus chats. Lo marcado "(propuesta)" lo confirma la
// Dirección antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_MARKETING_ELECTRO: Semilla = {
  codigo: "MR-MKE-01",
  titulo: "Manual de Marketing y Electrodomésticos",
  area: "Marketing",
  version: "0.1",
  tipo: "manual",
  roles: ["marketing y electrodomesticos"],
  contenido: {
    objetivo:
      "Que la línea de electrodomésticos y las marcas que se promocionan tengan la venta, el inventario y la rotación a la vista, para decidir qué empujar en Marketing, qué está por quebrar y qué está estancado.\n\nEste manual es la rutina del rol. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al gerente de Marketing y Electrodomésticos. Ve las tres sedes y nunca las operaciones entre empresas del grupo.\n- Cubre: venta e inventario por marca, rotación (mayor y menor) y tendencia de ventas, reportes y dashboards de ventas, apoyo a Marketing (plan de contenido, flyers, Material POP) y consultas al Agente IA.\n- El rol es de consulta: no cambia cuotas, metas, planes ni material. Lo que guarda es lo suyo: sus actividades, el orden del menú y sus chats.\n\nREGLAS DEL ROL\n- M1. Una propuesta de campaña o de promoción sale de los datos del panel (venta por marca, rotación, tendencia), no de impresiones.\n- M2. Lo que está por quebrar no se promociona hasta que Compras confirme reposición.\n- M3. Lo que está estancado (90+ días sin vender) se propone a Marketing para moverlo (propuesta: cada mes).\n- M4. Toda cifra que se presenta lleva su criterio (sin IVA, sede, período).",
    responsables: [
      { rol: "Marketing y Electrodomésticos", responsabilidad: "Hace los pasos de este manual y propone acciones con sus números." },
      { rol: "AdminLeads / Diseño", responsabilidad: "Ejecutan las campañas, el plan de contenido y los flyers." },
      { rol: "Compras", responsabilidad: "Confirma reposición de lo que está por quebrar y decide qué comprar." },
      { rol: "Dirección (SuperAdmin)", responsabilidad: "Aprueba las campañas y fija las metas por marca." },
    ],
    definiciones: [
      { termino: "Sin intercompañía", definicion: "Sin operaciones entre empresas del grupo: tus cifras pueden no coincidir con las del SuperAdmin." },
      { termino: "Facturado / Cobrado", definicion: "Facturado = facturas menos notas de crédito, sin IVA. Cobrado = la parte ya pagada de cada factura." },
      { termino: "Disponible", definicion: "Existencia del almacén principal menos lo reservado para pedidos." },
      { termino: "Mayor rotación (alerta de quiebre)", definicion: "Producto vendido en 45 días que está en su punto de reorden o por debajo." },
      { termino: "Menor rotación (capital estancado)", definicion: "Stock que lleva 30 días o más sin venderse, valorado al costo." },
    ],
    pasos: [
      PASO(
        "Revisar la venta por marca",
        "Marketing y Electro · cada semana",
        "/marketing_electrodomesticos/ventas",
        "- En Ventas por marca elige Valencia y Caracas (o una) y el período (mes, últimos 6 meses o año).\n- Revisa facturado, cobrado y unidades por marca; haz clic en una marca para ver sus números de parte.\n- Compara con Metas por Marca (en Ventas) para ver qué marca está por debajo de su meta.\n\nCriterio de salida: sabes qué marcas crecen y cuáles caen frente a su meta.",
        "Esta pantalla va desde abril de 2026; lo anterior está en Smartbit.",
      ),
      PASO(
        "Revisar el inventario y lo que se va a quebrar",
        "Marketing y Electro · cada semana",
        "/marketing_electrodomesticos/inventario",
        "- En Inventario por marca revisa existencia, disponible, por llegar y valor al costo de cada marca.\n- En Compras › Mayor Rotación revisa lo que está en quiebre o en riesgo: no lo promociones hasta que Compras confirme reposición (regla M2).\n\nCriterio de salida: la lista de productos a promocionar no tiene nada por quebrar.",
      ),
      PASO(
        "Proponer qué mover",
        "Marketing y Electro · cada mes (propuesta)",
        "/compras/menor_rotacion",
        "- En Compras › Menor Rotación filtra 90+ días y \"Nunca se ha vendido\": el capital estancado.\n- Elige lo que vale la pena mover (por marca o categoría) y propónselo a Marketing con su valor al costo (regla M3).\n- En Tendencia de Ventas revisa la estacionalidad y los productos que más se venden para planificar las campañas.\n\nCriterio de salida: propuesta de productos a mover entregada a Marketing.",
      ),
      PASO(
        "Apoyar a Marketing",
        "Marketing y Electro",
        "/marketing_electrodomesticos/vista-custom",
        "- Revisa el Plan de Contenido y la Frecuencia CPM de cada marca, y el Banco de Flyers: que lo que se promociona tenga stock y flyer.\n- En Material POP revisa el catálogo, las solicitudes y las alertas de agotados.\n- En Opiniones lee lo que dicen los clientes de ventas y RMA.\n- Lo que haya que cambiar, pídeselo a AdminLeads o Diseño: estas pantallas son de consulta para ti.",
      ),
      PASO(
        "Revisar ventas y cobranza de la empresa",
        "Marketing y Electro · cada semana",
        "/marketing_electrodomesticos",
        "- Dashboard, Reporte Diario y Reporte de Ventas: la venta de las tres sedes.\n- Reportes (Facturación, Productos, Clientes) para el análisis del mes.\n- Días promedio y las pantallas de Cuentas por Cobrar si el análisis lo necesita.",
      ),
      PASO(
        "Organizar tu trabajo",
        "Marketing y Electro",
        "/gestion/actividades",
        "- En Actividades crea tus tareas (\"+ Nueva Actividad\", con fecha límite) y muévelas a En curso y Culminadas.\n- En el Agente IA haz preguntas en lenguaje natural (por ejemplo, qué marca cayó este mes); verifica la cifra en su pantalla antes de presentarla (regla M4).",
      ),
    ],
    documentos:
      "REGISTROS\n- Tus actividades y conversaciones con el Agente IA: panel.\n- Todo lo demás se lee de Odoo y del panel en vivo; los análisis se entregan en Excel.\n\nINDICADORES\n- Venta y cumplimiento de meta por marca.\n- Productos promocionados que quebraron. Meta: 0.\n- Capital estancado de electrodomésticos (90+ días). Meta: bajar cada mes (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_MARKETING_ELECTRO: Semilla = {
  codigo: "TU-MKE-01",
  titulo: "Tutorial del panel: Marketing y Electrodomésticos",
  area: "Marketing",
  version: "0.1",
  tipo: "tutorial",
  roles: ["marketing y electrodomesticos"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard.\n- Ves las tres sedes (eliges arriba) y nunca las operaciones entre empresas del grupo.\n- Eres de consulta: algunas pantallas muestran botones de guardar (metas, flyers, plan, Material POP…) que te van a responder «solo lectura». Lo que sí guardas son tus actividades, el orden del menú y tus chats del Agente IA.\n- Tu menú tiene desplegables: Compras, Ventas, Cuentas por Cobrar, Reportes y Marketing.",
    responsables: [],
    definiciones: [
      { termino: "Facturado", definicion: "Facturas menos notas de crédito, sin IVA." },
      { termino: "Disponible", definicion: "Existencia menos lo reservado." },
      { termino: "Quiebre", definicion: "Se vendió en 45 días y no hay disponible ni en camino." },
      { termino: "Estancado", definicion: "30 días o más sin venderse." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/marketing_electrodomesticos",
        "Las ventas del mes de la sede que elijas (o de todas): ventas, producto estrella, crecimiento, top vendedores, marcas y productos, y top 5 clientes.",
      ),
      PASO(
        "Ventas por marca",
        "Menú › Ventas por marca",
        "/marketing_electrodomesticos/ventas",
        "Lo facturado y cobrado de todas las marcas.\n- Elige sede (Valencia y Caracas, o una) y período (mes, últimos 6 meses o año).\n- Tarjetas: facturado, cobrado, por cobrar y unidades.\n- \"Por marca\" (haz clic para filtrar) y \"Por número de parte\". Excel con las dos hojas.",
      ),
      PASO(
        "Inventario por marca",
        "Menú › Inventario por marca",
        "/marketing_electrodomesticos/inventario",
        "Existencia, disponible, por llegar y valor al costo de cada marca y producto, en el almacén principal de cada sede. Filtra por categoría y \"Solo con existencia o por llegar\". Excel.",
      ),
      PASO(
        "Compras › Mayor Rotación",
        "Menú › Compras › Mayor Rotación",
        "/compras/mayor_rotacion",
        "Lo que se está vendiendo y va a quedarse sin stock: en quiebre o en riesgo, con la cantidad a comprar y la fecha estimada. Elige sede; filtra por marca o categoría; exporta.",
      ),
      PASO(
        "Compras › Menor Rotación",
        "Menú › Compras › Menor Rotación",
        "/compras/menor_rotacion",
        "El capital estancado: productos con stock y 30 días o más sin venderse, con su valor al costo. Filtra por días sin vender, marca y categoría; exporta.",
      ),
      PASO(
        "Compras › Tendencia de Ventas",
        "Menú › Compras › Tendencia de Ventas",
        "/compras/tendencia",
        "Las unidades vendidas en el tiempo: histórico de 24 meses, unidades por semana del mes elegido y los productos más vendidos. Elige sede; haz clic en una barra para ver los productos.",
      ),
      PASO(
        "Inventario",
        "Menú › Inventario",
        "/marketing_electrodomesticos/inventory",
        "El stock por producto y almacén de las tres sedes, con costo, precio base y unidades vendidas (elige 30 días, 90 días o 12 meses).",
      ),
      PASO(
        "Ventas",
        "Menú › Ventas (desplegable)",
        "/marketing_electrodomesticos/reporte-diario",
        "En consulta: Reporte Diario, Reporte de Ventas, Cuota, Metas por Marca, Stock por Marca, Reportes Comerciales, Semáforo de clientes, Mapa de Clientes y Spiff. En casi todas eliges la sede y bajas Excel.",
      ),
      PASO(
        "Marketing",
        "Menú › Marketing (desplegable)",
        "/marketing_electrodomesticos/vista-custom",
        "En consulta: Plan de Contenido, Frecuencia CPM, Banco de Flyers, KPI de Diseños, Material POP (catálogo, solicitudes, historial, clientes por marca y alertas), Sorteo de clientes y Opiniones.",
      ),
      PASO(
        "Reportes y Días promedio",
        "Menú › Reportes",
        "/marketing_electrodomesticos/reportes/productos",
        "- Reportes: Facturación, Productos (venta, costo, margen, inventario) y Clientes del mes, de Venezuela o una sede, con Excel.\n- Días promedio: cobro, inventario, pago y ciclo de caja del mes.",
      ),
      PASO(
        "Cuentas por Cobrar",
        "Menú › Cuentas por Cobrar (desplegable)",
        "/cuentas-por-cobrar/contado-credito",
        "En consulta y eligiendo sede: Contado/Crédito, Tiempo de Cobro, Incobrables y Sobregiro, con Excel.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Tus tareas: \"+ Nueva Actividad\" (título, fecha límite, descripción) y el tablero de pendientes, en curso y culminadas. Ves y mueves solo las tuyas.",
      ),
      PASO(
        "Agente IA",
        "Menú › Agente IA",
        "/agente-ia",
        "Pregunta en lenguaje natural; tu acceso es de consulta. Adjunta archivos, dicta o usa el modo voz. Trae su propio recorrido.",
        "Hoy el agente te deja ver solo tu sede y el área de inventario: si necesitas más, pídele al SuperAdmin que ajuste tu rol en la configuración del agente.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/marketing_electrodomesticos/StoplightReport",
        "Todavía no está disponible: la pantalla dice «Próximamente».",
      ),
    ],
    documentos:
      "- Te sale «solo lectura» al guardar algo: tu rol es de consulta, salvo tus actividades, el orden del menú y tus chats.\n- Tus cifras no coinciden con las del SuperAdmin: tú no ves intercompañía.\n- Ventas por marca no muestra antes de abril de 2026: lo anterior está en Smartbit.\n- El Agente IA no responde sobre otras sedes o áreas: pídele al SuperAdmin que amplíe tu alcance.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas de Marketing y Electrodomésticos." }],
  },
};
