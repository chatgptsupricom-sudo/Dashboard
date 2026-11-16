import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol SuperAdmin (name "superadmin" al compararse en
// minúsculas). Nombres de pantallas y botones del panel a nov-2026. Las
// pantallas que comparte con otros roles se explican en sus tutoriales; aquí
// va lo que solo hace el SuperAdmin: aprobar, configurar, dar accesos y
// supervisar. Lo marcado "(propuesta)" lo confirma la Dirección antes de
// publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_SUPERADMIN: Semilla = {
  codigo: "MR-SAD-01",
  titulo: "Manual del SuperAdmin",
  area: "Dirección",
  version: "0.1",
  tipo: "manual",
  roles: ["superadmin"],
  contenido: {
    objetivo:
      "Que la empresa tenga una sola persona responsable de lo que nadie más puede decidir en el panel: aprobar las compras y el personal, dar y quitar accesos, fijar metas y umbrales, configurar los flujos y vigilar que lo que pasa en el panel y en Odoo esté en orden.\n\nEste manual es la rutina del SuperAdmin. Cómo se usa cada pantalla está en el Tutorial del menú; las pantallas que comparte con otros roles las explica el tutorial de cada rol.",
    alcance:
      "- Aplica a quien tiene el rol SuperAdmin. Ve todo el panel y las tres sedes.\n- Cubre: aprobaciones (órdenes de compra, solicitudes de personal), accesos (usuarios, Agente IA, responsables de notas de crédito, marcas de los gerentes), metas y umbrales (Stoplight, cuotas, metas por marca, Semáforo), supervisión (alertas, Centro de mando, auditorías, calidad de datos de Odoo, uso del Agente IA) y excepciones (recepción, sorteo).\n- No cubre: la operación diaria de cada área, que hace cada rol con su manual. En notas de crédito el SuperAdmin ve y configura, pero no aprueba.\n\nREGLAS DEL ROL\n- S1. Cada aprobación se decide en máximo 2 días hábiles y todo rechazo lleva su motivo: lo lee quien pidió (propuesta).\n- S2. Se da acceso al panel con el rol y la sede del cargo de la persona, y se quita el mismo día en que deja el cargo.\n- S3. Las metas del mes (Stoplight, cuotas, metas por marca) quedan cargadas antes del día 3 (propuesta).\n- S4. Lo que se ve en auditoría o en calidad de datos que no corresponde se asigna a quien debe corregirlo, con fecha.\n- S5. Las excepciones que solo el SuperAdmin puede hacer (saltar frenos de carga en Odoo, corregir una recepción cerrada) se hacen después de revisar en Odoo, nunca a ciegas.",
    responsables: [
      { rol: "SuperAdmin", responsabilidad: "Hace los pasos de este manual y responde por los accesos, las metas y las aprobaciones." },
      { rol: "Gerente de Operaciones", responsabilidad: "También da roles en Usuarios (menos SuperAdmin) y ve la auditoría del panel." },
      { rol: "Compras / Gerentes / RRHH", responsabilidad: "Envían las órdenes de compra y las solicitudes de personal que el SuperAdmin decide." },
      { rol: "Responsables de notas de crédito", responsabilidad: "Preaprueban, aprueban y procesan; el SuperAdmin los asigna por sede." },
      { rol: "Soporte (IT)", responsabilidad: "Atiende las fallas del panel que el SuperAdmin detecta." },
    ],
    definiciones: [
      { termino: "Rol y sede (cids)", definicion: "Lo que una persona ve en el panel y de qué sede. Inteligencia de Negocio y Marketing y Electrodomésticos no llevan sede: ven las tres." },
      { termino: "Meta y peso del Stoplight", definicion: "Meta = el objetivo del KPI en el mes; peso = cuánto cuenta en el puntaje. Se guardan por sede y por mes." },
      { termino: "Flujo de notas de crédito activo", definicion: "Una sede tiene el flujo activo cuando preaprueba, aprueba y hace la nota tienen al menos una persona." },
      { termino: "Consultor / Editor del Agente IA", definicion: "Consultor solo pregunta; Editor además prepara y confirma cambios en Odoo." },
      { termino: "Intercompañía", definicion: "Operaciones entre empresas del grupo. El SuperAdmin las ve; Inteligencia de Negocio no." },
      { termino: "Frenos de carga en Odoo", definicion: "La recepción no se carga si la orden de compra ya recibió algo por fuera del panel o el packing list se repite; solo el SuperAdmin puede cargarla igual." },
    ],
    pasos: [
      PASO(
        "Revisar el día",
        "SuperAdmin · todos los días",
        "/superadmin/alert",
        "- En Alertas (Centro de Control) revisa cada sede: clientes inactivos, facturas por vencer, vendedores sin actividad, caída de productos, mora de más de 30 días, devoluciones, facturas pequeñas y vendedores bajo cuota.\n- En el Centro de mando mira el pulso de la empresa (venta, cobranza, vencido, inventario, RMA, puntualidad) y entra al área que se mueva mal.\n- Lo que requiere acción, asígnalo en Actividades a quien corresponda.",
      ),
      PASO(
        "Aprobar las órdenes de compra",
        "SuperAdmin · todos los días",
        "/superadmin/ordenes-compra",
        "- En Compras › Órdenes de compra, pestaña \"Aprobación del panel\", filtro Pendientes.\n- Abre cada orden: proveedor, sede, líneas, total y notas de Compras.\n- \"Aprobar\": la orden se confirma en Odoo como orden de compra. \"Rechazar\": escribe el motivo; Compras la corrige y la reenvía (regla S1).\n- Revisa la insignia de Odoo: si dice error, lee el motivo (términos de pago, compañía) y corrígelo con Compras.\n\nCriterio de salida: ninguna orden pendiente de más de 2 días hábiles (propuesta).",
        "\"Reabrir a borrador\" no funciona si la orden ya tiene recepción o factura en Odoo.",
      ),
      PASO(
        "Decidir las solicitudes de personal",
        "SuperAdmin · cada semana",
        "/solicitudes-personal",
        "- Solicitudes de personal abre en \"Por aprobar\", con lo urgente y lo más viejo primero.\n- Lee el cargo, el motivo, la urgencia, el perfil y las funciones.\n- \"Aprobar y pasar a RRHH\": nace la requisición en Selección con su meta (Alta 15, Media 30, Baja 60 días). \"Rechazar\": con el motivo, que lee el gerente.\n- Lo que creas tú nace aprobado.",
      ),
      PASO(
        "Dar, cambiar y quitar accesos",
        "SuperAdmin · cuando entra, cambia o sale alguien",
        "/superadmin/usuarios",
        "- En Usuarios, \"Dar Rol Panel\" (o el lápiz de la fila): cuenta de Odoo, sede y rol del cargo (regla S2). Al guardar, la sesión de esa persona se cierra y entra con lo nuevo.\n- Un vendedor queda además en la lista de vendedores; luego asígnale cuota y actívalo en la configuración de leads si atiende leads.\n- Cuando alguien sale, \"Quitar rol\" el mismo día. Si es responsable de notas de crédito, sácalo antes de Notas de crédito › Responsables.\n- Revisa también: acceso al Agente IA (Configuración › Acceso), marcas del Gerente de Marca (Configuración de marcas) y responsables de notas de crédito.",
        "Un vendedor que deja la empresa: además de quitarle el rol, reasigna sus clientes en Odoo y sus leads abiertos.",
      ),
      PASO(
        "Configurar los responsables de notas de crédito",
        "SuperAdmin · cuando cambia el equipo",
        "/notas-credito",
        "- En Notas de crédito › Responsables, por sede, asigna a usuarios del panel en cada paso: RMA (solicita, solo avisos), Preaprueba, Aprueba y Hace la nota de crédito. \"Guardar\" por sede.\n- La sede queda \"Flujo activo\" cuando los tres pasos tienen a alguien.\n- En \"Todo el flujo\" sigue el avance por etapa; en \"NC de Odoo\", las notas del mes y las hechas en Odoo sin solicitud.\n- Las solicitudes de RMA que quedaron fuera del flujo, \"Pasar al flujo\".",
        "El SuperAdmin no aprueba: solo aprueba quien está en el paso Aprueba.",
      ),
      PASO(
        "Fijar las metas del mes",
        "SuperAdmin · al empezar el mes",
        "/superadmin/StoplightReport",
        "- En Stoplight Report, por sede y mes, escribe la META y el PESO de cada KPI (se guarda al salir del campo). Peso vacío = el de siempre; 0 = no cuenta.\n- En Ventas › Cuota revisa y corrige la cuota de cada vendedor (tú no tienes el límite de una vez al mes).\n- En Ventas › Metas por Marca, con una sede elegida, \"Sugerir metas\" o \"Copiar metas\" del mes anterior, ajusta y \"Guardar metas\".\n- En el Semáforo de clientes, pestaña \"Reglas y umbrales\", ajusta los umbrales si hace falta.\n\nCriterio de salida: metas del mes cargadas antes del día 3 (regla S3).",
        "La cuota no valida el número: revísalo antes de guardar.",
      ),
      PASO(
        "Vigilar el panel y Odoo",
        "SuperAdmin · cada semana",
        "/superadmin/auditoria_panel",
        "- Auditoría › Auditoría del Panel: quién creó, editó o borró qué, con los campos que cambiaron.\n- Auditoría de Odoo: los cambios y borrados de las últimas 24 horas.\n- NC y Anuladas: notas de crédito, facturas anuladas y reabiertas con sus alertas (a otro cliente, más que la factura, monto alto, bajó el monto…).\n- Calidad de datos Odoo: lo mal cargado (duplicados, clientes sin RIF o sin vendedor, stock negativo…), cada uno con cómo corregirlo y \"Abrir en Odoo\".\n- Asigna cada hallazgo a quien debe corregirlo (regla S4).",
      ),
      PASO(
        "Supervisar el Agente IA",
        "SuperAdmin · cada semana",
        "/superadmin/agenteia",
        "- En el Agente IA, \"Configuración\":\n  - \"Acceso\": quién usa el agente y con qué nivel (Consultor o Editor).\n  - \"Qué ve cada rol\": sede, \"solo lo suyo\" y áreas de cada rol.\n  - \"Historial de cambios\": los cambios que el agente hizo en Odoo y quién los confirmó.\n  - \"Consumo\": lo que cuesta, por usuario y por conversación.\n  - \"Conversaciones de otros usuarios\": revisa las alertas de uso ajeno a la empresa o sospechoso.\n- Si aparece \"Conectar SQL de Odoo\", autorízalo.",
      ),
      PASO(
        "Resolver las excepciones",
        "SuperAdmin · cuando aparecen",
        "/seguridad/mercancia/recepcion",
        "Solo tú puedes, y solo después de revisar en Odoo (regla S5):\n- Recepción: \"Quitar de la lista\" un packing list recibido por fuera del panel; en una recepción cerrada, \"Corregir cajas en mal estado y fotos\" o \"Agregar producto\"; y, si la carga en Odoo está frenada y ya revisaste, \"Cargar igual\".\n- Despachos: actuar en cualquier etapa y rehacer una firma equivocada.\n- Gerente de Marca › Configuración de marcas: asignar las marcas a cada gerente.\n- Sorteo de clientes: configurar sede, mes y monto por ticket, girar y anular premios.",
      ),
    ],
    documentos:
      "REGISTROS\n- Órdenes de compra y su historial; solicitudes de personal y sus eventos; accesos (Auditoría del Panel); metas y pesos por sede y mes; responsables de notas de crédito; configuración y bitácora del Agente IA: panel.\n- Lo que se corrige en Odoo queda en Odoo; la Auditoría de Odoo lo muestra.\n\nINDICADORES\n- Órdenes de compra y solicitudes de personal pendientes de más de 2 días hábiles. Meta: 0 (propuesta).\n- Personas con acceso que ya no están en la empresa. Meta: 0.\n- Metas del mes cargadas antes del día 3 (propuesta).\n- Hallazgos de Calidad de datos en «Errores». Meta: bajar cada mes.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_SUPERADMIN: Semilla = {
  codigo: "TU-SAD-01",
  titulo: "Tutorial del panel: SuperAdmin",
  area: "Dirección",
  version: "0.1",
  tipo: "tutorial",
  roles: ["superadmin"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver lo que solo el SuperAdmin tiene y cómo está organizado tu menú. Cada paso tiene el botón «Abrir esta pantalla».\n\nLas pantallas de operación (ventas, compras, cobranza, almacén, RMA…) son las mismas que usa cada rol: el tutorial de ese rol las explica en detalle.",
    alcance:
      "- Al entrar llegas al Dashboard.\n- Ves las tres sedes y todo el panel; casi todas las pantallas tienen selector de sede.\n- Tu menú tiene opciones sueltas (Alertas, Dashboard, Centro de mando, Actividades, Stoplight, Usuarios, Inventario, Agente IA, Rutagrama, Políticas) y desplegables por área: Leads, Auditoría, RMA, Seguridad, Almacén, Compras, Ventas, Cuentas por Cobrar, Reportes, Marketing, Administración, IT, Recursos Humanos, Inteligencia de Negocio y Gerente de Marca.\n- Algunas pantallas son de consulta también para ti: Seguridad (RMA), Mantenimiento de Unidades y los módulos contables de Administración.\n- Puedes reordenar tu menú con «Editar orden del menú».",
    responsables: [],
    definiciones: [
      { termino: "Meta / Peso", definicion: "Objetivo del KPI y cuánto cuenta, por sede y mes." },
      { termino: "Flujo activo", definicion: "Sede con alguien en preaprueba, aprueba y hace la nota de crédito." },
      { termino: "Consultor / Editor", definicion: "Niveles de acceso al Agente IA." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/superadmin",
        "Las ventas del mes de la sede que elijas (o de todas): ventas, producto estrella, clientes activos, crecimiento, historial, top vendedores, marcas, productos y top 5 clientes.",
      ),
      PASO(
        "Alertas",
        "Menú › Alertas",
        "/superadmin/alert",
        "El Centro de Control de la sede elegida: clientes inactivos, facturas por vencer, vendedores sin actividad, caída de productos (con Excel), mora de más de 30 días, devoluciones, facturas por debajo de $200 y vendedores bajo cuota. \"Ver detalle\" en cada tarjeta.",
      ),
      PASO(
        "Centro de mando",
        "Menú › Centro de mando",
        "/superadmin/graficas",
        "Las gráficas de todas las áreas, sin intercompañía.\n- Elige sede y mes. Pestañas Resumen, Ventas, Cobranza, Inventario, RMA y RRHH (teclas 1 a 6).\n- Haz clic en una barra para ver qué la compone, nivel por nivel; cada gráfica tiene \"Ver tabla\", \"Ampliar\" y \"Descargar PNG\".\n- Inventario: \"Hoy\" o \"Histórico y movimientos\".\n- R recarga; P (\"Presentar\") la pone en pantalla completa y rota las áreas, para una TV.\n- Trae su propio recorrido (\"¿Cómo funciona?\").",
      ),
      PASO(
        "Usuarios",
        "Menú › Usuarios",
        "/superadmin/usuarios",
        "Quién tiene acceso al panel.\n- Busca y filtra por rol del panel, rol de Odoo y estado.\n- \"Dar Rol Panel\" o el lápiz: cuenta de Odoo, sede y rol; \"Confirmar Acceso\".\n- \"Quitar rol\": la persona deja de entrar y se le cierra la sesión.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/superadmin/StoplightReport",
        "Los KPIs de todas las áreas por sede. Escribe la META y el PESO de cada KPI (se guardan al salir del campo, por sede y mes). Haz clic en un KPI para ver su detalle; en Visitas puedes registrar o borrar visitas.",
      ),
      PASO(
        "Compras › Órdenes de compra",
        "Menú › Compras › Órdenes de compra",
        "/superadmin/ordenes-compra",
        "- \"Todas en Odoo\": las órdenes de compra de Odoo de las tres sedes.\n- \"Aprobación del panel\": las que envía Compras. Filtra Pendientes, abre una y \"Aprobar\" (se confirma en Odoo), \"Rechazar\" con motivo o \"Reabrir a borrador\".\n- La insignia de Odoo dice si la orden quedó en Odoo o si falló.",
      ),
      PASO(
        "Ventas: cuotas y metas",
        "Menú › Ventas",
        "/superadmin/cuota",
        "- Cuota: el avance de cada vendedor; \"Editar Cuota\" sin límite mensual.\n- Metas por Marca: \"Cumplimiento\", \"Asignar metas\" (elige una sede: \"Sugerir metas\", \"Copiar metas\", \"Guardar metas\") y \"Auditoría de datos\".\n- Stock por Marca: cuánto se vendió de lo que hubo de cada marca.\n- Las demás (Reporte Diario, Reporte de Ventas, Reportes Comerciales, Semáforo, Mapa, Spiff) son las de Gerencia de Ventas.",
      ),
      PASO(
        "Semáforo de clientes: reglas y umbrales",
        "Menú › Ventas › Semáforo de clientes",
        "/semaforo-clientes",
        "La cartera de cada sede en verde, amarillo o rojo. Solo tú tienes la pestaña \"Reglas y umbrales\": porcentajes de caída, veces su frecuencia sin comprar, días mínimos, compras mínimas, días como cliente nuevo, el período de la foto semanal y detectar estacionales. \"Guardar umbrales\".",
      ),
      PASO(
        "Auditoría",
        "Menú › Auditoría",
        "/superadmin/auditoria_panel",
        "- Auditoría del Panel: cada cambio en el panel, con lo que cambió.\n- Auditoría de Odoo: cambios y borrados de las últimas 24 horas.\n- NC y Anuladas: notas de crédito, anuladas y reabiertas con sus alertas; Excel.\n- Calidad de datos Odoo: lo mal cargado en Odoo, por prioridad y área, con \"Abrir en Odoo\" para corregirlo.",
      ),
      PASO(
        "Agente IA",
        "Menú › Agente IA",
        "/superadmin/agenteia",
        "Pregunta en lenguaje natural por cualquier área; como SuperAdmin siempre eres Editor (puede preparar cambios en Odoo que tú confirmas).\n- \"Configuración\": Acceso, Qué ve cada rol, Historial de cambios, Consumo y Conversaciones de otros usuarios (con alertas de uso).\n- \"Conectar SQL de Odoo\" si aparece.",
      ),
      PASO(
        "IT › Notas de crédito",
        "Menú › IT › Notas de crédito",
        "/notas-credito",
        "- \"Responsables\": por sede, quién solicita (RMA), preaprueba, aprueba y hace la nota.\n- \"Todo el flujo\": todas las solicitudes por etapa, con filtros.\n- \"NC de Odoo\": las notas del mes en Odoo.\n- \"Pasar al flujo\" en las solicitudes de RMA que quedaron fuera.\n- RMA › Solicitudes de nota de crédito: las de sedes sin flujo activo.",
      ),
      PASO(
        "Recursos Humanos › Solicitudes de personal",
        "Menú › Recursos Humanos",
        "/solicitudes-personal",
        "Abre en \"Por aprobar\": \"Aprobar y pasar a RRHH\" o \"Rechazar\" con motivo. Lo que creas tú nace aprobado. En el mismo desplegable están Selección, Asistencia, Organigrama y Flujogramas (los de RRHH).",
      ),
      PASO(
        "Gerente de Marca › Configuración de marcas",
        "Menú › Gerente de Marca",
        "/gerente_marca/configuracion",
        "Una tarjeta por cada usuario con rol Gerente de Marca: \"Agregar marca de Odoo\", elige \"Toda la marca\" o \"Cómputo Corporativo\" y \"Guardar\". Las demás pantallas del desplegable muestran las marcas de todos los gerentes juntas.",
      ),
      PASO(
        "Marketing › Sorteo de clientes",
        "Menú › Marketing › Sorteo de clientes",
        "/superadmin/sorteo",
        "\"Sorteo activo\": sede, mes de las compras, monto por ticket y título de la landing; \"Guardar\". Pestañas Ruleta (GIRAR, anular un premio o reiniciar) y Participantes.",
      ),
      PASO(
        "Almacén y recepción",
        "Menú › Almacén",
        "/seguridad/mercancia/recepcion",
        "Las pantallas de Almacén con tus poderes extra: descartar packing lists recibidos por fuera, corregir cajas y fotos de una recepción cerrada, agregar un producto y cargar en Odoo aunque esté frenada. Mantenimiento de Unidades es solo consulta.",
      ),
      PASO(
        "Las demás áreas",
        "Menú › desplegables",
        "/inteligencia_negocio/dias-promedio",
        "Leads, RMA, Seguridad, Compras, Cuentas por Cobrar, Reportes, Marketing, Administración, Inteligencia de Negocio y Gerente de Marca son las mismas pantallas de cada rol, con todas las sedes. El tutorial de cada rol las explica.",
      ),
    ],
    documentos:
      "- Al quitar un rol dice que es responsable de notas de crédito: sácalo primero en Notas de crédito › Responsables.\n- Una orden aprobada quedó con error de Odoo: lee el motivo en la insignia y corrígelo con Compras.\n- No puedes asignar metas por marca: elige una sede (no \"todas\").\n- Un peso del Stoplight no quedó guardado: el panel avisa; vuelve a intentarlo o avisa a soporte.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas propias del SuperAdmin." }],
  },
};
