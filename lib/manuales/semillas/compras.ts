import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Compras (name "compras" en la tabla roles).
// Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_COMPRAS: Semilla = {
  codigo: "MR-COM-01",
  titulo: "Manual de Compras",
  area: "Compras",
  version: "0.1",
  tipo: "manual",
  roles: ["compras"],
  contenido: {
    objetivo:
      "Que cada sede tenga lo que se vende sin quedarse en quiebre ni inmovilizar capital en lo que no rota: comprar lo que el panel sugiere con criterio, ordenarlo con aprobación, cargar a tiempo lo que viene en camino para que Almacén lo reciba y medir cada semana cómo va el inventario.\n\nEste manual es la rutina del rol. Cómo se usa cada pantalla está en el Tutorial del menú. Lo que hace Almacén al recibir está en el Manual de Almacén.",
    alcance:
      "- Aplica al equipo de Compras, para Valencia, Caracas y Panamá. Casi todo se mira por sede.\n- Cubre: análisis de reposición (sugeridos, quiebres, cobertura, rotación), órdenes de compra y su aprobación, packing lists y su reparto entre Valencia y Caracas, fichas de productos nuevos en Odoo, indicadores de Compras y clasificación de clientes.\n- No cubre: la recepción física y el conteo (Almacén), la aprobación de las órdenes (SuperAdmin) ni el pago a proveedores (Administración).\n\nREGLAS DEL ROL\n- P1. Se compra a partir de la sugerencia del panel; si se compra distinto (más, menos o nada), se anota en \"Manual\" de Sugeridos para que quede quién y cuánto.\n- P2. Toda compra pasa por una orden de compra del panel aprobada por el SuperAdmin. Con proveedor y productos de Odoo, la orden se crea sola en Odoo.\n- P3. Todo embarque se carga como packing list antes de que llegue, con su OC de Odoo, para que Almacén lo cuente y se cargue en Odoo al cerrar.\n- P4. La Factura Especial de Caracas (compra directa que viaja en el embarque) se marca en su renglón y nunca se mezcla con el reparto entre sedes.\n- P5. Un cambio manual del reparto entre sedes lleva su motivo.",
    responsables: [
      { rol: "Compras", responsabilidad: "Hace los pasos de este manual. Responde por qué se compró, cuánto y cuándo, y por que el packing list llegue cargado a Almacén." },
      { rol: "SuperAdmin", responsabilidad: "Aprueba o rechaza las órdenes de compra, con motivo, y fija las metas de los indicadores." },
      { rol: "Almacén", responsabilidad: "Recibe, cuenta y cierra los packing lists; al cerrar, lo contado se carga en Odoo." },
      { rol: "AdminLeads / Diseño", responsabilidad: "Reciben el aviso de los productos nuevos o sin imagen ni flyer de cada embarque." },
      { rol: "Ventas", responsabilidad: "Participa en la revisión semanal de forecast con Compras." },
    ],
    definiciones: [
      { termino: "Disponible", definicion: "Stock físico del almacén principal + tránsito − reservado para pedidos." },
      { termino: "Tránsito", definicion: "Lo que viene en recepciones de órdenes de compra todavía no validadas en Odoo. Una orden devuelta al proveedor no cuenta." },
      { termino: "Punto de reorden", definicion: "Nivel de stock en el que hay que comprar: demanda diaria × (días de entrega + 7) + stock de seguridad." },
      { termino: "ETA", definicion: "Días que tarda en llegar la compra (15 por defecto). Se cambia por producto y sede en Sugeridos." },
      { termino: "MOQ", definicion: "Cantidad mínima que exige el proveedor. La compra sugerida se redondea a ese múltiplo. Es una sola para las tres sedes." },
      { termino: "Clase ABC", definicion: "En Sugeridos, Cobertura y Rotación: por valor vendido en el año (A ≥ $15.000, B ≥ $5.000, C el resto). En la Curva 80/20: por gasto de compra (A hasta el 80 % acumulado). Son dos clasificaciones distintas." },
      { termino: "Quiebre", definicion: "Producto que se vendió en los últimos 45 días y no tiene disponible ni tránsito." },
      { termino: "Capital inmovilizado", definicion: "Valor al costo del stock que lleva 30 días o más sin venderse." },
      { termino: "Factura Especial de Caracas", definicion: "Compra directa de Caracas que viaja en el mismo embarque. Se cuenta aparte y no entra al Odoo de la sede que recibe ni al reparto." },
    ],
    pasos: [
      PASO(
        "Revisar el día: quiebres y riesgo",
        "Compras · todos los días",
        "/compras",
        "- En el Panel de Compras elige la sede y mira los avisos: productos en quiebre total y capital inmovilizado.\n- Abre Mayor Rotación: lo que está en quiebre o en riesgo, con la fecha estimada de quiebre y cuánto comprar.\n- Abre Cobertura de Stock: los productos con 7 días o menos de cobertura.\n\nCriterio de salida: sabes qué productos de cada sede necesitan compra urgente.",
      ),
      PASO(
        "Armar la compra en Sugeridos",
        "Compras · cada semana por sede (propuesta)",
        "/compras/sugeridos",
        "- En Sugerencia de compras elige la sede y la pestaña \"Para comprar / revisar\". Filtra por marca, categoría o clase si vas a comprar a un proveedor.\n- Revisa la Acción de cada producto (Riesgo, Urgente, Ordenar, Pico inusual…) y la cantidad Recomendada (ya redondeada al MOQ).\n- Corrige el ETA si el proveedor tarda distinto de 15 días.\n- Si vas a comprar distinto de lo recomendado, escribe la cantidad en \"Manual\" (0 = no comprar). Queda tu nombre (regla P1).\n- \"Exportar\" baja el análisis y el pedido en Excel para el proveedor.\n\nCriterio de salida: la columna Comprar tiene lo que se va a pedir.",
        "En el punto de reorden el tránsito cuenta dos veces (igual que el Excel de Compras). Revisa los productos con mucho tránsito antes de comprar más.",
      ),
      PASO(
        "Crear la orden de compra y enviarla a aprobación",
        "Compras",
        "/compras/ordenes",
        "- Desde Sugeridos pulsa \"Crear orden de compra\": se abre la orden con lo filtrado (hasta 100 líneas). O en Órdenes de compra, \"Nueva orden\".\n- Elige la sede, el proveedor de Odoo, la fecha esperada y escribe las notas para quien aprueba.\n- Revisa las líneas: el precio propuesto es la tarifa del proveedor, si no la última compra en la sede, si no el costo. \"Usar precios de compra\" los vuelve a traer.\n- \"Crear borrador\". Con proveedor y productos de Odoo, la orden se crea en Odoo como solicitud de presupuesto.\n- \"Enviar a aprobación\". Mientras está en revisión no se edita.\n- Si la rechazan, lee el motivo, corrige, guarda y vuelve a enviarla. Al aprobarla, se confirma en Odoo.\n\nCriterio de salida: orden aprobada y confirmada en Odoo (badge \"Odoo: P-…\").",
        "Un proveedor o una línea escrita a mano deja la orden fuera de Odoo. Busca siempre en Odoo; si el producto no existe, créalo primero.",
      ),
      PASO(
        "Cargar el packing list del embarque",
        "Compras · apenas llega el documento del proveedor",
        "/compras/packing-list",
        "- En Packing lists, \"Cargar packing list\": sucursal, llegada estimada, proveedor, número de packing list y la OC de Odoo (regla P3).\n- Sube el archivo (PDF, Excel o foto): se leen solos los renglones, los contenedores y sus precintos. Revisa todo antes de guardar.\n- El papel en hojas o resmas se pasa solo a bultos: revisa los avisos de cantidades que no dan bultos enteros.\n- Si un renglón trae unidades de la Factura Especial de Caracas, marca la casilla en ese renglón con las unidades y el número de factura (regla P4).\n- Si la mercancía se reparte entre Valencia y Caracas, marca \"Repartir la mercancía entre Valencia y Caracas\".\n- \"Guardar y enviar a Almacén\". Almacén lo ve al instante y AdminLeads recibe el aviso de productos nuevos o sin imagen.\n\nCriterio de salida: packing list cargado antes de que llegue el primer contenedor.",
        "Mientras no llega ningún contenedor puedes \"Editar\" o \"Anular\". Después, ya no.",
      ),
      PASO(
        "Decidir el reparto entre Valencia y Caracas",
        "Compras",
        "/compras/packing-list",
        "- En el detalle del packing list, \"Reparto entre Valencia y Caracas\": el panel propone cuánto va a Caracas por producto, mezclando la cuota de ventas del mes de cada sede con lo que rota en Caracas.\n- En \"Cómo se calcula\" puedes cambiar el peso de la rotación y la ventana de ventas, y \"Recalcular\".\n- Para cambiar un producto, \"Ajustar a mano\"; para todo, \"Mismo % a Caracas para todo\". Escribe el motivo (regla P5).\n- Si cambian las cantidades (al editar o al contar), el panel avisa: recalcula.\n- Almacén usa el CSV del reparto para separar la mercancía.\n\nCriterio de salida: reparto revisado antes de que Almacén separe la mercancía.",
        "El reparto no cambia la recepción ni Odoo: todo entra a la sede donde llega y la parte de la otra sede viaja después con factura entre sedes.",
      ),
      PASO(
        "Seguir la recepción y la carga en Odoo",
        "Compras",
        "/compras/packing-list",
        "- Mientras Almacén cuenta, ves en vivo cada contenedor que llega y el aviso al cerrar (conforme o con novedades). Te llega el correo con las observaciones y el PDF.\n- Al cerrar, revisa el estado de la carga en Odoo: \"Cargado en Odoo\", \"falta validar\" (si ya llegó todo lo de la OC, \"Validar la recepción de la OC: ya llegó todo\"), \"No se pudo cargar\" o \"Sin OC\".\n- Si falta la OC o hubo error, elige la OC y \"Cargar en Odoo\".\n- Renglones sin producto en Odoo: \"Cruzar con IA\" y confirma el producto propuesto; si no existe, \"No existe: crear ficha\" con nombre, código, marca, categoría y si lleva serial.\n- Si la carga está frenada, revisa en Odoo y avisa al SuperAdmin: no la cargues a mano.\n\nCriterio de salida: todo packing list cerrado queda cargado en Odoo.",
      ),
      PASO(
        "Mantener los MOQ al día",
        "Compras · cuando cambia un proveedor",
        "/compras/moq",
        "- En MOQ, \"Descargar Plantilla\" (filtra por marca o categoría), llena el MOQ de cada producto y súbelo en \"Importación Masiva\".\n- Sin MOQ, la sugerencia usa 1.\n\nCriterio de salida: los productos que compras tienen el MOQ del proveedor.",
        "Un MOQ en 0 o vacío no se guarda: para cambiarlo, sube el valor nuevo.",
      ),
      PASO(
        "Liberar el capital inmovilizado",
        "Compras · cada mes",
        "/compras/menor_rotacion",
        "- En Menor Rotación filtra 90+ días y \"Nunca se ha vendido\": es el capital que no rota.\n- Bloquea su compra en Sugeridos (Manual = 0) y propón a Ventas y Marketing una acción para moverlo (propuesta).\n- Revisa Rotación por Categoría para ver qué categorías concentran lo estancado.",
      ),
      PASO(
        "Revisar los indicadores y el forecast",
        "Compras · cada semana",
        "/compras/StoplightReport",
        "- En el Stoplight Report de Compras revisa: variación del costo de compra, rotación, quiebre, inventario de más de 90 días, revisión de forecast y propuestas de productos nuevos.\n- Después de la reunión semanal con Ventas, marca el checklist de forecast: reunión, forecast actualizado, quiebres y órdenes revisados, decisiones registradas.\n- Usa la Curva 80/20 para ver en qué productos se concentra el gasto de compra y Tendencia de Ventas para la estacionalidad.\n\nCriterio de salida: checklist de forecast de la semana completo.",
      ),
    ],
    documentos:
      "REGISTROS\n- Ajustes de Sugeridos (ETA y compra manual, con quién): panel, por sede.\n- Órdenes de compra, su historial y aprobación: panel; la orden confirmada, en Odoo.\n- Packing lists, reparto entre sedes con su historial y motivos: panel; la recepción cargada, en Odoo.\n- MOQ por producto: panel.\n\nINDICADORES (Stoplight de Compras; metas del SuperAdmin)\n- Porcentaje de quiebre de inventario.\n- Inventario con más de 90 días.\n- Rotación saludable y variación del costo de compra.\n- Revisión semanal de forecast completa. Meta: todas las semanas.\n- Packing lists cargados antes de la llegada del primer contenedor. Meta: 100 % (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia confirma lo marcado como propuesta (frecuencia de compra por sede, acción sobre el inventario estancado, carga del packing list antes de la llegada).",
      },
    ],
  },
};

export const TUTORIAL_COMPRAS: Semilla = {
  codigo: "TU-COM-01",
  titulo: "Tutorial del panel: Compras",
  area: "Compras",
  version: "0.1",
  tipo: "tutorial",
  roles: ["compras"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Compras) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Panel de Compras.\n- Casi todas las pantallas tienen selector de sede (Valencia, Caracas, Panamá): lo que ves es de esa sede.\n- La venta sale de Odoo desde abril de 2026 y de Smartbit antes; no cuenta ventas entre empresas del grupo ni servicios.\n- Los datos de Odoo se refrescan cada 5 a 10 minutos.\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "Disponible", definicion: "Físico + tránsito − reservado." },
      { termino: "Tránsito", definicion: "Lo que viene en órdenes de compra sin recibir." },
      { termino: "ETA", definicion: "Días que tarda en llegar la compra." },
      { termino: "MOQ", definicion: "Cantidad mínima del proveedor." },
      { termino: "Quiebre", definicion: "Se vendió en 45 días y no hay disponible ni tránsito." },
      { termino: "ABC", definicion: "Clase por valor vendido (Sugeridos) o por gasto de compra (Curva 80/20)." },
    ],
    pasos: [
      PASO(
        "Panel de Compras",
        "Menú › Dashboard",
        "/compras",
        "El resumen del inventario de la sede.\n- Avisos de quiebre total y de capital inmovilizado, con su botón.\n- Tarjetas: valor a comprar, en quiebre, en riesgo y capital inmovilizado; cada una abre su pantalla.\n- Clasificación ABC del catálogo.",
      ),
      PASO(
        "Sugerencia de compras",
        "Menú › Sugerencia de compras",
        "/compras/sugeridos",
        "Qué comprar y cuánto, producto por producto.\n- Filtra por sede, texto, acción, clase, marca y categoría.\n- Pestañas \"Para comprar / revisar\" y \"Todos los productos\".\n- Columnas de stock, ventas de 45 y 365 días, demanda, MOQ, costo, ETA, seguridad, reorden, objetivo, recomendada y la acción.\n- Edita ETA y Manual en la misma tabla (columnas violeta): se guarda al salir del campo; Escape deshace; Manual 0 bloquea la compra.\n- \"Exportar\" (análisis y pedido) y \"Crear orden de compra\" con lo filtrado.\n- Pasa el mouse por el ícono de cada columna para ver cómo se calcula.",
      ),
      PASO(
        "Órdenes de compra",
        "Menú › Órdenes de compra",
        "/compras/ordenes",
        "Tus órdenes, por estado (borrador, enviada, aprobada, rechazada) y por sede.\n- \"Nueva orden\": sede, proveedor de Odoo, fecha esperada, notas y productos (\"Buscar producto\"). \"Crear borrador\".\n- En la orden: \"Guardar cambios\", \"Eliminar\" (solo borradores) y \"Enviar a aprobación\".\n- El badge de Odoo dice si la orden está en Odoo y con qué número; si falló, el motivo sale al pasar el mouse.\n- El historial muestra cada cambio y el motivo si la rechazaron.",
      ),
      PASO(
        "Packing lists",
        "Menú › Packing lists",
        "/compras/packing-list",
        "Los embarques que vienen, por etapa (por llegar, descargando, cerrados) y sucursal.\n- \"Cargar packing list\": datos, OC de Odoo, contenedores con precintos, el archivo (se lee solo) y los renglones. En cada renglón, la casilla de Factura Especial de Caracas. \"Guardar y enviar a Almacén\".\n- En el detalle: contenedores y su avance en vivo, recorrido, observaciones en PDF y seriales en Excel.\n- \"Reparto entre Valencia y Caracas\": automático, \"Ajustar a mano\", \"Mismo % a Caracas para todo\", \"Volver al automático\", CSV e historial.\n- Después del cierre: estado de la carga en Odoo, \"Cargar en Odoo\", \"Cruzar con IA\" y \"No existe: crear ficha\".",
        "\"Editar\" y \"Anular\" solo mientras no llegó ningún contenedor.",
      ),
      PASO(
        "Mayor Rotación",
        "Menú › Mayor Rotación",
        "/compras/mayor_rotacion",
        "Los productos que se están vendiendo y van a quedarse sin stock.\n- Tarjetas: en quiebre total, en riesgo, valor estimado de compra y total de alertas.\n- Columnas: ventas de 45 días, disponible, tránsito, punto de reorden, cantidad a comprar (la de Sugeridos), valor y nivel de alerta con la fecha estimada de quiebre.\n- Exportar. La orden se crea desde Sugeridos.",
      ),
      PASO(
        "Menor Rotación",
        "Menú › Menor Rotación",
        "/compras/menor_rotacion",
        "El capital inmovilizado: productos con stock que llevan 30 días o más sin venderse.\n- Filtra por días sin vender (30-59, 60-89, 90+, nunca se vendió), marca y categoría.\n- Tarjetas: productos, unidades y capital inmovilizado.\n- Exportar.",
      ),
      PASO(
        "Cobertura de Stock",
        "Menú › Cobertura de Stock",
        "/compras/cobertura",
        "Cuántos días alcanza el stock con la venta de los últimos 45 días.\n- Tarjetas Crítico (7 días o menos), Riesgo, Bajo y Promedio: haz clic para filtrar.\n- Columnas: stock, ventas de 45 días, demanda diaria, días de cobertura y fecha estimada de quiebre.\n- Solo salen los productos con stock y con venta; los que ya no tienen stock están en Mayor Rotación.",
      ),
      PASO(
        "Rotación por Categoría",
        "Menú › Rotación por Categoría",
        "/compras/rotacion-categoria",
        "Las categorías ordenadas por ventas.\n- Tarjetas: categorías, ventas de 45 días, capital estancado (más de 45 días sin rotar) y SKUs en quiebre.\n- Haz clic en una categoría para ver sus productos. Exportar.",
      ),
      PASO(
        "Curva 80/20",
        "Menú › Curva 80/20",
        "/compras/pareto-80-20",
        "En qué productos se concentra el gasto de compra (no las ventas).\n- Elige el período (90 días, 180 días o un año), marca y clase.\n- Gráfica de los 30 primeros y detalle con monto, unidades, % individual, % acumulado y clase (A hasta el 80 %).\n- Aquí sí entran las compras entre empresas del grupo. Exportar.",
      ),
      PASO(
        "Tendencia de Ventas",
        "Menú › Tendencia de Ventas",
        "/compras/tendencia",
        "Unidades vendidas en el tiempo.\n- Histórico de 24 meses: total, promedio mensual, mejor mes.\n- Unidades por semana del mes elegido (haz clic en una barra para ver los productos) y los productos que más se vendieron.",
      ),
      PASO(
        "MOQ",
        "Menú › MOQ",
        "/compras/moq",
        "Las cantidades mínimas de cada proveedor.\n- \"Descargar Plantilla\", llénala y súbela en \"Importación Masiva\".\n- La tabla \"MOQs Configurados\" con buscador y Exportar.\n- El MOQ es uno para las tres sedes.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/compras/StoplightReport",
        "Los indicadores de Compras de tu sede, en semáforo.\n- Pestañas Resumen, Semanal, Mensual, Trimestral y Anual.\n- Haz clic en un indicador para ver su detalle.\n- Marca aquí el checklist de la revisión semanal de forecast. Las metas las fija el SuperAdmin.",
      ),
      PASO(
        "Clasificación de clientes",
        "Menú › Clasificación de clientes",
        "/compras/clasificacion-clientes",
        "La actividad comercial de cada cliente (qué tipo de negocio es), con lo que compra.\n- Filtra por actividad, zona y confianza; busca y exporta.\n- \"Clasificar pendientes\" o \"Reclasificar la lista\" con la IA.\n- Con el lápiz corrige la actividad, el porqué o el Instagram del cliente. Lo que corriges a mano la IA ya no lo cambia.",
      ),
      PASO(
        "Solicitudes de personal",
        "Menú › Solicitudes de personal",
        "/solicitudes-personal",
        "Para pedir personal para Compras: \"Nueva solicitud\" con cargo, motivo, urgencia, perfil y funciones. La aprueba el SuperAdmin y RRHH hace la búsqueda; ves su avance y anotas tu entrevista técnica.",
      ),
      PASO(
        "Políticas y Acuerdos",
        "Menú › Políticas y Acuerdos",
        "/politicas",
        "Las políticas vigentes. Abre las \"Pendientes de leer\" y pulsa \"Leído y entendido\".",
      ),
    ],
    documentos:
      "- La orden no llega a Odoo: el proveedor o alguna línea se escribió a mano. Usa siempre los de Odoo.\n- La orden quedó aprobada con error de Odoo: revisa el motivo en el badge (términos de pago, compañía) y avisa al SuperAdmin.\n- No puedes editar el packing list: ya llegó un contenedor.\n- Un producto del packing list no está en Odoo: en el detalle, \"Cruzar con IA\" o \"No existe: crear ficha\".\n- Los números de ABC no coinciden entre pantallas: Sugeridos usa el valor vendido y la Curva 80/20 el gasto de compra.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Compras." }],
  },
};
