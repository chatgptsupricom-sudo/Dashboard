import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Inteligencia de Negocio (name "inteligencia de
// negocio"). Nombres de pantallas y botones del panel a nov-2026. BI ve las
// tres sedes, nunca ve intercompañía (salvo Spiff y cierres ya guardados) y
// solo lee, salvo su Clasificación, el orden del menú y sus chats del Agente
// IA. Lo marcado "(propuesta)" lo confirma la Dirección antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_BI: Semilla = {
  codigo: "MR-BIN-01",
  titulo: "Manual de Inteligencia de Negocio",
  area: "Inteligencia de Negocio",
  version: "0.1",
  tipo: "manual",
  roles: ["inteligencia de negocio"],
  contenido: {
    objetivo:
      "Que la Dirección tenga cada mes los números del negocio sin las operaciones entre empresas del grupo —ventas, márgenes, días de cobro, inventario y pago, lo que viene en camino— y que productos y clientes estén clasificados para poder analizarlos.\n\nEste manual es la rutina del analista. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al equipo de Inteligencia de Negocio. Ve las tres sedes y elige la sede en casi todas las pantallas.\n- Cubre: análisis de ventas, productos, clientes, inventario y cobranza, días promedio y ciclo de caja, mercancía por llegar, reportes mensuales, clasificación de productos y clientes, y consultas al Agente IA.\n- El rol es de consulta: no cambia cuotas, metas, leads, incobrables ni nada operativo. Lo único que guarda es la clasificación de productos y clientes (en el panel, no en Odoo).\n\nREGLAS DEL ROL\n- B1. Los números que se reportan salen del panel, sin intercompañía: así son comparables entre meses y sedes.\n- B2. Cada cifra que se entrega lleva su criterio (con o sin IVA, notas de crédito, sede, período).\n- B3. Lo que la IA clasifica con confianza baja se revisa a mano antes de usarlo en un análisis.\n- B4. Una corrección manual de la clasificación se hace solo con el dato confirmado (ficha del producto, Instagram o información del vendedor).\n- B5. Si un número no cuadra con otra pantalla, se explica la diferencia (criterio, fuente, fecha de corte) antes de entregarlo.",
    responsables: [
      { rol: "Inteligencia de Negocio", responsabilidad: "Hace los pasos de este manual y responde por los números y la clasificación que entrega." },
      { rol: "Dirección (SuperAdmin)", responsabilidad: "Pide los análisis, fija las metas y decide qué se hace con lo que muestran." },
      { rol: "Compras", responsabilidad: "Ve y corrige la misma clasificación de clientes." },
      { rol: "Gerencias", responsabilidad: "Reciben los análisis de su área y confirman los datos que faltan." },
    ],
    definiciones: [
      { termino: "Sin intercompañía", definicion: "Sin las ventas, compras ni saldos entre empresas del grupo (Supricom, Office Solutions Center, Ofimaster). Por eso tus cifras pueden no coincidir con las del SuperAdmin." },
      { termino: "Venta", definicion: "Salvo que la pantalla diga otra cosa: facturas menos notas de crédito, en USD sin IVA, sin servicios. Antes de abril de 2026 sale de Smartbit." },
      { termino: "Días promedio de cobro, inventario y pago", definicion: "Saldo al cierre ÷ movimiento del mes × días del mes. Ciclo de caja = cobro + inventario − pago." },
      { termino: "Nombre corto", definicion: "El nombre normalizado de un producto con la estructura de su categoría; lo pone la IA y lo corrige BI." },
      { termino: "Confianza", definicion: "Qué tan segura está la clasificación: Alta (95 % o más), Media (70 % o más) o Baja. Una corrección manual queda siempre Alta." },
      { termino: "Actividad comercial", definicion: "El tipo de negocio de un cliente (una de 15), que la IA deduce de su nombre, dirección, compras e Instagram." },
    ],
    pasos: [
      PASO(
        "Revisar el mes",
        "BI · cada semana y al cierre",
        "/inteligencia_negocio",
        "- En el Dashboard elige el mes y la sede (o todas): ventas, producto estrella, crecimiento, top vendedores, marcas y productos.\n- En Ventas › Reporte Diario y Reporte de Ventas revisa la venta contra la cuota y el desglose por vendedor, cliente y marca.\n- En Ventas › Metas por Marca y Stock por Marca revisa cumplimiento y cobertura por marca.\n\nCriterio de salida: sabes qué sede, marca y vendedor explican el resultado del mes.",
      ),
      PASO(
        "Sacar los reportes del mes",
        "BI · al cierre del mes",
        "/inteligencia_negocio/reportes/productos",
        "- Reportes › Facturación: cada producto facturado del mes.\n- Reportes › Productos: venta, costo, margen e inventario al cierre de todo el catálogo.\n- Reportes › Clientes: venta, días sin comprar, cupo, días de crédito, zona y vendedor; elige uno o varios meses o \"Acumulado\".\n- Elige Venezuela (las dos sedes juntas) o una sede; filtra y baja el Excel (sale lo filtrado).\n\nCriterio de salida: los reportes del mes entregados con su criterio (regla B2).",
        "Estos reportes van desde abril de 2026 (corte a Odoo) y no incluyen Panamá.",
      ),
      PASO(
        "Medir los días de cobro, inventario y pago",
        "BI · al cierre del mes",
        "/inteligencia_negocio/dias-promedio",
        "- En Días promedio elige la sede (o todas) y el mes.\n- Revisa los días de cobro, de inventario y de pago, y el ciclo de caja.\n- Si una tarjeta sale \"—\", lee el motivo (sin ventas a crédito, sin compras…) antes de reportar.\n\nCriterio de salida: el ciclo de caja del mes por sede reportado.",
        "Sin intercompañía, Caracas casi no le compra a terceros: su días de pago y su ciclo pueden salir sin dato.",
      ),
      PASO(
        "Seguir lo que viene en camino",
        "BI · cada semana",
        "/inteligencia_negocio/por-llegar",
        "- En Por llegar elige la sede: el calendario muestra qué llega cada día y cuánto.\n- Revisa los \"Nunca vendidos en la sede\": productos nuevos que hay que presentar a Ventas y Marketing.\n- Con \"Ver ventas\" mira el historial de un producto en la sede antes de recomendar cuánto empujarlo.\n- \"Con la fecha ya pasada\": avisa a Compras, puede que la orden no se haya recibido en Odoo.",
      ),
      PASO(
        "Clasificar los productos",
        "BI · cuando entran productos nuevos (propuesta: cada semana)",
        "/inteligencia_negocio/clasificacion/productos",
        "- En Clasificación › Productos pulsa \"Clasificar pendientes\": la IA pone categoría y nombre corto a los nuevos. Corre en el servidor: puedes salir de la pantalla.\n- Filtra el nivel Bajo y corrige con el lápiz la categoría y el nombre corto según la estructura de su categoría (regla B3). Lo que corriges, la IA ya no lo toca.\n- \"Reintentar confianza baja\" vuelve a pasar los dudosos por la IA.\n- En Clasificación › Por marca revisa que la \"Venta sin clasificar\" quede por debajo del 5 %.\n\nCriterio de salida: ningún producto con venta sin clasificar.",
      ),
      PASO(
        "Clasificar los clientes",
        "BI · cada mes (propuesta)",
        "/inteligencia_negocio/clasificacion/clientes",
        "- En Clasificación › Clientes elige la sede y los meses.\n- Antes de clasificar, anota con el lápiz el Instagram de los clientes que lo tengan (Odoo no lo guarda).\n- \"Clasificar pendientes\": la IA decide la actividad comercial con su nombre, dirección, compras e Instagram.\n- Revisa los de confianza baja y corrige la actividad con su porqué cuando tengas el dato (regla B4).\n- Compras ve y corrige la misma clasificación: coordina con ellos.",
      ),
      PASO(
        "Responder preguntas con el Agente IA",
        "BI · cuando lo necesites",
        "/agente-ia",
        "- En el Agente IA pregunta en lenguaje natural (por ejemplo, \"¿qué marca cayó este mes frente al mes pasado?\"). Responde con los datos de Odoo y del panel, sin intercompañía.\n- Puedes adjuntar un Excel, un PDF o una imagen.\n- Verifica la cifra en la pantalla correspondiente antes de entregarla (regla B5).",
        "Tu acceso al agente es de consulta: no puede cambiar nada en Odoo.",
      ),
    ],
    documentos:
      "REGISTROS\n- Clasificación de productos y clientes (con lo corregido a mano): panel, Clasificación.\n- Conversaciones con el Agente IA: panel, Agente IA.\n- Todo lo demás se lee de Odoo y del panel en vivo; los reportes se entregan en Excel.\n\nINDICADORES\n- Venta sin clasificar en el mes. Meta: menos del 5 %.\n- Productos con confianza baja sin revisar. Meta: 0 (propuesta).\n- Reportes del mes entregados antes del día 5 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_BI: Semilla = {
  codigo: "TU-BIN-01",
  titulo: "Tutorial del panel: Inteligencia de Negocio",
  area: "Inteligencia de Negocio",
  version: "0.1",
  tipo: "tutorial",
  roles: ["inteligencia de negocio"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Inteligencia de Negocio) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard.\n- Ves las tres sedes: en casi todas las pantallas eliges la sede arriba.\n- Nunca ves las operaciones entre empresas del grupo (salvo en Spiff, que es lo que se paga): tus cifras pueden no coincidir con las del SuperAdmin.\n- Eres de consulta: algunas pantallas muestran botones de guardar o asignar (cuotas, metas, actividades, leads, incobrables) que te van a responder «solo lectura». Lo que sí guardas es la Clasificación, el orden de tu menú y tus chats del Agente IA.\n- Tu menú tiene desplegables: Leads, Ventas, Cuentas por Cobrar, Clasificación, Reportes y Marketing.",
    responsables: [],
    definiciones: [
      { termino: "Sin intercompañía", definicion: "Sin operaciones entre empresas del grupo." },
      { termino: "Venezuela (consolidado)", definicion: "Valencia y Caracas juntas." },
      { termino: "Confianza", definicion: "Qué tan segura está la clasificación de la IA: Alta, Media o Baja." },
      { termino: "Nombre corto", definicion: "Nombre normalizado de un producto según su categoría." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/inteligencia_negocio",
        "Las ventas del mes: elige mes y sede (o todas). Ventas del mes, producto estrella, clientes activos, crecimiento, historial, top vendedores, marcas y productos más y menos vendidos, y top 5 clientes.",
      ),
      PASO(
        "Inventario",
        "Menú › Inventario",
        "/inteligencia_negocio/inventory",
        "El stock por producto y almacén de las tres sedes. Filtra por empresa, marca, categoría y almacén. Solo para ti salen además el costo de la sede, el precio base y las unidades vendidas (elige 30 días, 90 días o 12 meses).",
      ),
      PASO(
        "Rotación productos",
        "Menú › Rotación productos",
        "/adminleads/dashboard",
        "Cómo rota cada producto en Valencia y Caracas: marcas y categorías más vendidas y la tabla \"Rotación de SKUs\" con precio, costo, stock, ventas de 30 y 60 días, cobertura, antigüedad y estado (alta, media, baja). Excel y CSV.",
      ),
      PASO(
        "Días promedio",
        "Menú › Días promedio",
        "/inteligencia_negocio/dias-promedio",
        "Días promedio de cobro, de inventario y de pago del mes, y el ciclo de caja. Elige sede (o todas) y mes. Cada tarjeta dice de dónde sale; \"—\" con su motivo si falta un dato.",
      ),
      PASO(
        "Por llegar",
        "Menú › Por llegar",
        "/inteligencia_negocio/por-llegar",
        "Lo que viene en camino por sede: órdenes de compra de Odoo y packing lists sin cerrar.\n- \"Calendario\" (3D o plano): cada día con lo que llega; toca un día para ver sus productos.\n- \"Lista\": código, producto, cantidad, fecha prevista, orden, proveedor, stock, si ya se vendió en la sede. Excel.\n- \"Ver ventas\": el historial de ese producto en la sede.",
      ),
      PASO(
        "Reportes",
        "Menú › Reportes (desplegable)",
        "/inteligencia_negocio/reportes/facturacion",
        "- Facturación: cada producto facturado en el mes.\n- Productos: todo el catálogo con venta, costo, margen e inventario al cierre.\n- Clientes: venta por cliente con días sin comprar, cupo, días de crédito, zona y vendedor (uno o varios meses).\n- Sede: Venezuela, Valencia o Caracas; desde abril de 2026. Filtra, ordena y baja el Excel de lo filtrado.",
      ),
      PASO(
        "Clasificación de productos",
        "Menú › Clasificación › Productos",
        "/inteligencia_negocio/clasificacion/productos",
        "La categoría y el nombre corto de cada producto.\n- \"Clasificar pendientes\", \"Reintentar confianza baja\" o \"Reclasificar todo\" (la IA trabaja en el servidor; ves el avance).\n- Filtra por categoría, nivel o marca; corrige con el lápiz. Lo corregido a mano no lo vuelve a tocar la IA.\n- \"Estructura del nombre corto por categoría\" muestra cómo se arma el nombre.",
      ),
      PASO(
        "Clasificación de clientes y por marca",
        "Menú › Clasificación › Clientes",
        "/inteligencia_negocio/clasificacion/clientes",
        "- Clientes: la actividad comercial de cada cliente con lo que compra. Anota el Instagram con el lápiz, \"Clasificar pendientes\" y corrige la actividad con su porqué.\n- Por marca: la venta del mes por marca, categoría y nombre corto, con la venta sin clasificar a la vista.",
      ),
      PASO(
        "Ventas",
        "Menú › Ventas (desplegable)",
        "/inteligencia_negocio/reporte-diario",
        "Las pantallas de ventas de las tres sedes, en consulta:\n- Reporte Diario y Reporte de Ventas (elige sede; Excel).\n- Cuota y Metas por Marca (ves el avance; no guardas).\n- Stock por Marca, Reportes Comerciales, Semáforo de clientes (elige sede), Mapa de Clientes y Spiff.",
      ),
      PASO(
        "Cuentas por Cobrar",
        "Menú › Cuentas por Cobrar (desplegable)",
        "/cuentas-por-cobrar/contado-credito",
        "Cuatro pantallas de cobranza, eligiendo sede y sin intercompañía: Contado/Crédito, Tiempo de Cobro, Sobregiro e Incobrables. Todas con Excel.",
        "En Incobrables ves los botones de marcar y revertir, pero no son para tu rol: responden «Permisos insuficientes».",
      ),
      PASO(
        "Leads",
        "Menú › Leads (desplegable)",
        "/adminleads",
        "Los leads de Venezuela, en consulta: Dashboard Leads, Monitoreo de leads, Cierres, Recompra de clientes (con su recorrido), Clientes del mes y Configuración.",
      ),
      PASO(
        "Marketing",
        "Menú › Marketing (desplegable)",
        "/inteligencia_negocio/opiniones",
        "En consulta: Plan de Contenido, Frecuencia CPM, Banco de Flyers, KPI de Diseños (con su .zip), Material POP, Sorteo de clientes y Opiniones (encuesta a clientes, con Excel).",
      ),
      PASO(
        "Agente IA",
        "Menú › Agente IA",
        "/agente-ia",
        "Pregunta en lenguaje natural por ventas, cobranza, inventario, compras, costos o leads de las tres sedes, sin intercompañía. Adjunta archivos, dicta o usa el modo voz. Tus conversaciones quedan guardadas. Trae su propio recorrido.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Las actividades de cualquier persona (elige con el selector). Es de consulta: crear, asignar o mover una actividad no está habilitado para tu rol.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/inteligencia_negocio/StoplightReport",
        "Todavía no está disponible para tu rol: la pantalla dice «Próximamente».",
      ),
    ],
    documentos:
      "- Te sale «solo lectura» al guardar algo: tu rol es de consulta, salvo Clasificación, el orden del menú y tus chats.\n- Tus cifras no coinciden con las del SuperAdmin: tú no ves intercompañía.\n- Un reporte no tiene Panamá o no va antes de abril de 2026: así está hecho (Reportes son de Venezuela, desde el corte a Odoo).\n- La clasificación con IA dice que ya hay una corriendo: espera a que termine; puedes salir de la pantalla.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas de Inteligencia de Negocio." }],
  },
};
