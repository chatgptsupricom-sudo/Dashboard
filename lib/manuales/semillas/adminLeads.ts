import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol AdminLeads (name "adminLeads" en la tabla roles; se
// compara en minúsculas). Nombres de pantallas y botones del panel a nov-2026.
// Lo marcado "(propuesta)" lo confirma la Gerencia antes de publicar. Algunas
// pantallas son solo de Valencia (Catálogo, Productos, Material POP, subir el
// HTML del Plan y de Frecuencia CPM); Packing List, Valencia y Caracas.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_ADMINLEADS: Semilla = {
  codigo: "MR-ADL-01",
  titulo: "Manual de AdminLeads",
  area: "Marketing",
  version: "0.1",
  tipo: "manual",
  roles: ["adminleads"],
  contenido: {
    objetivo:
      "Que cada lead que llega por las campañas termine en manos de un vendedor que lo atienda y quede cerrado con su resultado, que los vendedores tengan los flyers y el material para vender, y que el plan de contenido y las métricas de las campañas estén al día.\n\nEste manual es la rutina de AdminLeads. Cómo se usa cada pantalla está en el Tutorial del menú. Lo que hace el vendedor con cada lead está en su manual (MR-VEN-01).",
    alcance:
      "- Aplica a AdminLeads de Valencia, Caracas y Panamá. En Leads, Valencia y Caracas trabajan juntas; Panamá va aparte.\n- Cubre: seguimiento y asignación de leads, cierres y revisión de ventas, importación de leads de Excel, configuración de la rotación, banco de flyers, Plan de Contenido, Frecuencia CPM, Material POP (Valencia), informes de campañas y rotación de productos.\n- No cubre: la venta en Odoo (vendedor), la pauta en Meta ni el diseño de las piezas (Diseñador).\n\nREGLAS DEL ROL\n- L1. Ningún lead queda en NUEVO sin vendedor ni más de un día sin contacto (propuesta).\n- L2. Todo lead que se reasigna se reasigna en el panel (Monitoreo de leads), para que quede registrado y el vendedor reciba el aviso.\n- L3. Un cierre ganado lleva el monto y la factura de Odoo; si el vendedor no la puso, se corrige en Cierres.\n- L4. Todo producto nuevo que llega en un embarque tiene su flyer en el banco antes de que llegue (propuesta).\n- L5. En Material POP, el stock solo baja al registrar la entrega; nada sale sin solicitud o sin salida registrada.",
    responsables: [
      { rol: "AdminLeads", responsabilidad: "Hace los pasos de este manual. Responde por que los leads lleguen a un vendedor y por que el material de apoyo esté disponible." },
      { rol: "Vendedor", responsabilidad: "Contacta, trabaja y cierra cada lead que se le asigna; pide Material POP." },
      { rol: "Gerente de Operaciones", responsabilidad: "Ve y trabaja los mismos leads y la configuración de la rotación." },
      { rol: "Diseñador", responsabilidad: "Hace las piezas y los flyers; trabaja también en el Plan de Contenido y el Banco de Flyers." },
      { rol: "Compras", responsabilidad: "Carga los packing lists; al cargarlos te llega el aviso de productos sin imagen o sin flyer." },
    ],
    definiciones: [
      { termino: "Lead", definicion: "Persona o empresa que pidió información por una campaña o canal y que se asigna a un vendedor." },
      { termino: "Rotación por estado", definicion: "Qué vendedores reciben los leads de cada estado geográfico. La usa la asignación automática." },
      { termino: "Lead de Excel", definicion: "Lead de campañas de antes del panel, importado desde Excel. Al asignarlo a un vendedor pasa al tablero del panel." },
      { termino: "Cierre ganado / Ya es cliente / Perdido", definicion: "Cómo terminó un lead. El ganado lleva monto y factura de Odoo." },
      { termino: "Recompra", definicion: "Cuántas veces volvió a comprar un cliente que llegó por un lead, después de su primera venta." },
      { termino: "Flyer", definicion: "Imagen de un producto que el vendedor descarga con precio para mandar al cliente." },
      { termino: "Material POP", definicion: "Material publicitario (Valencia) que se entrega a clientes o se usa internamente. Aprobar una solicitud reserva; entregar descuenta." },
    ],
    pasos: [
      PASO(
        "Revisar los leads del día",
        "AdminLeads · todos los días",
        "/adminleads/monitoreo_leads",
        "- En Monitoreo de leads revisa los NUEVOS: que todos tengan vendedor y que no lleven más de un día sin contacto (regla L1).\n- Reasigna los que lo necesiten desde la columna Vendedor o arrastrando la tarjeta (regla L2). El vendedor recibe el aviso.\n- Si hace falta, carga un lead a mano con \"+ Nuevo Lead\".\n- En Dashboard Leads revisa los nuevos del día, la efectividad y el tiempo de contacto por vendedor.\n\nCriterio de salida: ningún lead NUEVO sin vendedor.",
        "Un lead cerrado por venta no cambia de vendedor. Un vendedor de otra operación (Panamá o Venezuela) no se puede elegir.",
      ),
      PASO(
        "Revisar los cierres y las ventas sin marcar",
        "AdminLeads · cada semana",
        "/adminleads/cierres",
        "- En Cierres revisa los ganados del período: que tengan monto y factura (regla L3). Corrige con \"Editar cierre\" o reabre el lead si se cerró por error.\n- En Monitoreo de leads › \"Por revisar\": el panel propone ventas que no se marcaron (el cliente compró en los 90 días siguientes) y clientes de los vendidos sin RIF. Confirma con el monto o descarta.\n- En Recompra revisa qué clientes de leads volvieron a comprar.\n\nCriterio de salida: los cierres del mes completos y \"Por revisar\" al día.",
      ),
      PASO(
        "Mantener la asignación de leads",
        "AdminLeads · cuando cambia el equipo",
        "/adminleads/configuracion",
        "- En Configuración, pestaña \"Vendedores\": deja activos solo los que atienden leads.\n- Pestaña \"Estados por vendedor\": cada estado con al menos un vendedor activo; si no, sus leads quedan sin vendedor.\n- Pestaña \"Pipeline\": las etapas del tablero.\n- Pestaña \"Servicios\": costos fijos y recargas de las herramientas.\n\nCriterio de salida: ningún estado sin vendedor activo.",
      ),
      PASO(
        "Importar los leads de Excel",
        "AdminLeads · cuando hay un Excel de campaña",
        "/adminleads/monitoreo_leads",
        "- En Monitoreo de leads › \"Importar Excel\": elige la sede y sube el .xlsx (hasta 15 MB). Re-importar actualiza lo que ya existe.\n- En el recuadro \"Campañas\" ponle a cada hoja el nombre de la campaña de Meta.\n- Revisa en \"Leads de Excel\" los que quedaron sin RIF o sin vendedor y asígnalos: al asignarlos pasan al tablero del panel.",
        "Un usuario de Panamá solo importa Panamá.",
      ),
      PASO(
        "Tener los flyers al día",
        "AdminLeads · cada semana y con cada embarque",
        "/adminleads/banco-imagenes",
        "- Cuando Compras carga un packing list te llega el correo con los productos nuevos, sin imagen en Odoo o sin flyer.\n- En Banco de Flyers busca el producto por código (o por categoría con \"Buscar productos\"), revisa modelo, marca y categoría, sube el flyer y \"Guardar Flyer\" (regla L4).\n- Escribe la categoría siempre igual: una forma distinta crea otra categoría en la galería.\n- En Productos (Valencia) filtra \"Sin imagen\" para ver qué productos no tienen foto en Odoo y pídela a Diseño.\n- En Packing List revisa qué llega y cuándo, para tener los flyers antes.\n\nCriterio de salida: ningún producto que ya llegó sin flyer.",
        "El precio queda guardado al subir el flyer y no se actualiza solo: si cambia en Odoo, sube el flyer de nuevo.",
      ),
      PASO(
        "Plan de Contenido y Frecuencia CPM",
        "AdminLeads (subir el HTML: solo Valencia)",
        "/adminleads/vista-custom",
        "- En Plan de Contenido elige la marca (Supricom, Asta o Bluetti) y trabaja el plan dentro de la pantalla: los cambios se guardan solos y el equipo los ve en vivo.\n- Para cambiar el plan por uno nuevo, \"Actualizar HTML\" (solo AdminLeads de Valencia): lo de antes queda en el Historial y los cambios del equipo se aplican encima. Desde Historial se puede restaurar una versión.\n- En Frecuencia CPM arma el plan del mes de cada marca y guárdalo con el botón del propio plan; busca inventario con \"Crear CPMs\".\n- \"Descargar\" baja el plan completo.\n\nCriterio de salida: el plan de la semana siguiente listo antes del viernes (propuesta).",
      ),
      PASO(
        "Material POP",
        "AdminLeads de Valencia",
        "/adminleads/material-pop",
        "- Solicitudes: abre las pendientes, revisa lo pedido contra lo disponible y \"Aprobar y reservar\" (puedes aprobar menos) o \"Rechazar\" con el motivo. El vendedor recibe el aviso de la aprobada.\n- Cuando se entrega, en la solicitud aprobada elige de dónde sale (Oficina o Almacén) y \"Registrar entrega\": ahí baja el stock (regla L5). Imprime la nota de entrega.\n- Si ya no se necesita, \"Cancelar y liberar\". Si se entregó por error, \"Revertir entrega\" con el motivo.\n- Lo que entra, se traslada o se ajusta, en Entradas; lo que sale sin solicitud, en Salidas.\n- Una vez al mes, Inventario: cuenta, \"Guardar inventario\" y \"Aplicar al stock\" (propuesta).\n- Revisa Alertas: los productos agotados.\n\nCriterio de salida: ninguna solicitud pendiente de más de 2 días hábiles (propuesta).",
      ),
      PASO(
        "Medir las campañas y los productos",
        "AdminLeads · al cierre del mes",
        "/adminleads",
        "- En Dashboard Leads, pestaña \"Campañas Meta\", \"Generar informe\" del mes (para imprimir o guardar en PDF) y \"Reporte por campaña\" con costo por lead, por cierre y retorno.\n- \"Guardar cierre\" del mes guarda las métricas de Instagram para comparar en los próximos informes.\n- En Cierres, \"Reporte por campaña\" muestra de qué campañas vino la venta.\n- En Dashboard (Productos) revisa las marcas y categorías más vendidas y la rotación de cada SKU para decidir qué promocionar.",
        "El informe mensual cuenta los leads por fecha de entrada y las ventas por fecha de cierre: no cuadra exacto con la pestaña General.",
      ),
    ],
    documentos:
      "REGISTROS\n- Leads, reasignaciones (con aviso al vendedor), cierres y su historial: panel, Leads.\n- Vendedores activos y rotación por estado: panel, Configuración.\n- Flyers: panel, Banco de Flyers.\n- Plan de Contenido y su historial, Frecuencia CPM por marca y mes: panel.\n- Material POP: solicitudes, entradas, salidas, inventarios e historial: panel.\n\nINDICADORES\n- Leads NUEVOS sin vendedor o con más de un día sin contacto. Meta: 0 (propuesta).\n- Efectividad de cierre y tiempo de primer contacto por vendedor (Dashboard Leads).\n- Productos llegados sin flyer. Meta: 0 (propuesta).\n- Solicitudes de Material POP pendientes de más de 2 días hábiles. Meta: 0 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_ADMINLEADS: Semilla = {
  codigo: "TU-ADL-01",
  titulo: "Tutorial del panel: AdminLeads",
  area: "Marketing",
  version: "0.1",
  tipo: "tutorial",
  roles: ["adminleads"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de AdminLeads) está en tu Manual.",
    alcance:
      "- Al entrar llegas a Dashboard Leads.\n- En Leads, Valencia y Caracas se ven juntas; Panamá aparte.\n- Algunas opciones salen solo en Valencia: Catálogo, Productos y Material POP. Packing List sale en Valencia y Caracas.\n- Puedes reordenar tu menú con «Editar orden del menú».",
    responsables: [],
    definiciones: [
      { termino: "Lead", definicion: "Interesado que llega por una campaña y se asigna a un vendedor." },
      { termino: "Rotación", definicion: "Qué vendedores reciben los leads de cada estado." },
      { termino: "Flyer", definicion: "Imagen del producto que el vendedor descarga con precio." },
      { termino: "Reservado", definicion: "En Material POP, lo aprobado que todavía no se entregó." },
    ],
    pasos: [
      PASO(
        "Dashboard Leads",
        "Menú › Dashboard Leads",
        "/adminleads",
        "Las métricas de los leads.\n- Pestañas: General (total, monto, efectividad, cierres, tiempos de contacto y de cierre), Campañas Meta, Histórico (Excel) y Servicios.\n- Filtra por sede, vendedor, canal y período. \"Exportar Excel\".\n- En Campañas Meta: \"Generar informe\" del mes, \"Reporte por campaña\" y \"Guardar cierre\" de Instagram.",
      ),
      PASO(
        "Monitoreo de leads",
        "Menú › Monitoreo de leads",
        "/adminleads/monitoreo_leads",
        "El tablero de todos los leads.\n- Pestañas: \"Leads del panel\", \"Leads de Excel\", \"Importar Excel\" y \"Por revisar\".\n- Vista de tabla o de columnas; filtra por empresa, vendedor, sede, estado y estatus.\n- Cambia el vendedor desde su columna o arrastrando la tarjeta; cierra un lead arrastrándolo a CERRADO.\n- \"+ Nuevo Lead\", editar datos, observaciones y segunda compra.\n- \"Por revisar\": confirma o descarta las ventas que propone el panel.",
      ),
      PASO(
        "Cierres",
        "Menú › Cierres",
        "/adminleads/cierres",
        "Los leads cerrados: filtra por vendedor, canal, fechas y motivo. \"Editar cierre\" (monto, factura, fecha) o reabre el lead. \"Reporte por campaña\" abre las ventas por campaña para imprimir.",
      ),
      PASO(
        "Recompra y Clientes del mes",
        "Menú › Recompra de clientes",
        "/adminleads/recompra",
        "- Recompra de clientes: cuántas veces volvió a comprar cada cliente que llegó por un lead. Trae su propio recorrido.\n- Clientes del mes: quién compró en el período, con sus facturas.",
      ),
      PASO(
        "Configuración",
        "Menú › Configuración",
        "/adminleads/configuracion",
        "- \"Pipeline\": las etapas del tablero.\n- \"Vendedores\": quién recibe leads.\n- \"Estados por vendedor\": qué vendedores reciben los leads de cada estado.\n- \"Servicios\": costos fijos y recargas.",
      ),
      PASO(
        "Dashboard (Productos)",
        "Menú › Dashboard",
        "/adminleads/dashboard",
        "Cómo se venden los productos de tu sede.\n- Marcas y categorías más vendidas, en unidades o monto (elige el período); haz clic para ver sus productos.\n- \"Rotación de SKUs\" (últimos 90 días): alta, media o baja por producto, con stock, ventas de 30 y 60 días, cobertura, antigüedad y última venta. Filtra y exporta a Excel o CSV.",
      ),
      PASO(
        "Banco de Flyers",
        "Menú › Banco de Flyers",
        "/adminleads/banco-imagenes",
        "- \"Agregar Flyer\": busca el producto por código (o por categoría), revisa modelo, marca y categoría, sube la imagen y \"Guardar Flyer\".\n- Galería: busca o filtra por categoría; elimina un flyer con su botón.\n- Al abrir un flyer puedes ponerle precio de Odoo o personalizado y descargarlo; con varios seleccionados, descargarlos juntos.",
        "Si al guardar no aparece en la galería, no se subió: revisa que sea una imagen de menos de 10 MB.",
      ),
      PASO(
        "Plan de Contenido",
        "Menú › Plan de Contenido",
        "/adminleads/vista-custom",
        "El plan de contenido de cada marca (pestañas Supricom, Asta y Bluetti).\n- Trabaja dentro del plan: se guarda solo (arriba dice \"Guardado\") y el equipo lo ve en vivo.\n- \"Pantalla completa\", \"Descargar\" y \"Recargar\".\n- Solo Valencia: \"Actualizar HTML\" para subir un plan nuevo e \"Historial\" para ver o restaurar versiones.",
      ),
      PASO(
        "Frecuencia CPM",
        "Menú › Frecuencia CPM",
        "/adminleads/frecuencia-cpm",
        "El plan de CPM del mes de cada marca. Trabaja dentro del plan y guárdalo con su propio botón; busca productos con stock de tu sede para armar los CPM. Solo Valencia sube un HTML nuevo.",
      ),
      PASO(
        "Material POP (Valencia)",
        "Menú › Material POP",
        "/adminleads/material-pop",
        "El material publicitario.\n- Catálogo: los productos POP (\"Nuevo producto\", editar, desactivar, importar Excel).\n- Inventario: conteo físico, \"Guardar inventario\" y \"Aplicar al stock\".\n- Entradas (entrada, traslado, ajuste) y Salidas (cliente, campaña, evento, uso interno).\n- Solicitudes: \"Aprobar y reservar\", \"Rechazar\", \"Registrar entrega\", \"Cancelar y liberar\", \"Revertir entrega\" y la nota de entrega.\n- Historial, Clientes por marca y Alertas de agotados.",
      ),
      PASO(
        "Catálogo y Productos (Valencia)",
        "Menú › Catálogo",
        "/adminleads/catalogo",
        "- Catálogo: los productos con stock y precio de Valencia o Caracas; exporta a Excel las columnas que quieras.\n- Productos: todos los productos de Odoo; \"Sin imagen\" muestra los que no tienen foto.",
      ),
      PASO(
        "Packing List",
        "Menú › Packing List",
        "/disenador/llegadas",
        "Lo que llegó y lo que va a llegar al almacén de tu sede, en un calendario. Toca un día para ver sus productos; busca un producto para ver cuándo llega. Lo que llega a Valencia para Caracas sale marcado.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Tu lista de tareas: \"+ Nueva Actividad\" (título, fecha límite, descripción) y el tablero de pendientes, en curso y culminadas.",
      ),
    ],
    documentos:
      "- Un lead no llega a ningún vendedor: su estado no tiene vendedor activo en Configuración.\n- No puedes asignar un vendedor: es de otra operación o el lead está cerrado por venta.\n- No ves \"Actualizar HTML\": solo lo tiene AdminLeads de Valencia.\n- No puedes aprobar una solicitud de POP por la cantidad pedida: no hay suficiente disponible (stock menos lo reservado).\n- El flyer no se guardó: la pantalla no avisa; revisa el tamaño y el formato de la imagen.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de AdminLeads." }],
  },
};
