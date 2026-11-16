import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Diseñador (name "diseñador" en la tabla roles).
// Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia de Marketing antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_DISENADOR: Semilla = {
  codigo: "MR-DIS-01",
  titulo: "Manual del Diseñador",
  area: "Marketing",
  version: "0.1",
  tipo: "manual",
  roles: ["diseñador"],
  contenido: {
    objetivo:
      "Que todo lo que se diseña quede en el catálogo de diseños con su categoría y su fecha, que los productos que se venden tengan su flyer en el banco y que el plan de contenido de cada marca se cumpla.\n\nEste manual es la rutina del Diseñador. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al equipo de Diseño.\n- Cubre: registro de los diseños (KPI de Diseños), flyers de los productos (Banco de Flyers), trabajo sobre el Plan de Contenido y la Frecuencia CPM, edición de imágenes con IA y consulta de productos, llegadas y clientes para orientar el contenido.\n- No cubre: subir un HTML nuevo del Plan o de la Frecuencia (AdminLeads de Valencia), la pauta en Meta ni las fotos de producto en Odoo.\n\nREGLAS DEL ROL\n- D1. Todo diseño terminado se sube al KPI de Diseños el mismo día, con su categoría y la fecha en que se hizo (propuesta).\n- D2. Todo producto que llega o se vende tiene su flyer en el Banco de Flyers con la marca, el modelo y la categoría correctos.\n- D3. Una imagen hecha con el Editor con IA se revisa antes de publicarla (marca, precio, textos) y, si se usa, se guarda en el catálogo.\n- D4. Lo que se borra del catálogo pasa por la papelera; solo se elimina definitivamente lo que no se va a usar.",
    responsables: [
      { rol: "Diseñador", responsabilidad: "Hace los pasos de este manual y responde por el catálogo de diseños y los flyers." },
      { rol: "AdminLeads", responsabilidad: "Pide los diseños según el plan de contenido, sube el HTML del plan y avisa los productos nuevos sin flyer." },
      { rol: "Vendedores", responsabilidad: "Descargan los flyers del banco con precio para mandarlos a los clientes." },
      { rol: "Gerencia de Marketing", responsabilidad: "Revisa la productividad del equipo en el KPI de Diseños." },
    ],
    definiciones: [
      { termino: "KPI de Diseños", definicion: "El catálogo de los diseños del equipo (posts, historias, banners, catálogos…) y el conteo de cuántos se hacen por día, semana y mes." },
      { termino: "Categoría del diseño", definicion: "Post de Instagram, banner web, historia, solicitud corporativa, catálogo o solicitud de cliente en apoyo a piso de ventas. Es obligatoria." },
      { termino: "Colección", definicion: "El nombre de la carpeta en la que estaba el diseño al subirlo; sirve para agruparlos." },
      { termino: "Fecha del diseño", definicion: "El día en que se hizo: es el que cuenta para el KPI, no el día en que se subió." },
      { termino: "Flyer", definicion: "Imagen del producto que el vendedor descarga con precio desde el Banco de Flyers." },
    ],
    pasos: [
      PASO(
        "Subir los diseños del día",
        "Diseñador · todos los días",
        "/disenador/disenos",
        "- En KPI de Diseños pulsa \"Subir carpeta completa\" (la carpeta da el nombre de la colección) o \"Subir archivos\".\n- Elige la categoría para todo el lote y cámbiala en los diseños que sean de otra.\n- Revisa la \"Fecha del diseño\": por defecto es hoy; si es de otro día, cámbiala.\n- Revisa los títulos (salen del nombre del archivo) y pulsa \"Guardar N diseños\".\n\nCriterio de salida: todo lo diseñado hoy está en el catálogo con su categoría (regla D1).",
        "Pon nombres claros a los archivos y a las carpetas antes de subir: así quedan el título y la colección.",
      ),
      PASO(
        "Hacer y subir los flyers de los productos",
        "Diseñador · cada semana y con cada embarque",
        "/disenador/banco-imagenes",
        "- Cuando AdminLeads avisa productos nuevos o sin flyer (te llega por el aviso de los packing lists), haz el flyer.\n- En Banco de Flyers busca el producto por código o por categoría, revisa modelo, marca y categoría, sube el flyer y \"Guardar Flyer\" (regla D2).\n- En Productos (Valencia) filtra \"Sin imagen\" para ver qué productos no tienen foto en Odoo.\n- En Packing List mira qué llega y cuándo, para tener los flyers antes.\n\nCriterio de salida: ningún producto que ya llegó sin flyer (propuesta).",
        "El precio del flyer queda fijo al subirlo: si cambia en Odoo, súbelo de nuevo.",
      ),
      PASO(
        "Trabajar el Plan de Contenido",
        "Diseñador con AdminLeads",
        "/disenador/vista-custom",
        "- En Plan de Contenido elige la marca (Supricom, Asta o Bluetti) y revisa qué piezas te tocan esta semana.\n- Marca y actualiza tu avance dentro del plan: se guarda solo y el equipo lo ve en vivo.\n- En Frecuencia CPM revisa los productos de cada campaña para diseñarlos.\n- Si el plan está vacío o hay que cambiarlo por uno nuevo, pídeselo a AdminLeads de Valencia: tú no subes el HTML.",
      ),
      PASO(
        "Editar imágenes con IA",
        "Diseñador · cuando haga falta",
        "/disenador/editor-ia",
        "- En Editor con IA sube una imagen o elígela del KPI de Diseños.\n- Describe el cambio en el prompt (\"Mejorar con IA\" te ayuda a redactarlo) y elige la proporción (1:1, 9:16, 16:9…).\n- \"Generar con IA\" y espera (hasta un minuto).\n- Revisa el resultado (regla D3): si sirve, \"Guardar\" con su categoría (queda en el catálogo, colección IA) o \"Descargar\".\n\nCriterio de salida: solo se usan imágenes de IA revisadas.",
        "Cada generación consume crédito de la cuenta de IA de la empresa: genera con un prompt claro en vez de probar muchas veces.",
      ),
      PASO(
        "Orientar el contenido con datos",
        "Diseñador · cada mes (propuesta)",
        "/disenador/dashboard",
        "- En el Dashboard mira las marcas y categorías más vendidas de los últimos 3 meses: son las que conviene reforzar con contenido.\n- En Mapa de clientes mira en qué estados y ciudades hay más clientes, para orientar las piezas por zona.\n- En el Catálogo revisa qué productos tienen stock antes de diseñar una promoción.",
      ),
      PASO(
        "Mantener el catálogo de diseños ordenado",
        "Diseñador · cada semana",
        "/disenador/disenos",
        "- Corrige con \"Editar\" el título, la categoría, la colección o la fecha de un diseño mal cargado (o arrástralo a otro día en el calendario).\n- Lo repetido o que no sirve, \"Mover a la papelera\". Desde la Papelera, \"Restaurar al catálogo\" o, si ya no se usará, \"Eliminar definitivamente\" (regla D4).\n- Para entregar un lote, selecciónalo y \"Descargar ZIP\".",
      ),
    ],
    documentos:
      "REGISTROS\n- Diseños con su categoría, colección, fecha y quién los subió: panel, KPI de Diseños.\n- Flyers con su producto y precio: panel, Banco de Flyers.\n- Avance del Plan de Contenido y la Frecuencia CPM: panel.\n- Tus imágenes generadas con IA: panel, Editor con IA (las últimas 12) y las guardadas en el catálogo.\n\nINDICADORES\n- Diseños por día, semana y mes y por categoría (KPI de Diseños).\n- Productos llegados sin flyer. Meta: 0 (propuesta).\n- Piezas del Plan de Contenido de la semana entregadas. Meta: todas (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Marketing confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_DISENADOR: Semilla = {
  codigo: "TU-DIS-01",
  titulo: "Tutorial del panel: Diseñador",
  area: "Marketing",
  version: "0.1",
  tipo: "tutorial",
  roles: ["diseñador"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina del Diseñador) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de Productos.\n- El catálogo de diseños es del equipo: todos ven lo que sube cada uno.\n- Algunas opciones salen solo según tu sede: Productos (Valencia) y Packing List (Valencia y Caracas).\n- Puedes reordenar tu menú con «Editar orden del menú».",
    responsables: [],
    definiciones: [
      { termino: "KPI de Diseños", definicion: "El catálogo de diseños del equipo y su conteo." },
      { termino: "Colección", definicion: "La carpeta de donde vino el diseño." },
      { termino: "Fecha del diseño", definicion: "El día que cuenta para el KPI." },
      { termino: "Flyer", definicion: "Imagen de producto que el vendedor descarga con precio." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/disenador/dashboard",
        "Las marcas y categorías más vendidas de tu sede en los últimos 3 meses, en unidades o en monto. Haz clic en una para ver sus productos.",
      ),
      PASO(
        "KPI de Diseños",
        "Menú › KPI de Diseños",
        "/disenador/disenos",
        "El catálogo de diseños y su conteo.\n- Arriba: subidos hoy, esta semana, este mes y total, y el calendario del mes (arrastra un diseño a otro día para cambiar su fecha).\n- \"Subir archivos\" o \"Subir carpeta completa\": elige categoría y fecha, revisa títulos y \"Guardar N diseños\".\n- Busca o filtra por categoría y colección; en cada diseño: descargar, editar o mover a la papelera.\n- Selecciona varios para \"Descargar ZIP\". Pestaña Papelera para restaurar o eliminar definitivamente.",
      ),
      PASO(
        "Banco de Flyers",
        "Menú › Banco de Flyers",
        "/disenador/banco-imagenes",
        "- \"Agregar Flyer\": busca el producto por código o categoría, revisa modelo, marca y categoría, sube la imagen y \"Guardar Flyer\".\n- Galería: busca, filtra o elimina un flyer.\n- Abre uno para ponerle precio y descargarlo, o selecciona varios.",
      ),
      PASO(
        "Plan de Contenido",
        "Menú › Plan de Contenido",
        "/disenador/vista-custom",
        "El plan de contenido de cada marca (Supricom, Asta, Bluetti). Trabaja dentro del plan: se guarda solo y el equipo lo ve en vivo. \"Pantalla completa\" y \"Descargar\". Subir un plan nuevo lo hace AdminLeads de Valencia.",
      ),
      PASO(
        "Frecuencia CPM",
        "Menú › Frecuencia CPM",
        "/disenador/frecuencia-cpm",
        "El plan de CPM del mes de cada marca: los productos de cada campaña. Trabaja dentro del plan y guárdalo con su propio botón.",
      ),
      PASO(
        "Editor con IA",
        "Menú › Editor con IA",
        "/disenador/editor-ia",
        "- Sube una imagen o \"Elegir de KPI de Diseños\".\n- Escribe el cambio (\"Mejorar con IA\" lo redacta mejor), elige la proporción y \"Generar con IA\" (hasta un minuto).\n- En el resultado: \"Descargar\" o \"Guardar\" (con su categoría, queda en el catálogo).\n- \"Generaciones recientes\": tus últimas 12.",
      ),
      PASO(
        "Productos (Valencia)",
        "Menú › Productos",
        "/disenador/productos",
        "Todos los productos de Odoo con código, marca, categoría y precio. \"Sin imagen\" muestra los que no tienen foto en Odoo.",
      ),
      PASO(
        "Packing List",
        "Menú › Packing List",
        "/disenador/llegadas",
        "Lo que llegó y lo que va a llegar al almacén de tu sede, en un calendario. Toca un día para ver sus productos o busca un producto para ver cuándo llega.",
      ),
      PASO(
        "Mapa de clientes",
        "Menú › Mapa de clientes",
        "/disenador/mapa-clientes",
        "Cuántos clientes hay en cada estado de tu país, en un mapa 3D (solo cantidades, sin nombres ni montos).\n- Arrastra para girar, clic derecho para mover, Ctrl + rueda para acercar.\n- Toca un estado en la lista para ver sus ciudades. \"Sin ubicar\" son clientes sin estado en Odoo.",
      ),
      PASO(
        "Catálogo",
        "Menú › Catálogo",
        "/disenador/catalogo",
        "Los productos con existencia y precio de Valencia: busca y exporta a Excel.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Tus tareas: \"+ Nueva Actividad\" (título, fecha límite, descripción) y el tablero de pendientes, en curso y culminadas.",
      ),
    ],
    documentos:
      "- Al subir dice que falta la categoría: elige la categoría de todos los diseños del lote.\n- Un diseño cuenta en otro día: cambia su \"Fecha del diseño\" con Editar o arrastrándolo en el calendario.\n- El Plan de Contenido dice que el administrador no ha subido el HTML: pídeselo a AdminLeads de Valencia.\n- El Editor con IA no generó la imagen: lee el motivo que muestra; prueba con otra imagen o un prompt más claro.\n- El mapa dice que tu usuario no tiene sede: pide a soporte que te la asignen.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas del Diseñador." }],
  },
};
