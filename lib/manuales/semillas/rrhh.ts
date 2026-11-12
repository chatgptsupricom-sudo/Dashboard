import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Recursos Humanos (name "recursos humanos" en la tabla
// roles). Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Dirección de RRHH antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_RRHH: Semilla = {
  codigo: "MR-RRH-01",
  titulo: "Manual de Recursos Humanos",
  area: "Recursos Humanos",
  version: "0.1",
  tipo: "manual",
  roles: ["recursos humanos"],
  contenido: {
    objetivo:
      "Que cada cargo que se aprueba se cubra a tiempo con la persona adecuada, que la asistencia del personal se mida con el biométrico y no a mano, que todo nuevo ingreso tenga su rutagrama firmado y que la estructura (organigrama y flujogramas) esté al día.\n\nEste manual es la rutina del rol. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica a Recursos Humanos de Valencia, Caracas y Panamá.\n- Cubre: búsqueda y selección de personal (de la solicitud aprobada al ingreso), asistencia por biométrico, rutagrama de los nuevos ingresos, organigrama y flujogramas, y la lectura de las políticas.\n- No cubre: aprobar las solicitudes de personal (Dirección), la nómina ni los recibos de pago (todavía no están en el panel).\n\nREGLAS DEL ROL\n- H1. Toda búsqueda sale de una Solicitud de personal aprobada: no se abren requisiciones por fuera.\n- H2. Cada candidato queda en la matriz con todas sus fases; nadie se contrata sin pasar por ella.\n- H3. Pausar o cancelar una búsqueda lleva su motivo: lo lee el gerente que pidió el cargo.\n- H4. Las marcas del biométrico de cada sede se cargan cada semana (propuesta), y los sábados de inventario y feriados se registran antes de revisar el reporte.\n- H5. Todo nuevo ingreso tiene su rutagrama firmado antes de terminar su primera semana (propuesta).",
    responsables: [
      { rol: "Recursos Humanos", responsabilidad: "Hace los pasos de este manual. Responde por los tiempos de cobertura y por la asistencia y el rutagrama del personal." },
      { rol: "Gerente que solicita", responsabilidad: "Pide el cargo en Solicitudes de personal y hace la entrevista técnica de los candidatos." },
      { rol: "Dirección (SuperAdmin)", responsabilidad: "Aprueba o rechaza las solicitudes de personal." },
      { rol: "Procesos", responsabilidad: "Mantiene con RRHH el organigrama y los flujogramas, y publica las políticas." },
      { rol: "Trabajador nuevo", responsabilidad: "Llena y firma su rutagrama desde el enlace que le manda RRHH." },
    ],
    definiciones: [
      { termino: "Solicitud de personal (SP)", definicion: "Pedido de un gerente para cubrir un cargo. Al aprobarla la Dirección, nace sola su requisición." },
      { termino: "Requisición (REQ)", definicion: "La búsqueda de un cargo en la matriz de Selección, con sus vacantes y su meta de días (Alta 15, Media 30, Baja 60)." },
      { termino: "Fases", definicion: "Sondeo telefónico, entrevista RRHH, evaluaciones, entrevista técnica (la hace el gerente), referencias, terna, oferta y exámenes médicos." },
      { termino: "Días (SLA)", definicion: "Días calendario desde la fecha de recepción de la requisición hasta la fecha de ingreso." },
      { termino: "Retardo", definicion: "Entrada después de las 08:00 (sin tolerancia). El horario es de lunes a viernes de 08:00 a 16:30, más los sábados de inventario." },
      { termino: "Rutagrama", definicion: "Planilla de la LOPCYMAT (art. 69) con la ruta casa–trabajo del trabajador: un accidente en ese trayecto es accidente de trabajo." },
    ],
    pasos: [
      PASO(
        "Recibir las solicitudes aprobadas",
        "RRHH · todos los días",
        "/solicitudes-personal",
        "- En Solicitudes de personal ves las aprobadas de todas las sedes, ordenadas por urgencia y antigüedad. Te llega un correo cuando se aprueba una.\n- Abre la solicitud para leer el perfil y las funciones, y pulsa \"Abrir REQ-… en Selección\": la requisición ya existe en la matriz.\n- Si RRHH necesita personal propio, crea su solicitud con \"Nueva solicitud\".\n\nCriterio de salida: toda solicitud aprobada tiene su búsqueda en marcha (regla H1).",
      ),
      PASO(
        "Buscar y registrar candidatos",
        "RRHH",
        "/recursos_humanos/seleccion",
        "- En Selección de personal, en la requisición, \"Agregar candidato\": nombre, contacto y fuente (LinkedIn, Computrabajo, referido…).\n- Avanza cada candidato por sus fases en la misma fila: sondeo, entrevista RRHH, evaluaciones. Se guarda solo.\n- Desde que pasa las evaluaciones, el gerente lo ve en su solicitud (sin datos de contacto) y anota su entrevista técnica: aparece en tu matriz.\n- Sigue con referencias, terna, oferta y exámenes médicos (regla H2).\n\nCriterio de salida: cada candidato con su fase al día y su situación clara.",
        "Un candidato que no pasó una fase queda marcado con un triángulo rojo hasta que lo cierres con su estatus final.",
      ),
      PASO(
        "Cerrar la búsqueda",
        "RRHH",
        "/recursos_humanos/seleccion",
        "- Al contratar, pon el estatus final \"Contratado\" con la fecha de ingreso (es obligatoria).\n- Cuando los contratados llegan a las vacantes, la requisición pasa sola a Cubierta y el gerente recibe el aviso.\n- Cierra a los demás candidatos: descalificado o banco de elegibles.\n- Si la búsqueda se detiene, abre la requisición y pásala a En pausa o Cancelada con el motivo (regla H3): el gerente recibe el aviso con el motivo.\n\nCriterio de salida: ninguna requisición cubierta con candidatos todavía \"En proceso\".",
        "Una requisición que nació de una solicitud no se borra: se cancela.",
      ),
      PASO(
        "Revisar los tiempos de cobertura",
        "RRHH · cada semana",
        "/recursos_humanos/seleccion",
        "- En Indicadores de tiempo revisa: requisiciones abiertas fuera de meta, tiempo promedio de cobertura, % cubiertas dentro de la meta, el embudo del proceso y qué fuente da más contratados.\n- En la matriz, el semáforo de cada requisición se pone ámbar al pasar el 80 % de su meta y rojo al pasarla: atiende primero esas.\n- Baja el Excel para el informe a la Dirección.",
      ),
      PASO(
        "Cargar la asistencia",
        "RRHH · cada semana (propuesta)",
        "/recursos_humanos/asistencia",
        "- En Asistencia elige la sede y, en \"Sábados de inventario y feriados\", registra los días que no son normales (regla H4).\n- En \"Cargar Excel\" sube el archivo que exporta el biométrico. El \"Todos los informes\" del ZKTeco de Valencia se reconoce solo; con otro formato, revisa las columnas que propone el panel (código, fecha, horas) antes de cargar.\n- Pulsa \"Cargar en <sede>\". Subir el mismo período otra vez no duplica marcas; si cargaste un archivo equivocado, bórralo en \"Cargas anteriores\".\n\nCriterio de salida: marcas cargadas hasta el último día hábil de la semana.",
      ),
      PASO(
        "Revisar retardos y ausencias",
        "RRHH · cada semana",
        "/recursos_humanos/asistencia",
        "- En Reporte elige el rango y revisa por empleado: días laborables, asistió, retardos, ausencias, salidas antes y días sin marca. Abre a un empleado para ver día por día.\n- \"Solo con incidencias\" deja solo a quien tuvo algo.\n- Confirma con el jefe directo los casos que lo necesiten y baja el Excel.\n- En Empleados corrige nombres y desactiva a quien ya no trabaja.\n\nCriterio de salida: incidencias de la semana revisadas con cada jefe (propuesta).",
        "Los días después de la última marca cargada no se evalúan: no salen como ausencias hasta que cargues ese período.",
      ),
      PASO(
        "Rutagrama de cada nuevo ingreso",
        "RRHH · con cada ingreso",
        "/recursos_humanos/rutagrama",
        "- La primera vez, en \"Sitio de trabajo\" marca en el mapa dónde queda cada sede.\n- Con cada ingreso, \"Nuevo ingreso\": nombre, cédula, sede y cargo, y \"Crear enlace\". Mándale el enlace por WhatsApp.\n- El trabajador lo llena desde su teléfono (sus tramos de ida y regreso y el mapa) y firma.\n- Cuando sale Completado, ábrelo, revisa la ruta e \"Imprimir planilla\" para que estampe sus huellas y archivarla (regla H5).\n- Si se muda, \"Permitir corregir\": el envío anterior queda guardado.\n\nCriterio de salida: ningún ingreso con más de una semana \"Por llenar\".",
      ),
      PASO(
        "Organigrama y flujogramas",
        "RRHH con Procesos · cuando cambia la estructura",
        "/organigrama",
        "- En Organigrama, pestaña \"actual\": con \"Editar\" agrega o mueve cargos, cambia a quién reportan y escribe el propósito y las actividades de cada cargo.\n- El \"propuesto\" es la estructura que se está diseñando, aparte de la actual.\n- Descarga el organigrama en PNG o PDF y las actividades en Excel para los perfiles de cargo.\n- En Flujogramas mantén el diagrama de los procesos de RRHH (captación, reclutamiento y selección).",
      ),
    ],
    documentos:
      "REGISTROS\n- Requisiciones, candidatos, fases y su historial: panel, Selección de personal.\n- Solicitudes de personal y su avance: panel.\n- Marcas del biométrico, cargas, días especiales y empleados: panel, Asistencia.\n- Rutagramas con su mapa, firma y versiones: panel; la planilla impresa con huellas, en el expediente.\n- Organigrama (actual y propuesto) y flujogramas: panel.\n\nINDICADORES\n- Tiempo promedio de cobertura y % de requisiciones cubiertas dentro de la meta.\n- Requisiciones abiertas fuera de meta. Meta: 0.\n- Retardos y ausencias por sede y por empleado.\n- Nuevos ingresos sin rutagrama completado después de una semana. Meta: 0 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección de RRHH confirma lo marcado como propuesta (carga semanal del biométrico, revisión de incidencias con los jefes, rutagrama en la primera semana).",
      },
    ],
  },
};

export const TUTORIAL_RRHH: Semilla = {
  codigo: "TU-RRH-01",
  titulo: "Tutorial del panel: Recursos Humanos",
  area: "Recursos Humanos",
  version: "0.1",
  tipo: "tutorial",
  roles: ["recursos humanos"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Recursos Humanos) está en tu Manual.",
    alcance:
      "- Al entrar llegas a Selección de personal.\n- Ves las tres sedes: en casi todas las pantallas eliges la sede arriba.\n- Selección, Solicitudes de personal, Organigrama y Flujogramas traen su propio recorrido guiado (botón «¿Cómo funciona?»).\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "SP", definicion: "Solicitud de personal de un gerente." },
      { termino: "REQ", definicion: "La búsqueda de ese cargo en la matriz de Selección." },
      { termino: "Meta", definicion: "Días para cubrir el cargo según la urgencia: Alta 15, Media 30, Baja 60." },
      { termino: "Biométrico", definicion: "El equipo que registra las marcas de entrada y salida." },
      { termino: "Rutagrama", definicion: "La ruta casa–trabajo firmada por el trabajador (LOPCYMAT)." },
    ],
    pasos: [
      PASO(
        "Selección de personal",
        "Menú › Selección de personal",
        "/recursos_humanos/seleccion",
        "La matriz de rastreo: una fila por candidato, agrupada por requisición.\n- Filtra por sede, estado de la requisición, año, estatus del candidato o texto.\n- Cada requisición muestra su estado, vacantes, días contra la meta (semáforo) y de qué solicitud viene.\n- \"Agregar candidato\" en la requisición (o el botón \"Candidato\"). Las fases se cambian en la misma fila y se guardan solas.\n- Clic en el nombre: la ficha completa con su historial. Clic en el código de la requisición: editarla, pausarla o cancelarla (con motivo).\n- Pestaña \"Indicadores de tiempo\": cobertura, embudo y efectividad por fuente. \"Excel\" baja todo.",
        "Las requisiciones no se crean aquí: nacen de una solicitud aprobada.",
      ),
      PASO(
        "Solicitudes de personal",
        "Menú › Solicitudes de personal",
        "/solicitudes-personal",
        "Las solicitudes aprobadas de todas las sedes, por urgencia y antigüedad, y las que pidas tú.\n- Filtra por estado, urgencia, sede o área.\n- Abre una para ver el perfil, quién la pidió y aprobó, su avance y \"Abrir REQ-… en Selección\".\n- \"Nueva solicitud\" para pedir personal para RRHH (la aprueba la Dirección).",
      ),
      PASO(
        "Asistencia",
        "Menú › Asistencia",
        "/recursos_humanos/asistencia",
        "Retardos y ausencias a partir del biométrico. Elige la sede arriba.\n- \"Cargar Excel\": sube el archivo del biométrico, revisa las columnas y \"Cargar en <sede>\". \"Cargas anteriores\" deja deshacer una carga.\n- \"Sábados de inventario y feriados\": los días que no son normales.\n- \"Reporte\": por empleado o por día, con retardos, ausencias, salidas antes y días sin marca; abre a un empleado para verlo día por día. Excel.\n- \"Empleados\": corrige nombres y marca quién está activo.",
      ),
      PASO(
        "Rutagrama",
        "Menú › Rutagrama",
        "/recursos_humanos/rutagrama",
        "La ruta casa–trabajo de los nuevos ingresos.\n- \"Sitio de trabajo\": marca en el mapa dónde queda cada sede.\n- \"Nuevo ingreso\": datos del trabajador y \"Crear enlace\"; cópialo o \"Enviar por WhatsApp\".\n- Filtra por llenar o completados. Clic en uno completado: sus tramos, el mapa y la firma; \"Imprimir planilla\", \"Permitir corregir\" o borrar.",
      ),
      PASO(
        "Organigrama",
        "Menú › Organigrama",
        "/organigrama",
        "La estructura de la empresa: pestañas actual y propuesto.\n- Abre en solo lectura: clic en un cargo para ver su propósito y actividades.\n- \"Editar\": arrastra cargos, doble clic para cambiar nombre y personas, y en el panel del cargo propósito, actividades, \"Reporta a\" y estilo.\n- \"Descargar\": imagen, PDF o actividades en Excel.",
      ),
      PASO(
        "Flujogramas",
        "Menú › Flujogramas",
        "/flujogramas",
        "Los diagramas de los procesos.\n- \"Nuevo flujograma\" o abre uno de la lista.\n- En \"Editar\": agrega actividad, decisión o inicio/fin, \"Conectar\" figuras, ponle SI/NO a las flechas y \"Guardar\".\n- Descarga en PNG o PDF.",
      ),
      PASO(
        "Políticas y Acuerdos",
        "Menú › Políticas y Acuerdos",
        "/politicas",
        "Las políticas vigentes de tu sede. Abre las \"Pendientes de leer\" y pulsa \"Leído y entendido\".",
      ),
    ],
    documentos:
      "- No puedes marcar a alguien como contratado: falta la fecha de ingreso.\n- No puedes borrar una requisición: viene de una solicitud o tiene candidatos; cancélala con su motivo.\n- Un empleado sale ausente en días que sí vino: falta cargar ese período o el día es feriado o sábado de inventario sin registrar.\n- El trabajador no puede abrir su rutagrama: revisa que el enlace esté completo o vuelve a copiarlo.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas de Recursos Humanos." }],
  },
};
