import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Gerente de Operaciones (name "Gerente de Operaciones"
// en la tabla roles; se compara en minúsculas). Nombres de pantallas y botones
// del panel a nov-2026. Lo marcado "(propuesta)" lo confirma la Dirección
// antes de publicar. Las pantallas que comparte con otros roles remiten a sus
// tutoriales (TU-GVE-01, TU-CXC-01).

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_GERENTE_OPERACIONES: Semilla = {
  codigo: "MR-GOP-01",
  titulo: "Manual de Gerencia de Operaciones",
  area: "Operaciones",
  version: "0.1",
  tipo: "manual",
  roles: ["gerente de operaciones"],
  contenido: {
    objetivo:
      "Que la operación comercial de la sede funcione completa —leads, ventas, visitas, cobranza y quién tiene acceso a qué en el panel— y que los problemas se vean a tiempo en las alertas y en el Stoplight.\n\nEste manual es la rutina del Gerente de Operaciones. Lo que hace junto con la Gerencia de Ventas (cuotas, visitas, spiff, cartera en riesgo) sigue el Manual de Gerencia de Ventas (MR-GVE-01). Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al Gerente de Operaciones de cada sede. Casi todo se ve de la sede de su usuario; en Leads ve Valencia y Caracas juntas (o Panamá, si es de Panamá).\n- Cubre: alertas del día, accesos al panel (roles y sede de cada usuario), leads (asignación, rotación por estado, vendedores activos, cierres), seguimiento de ventas, cuotas y visitas, spiff, cobranza, auditoría e indicadores.\n- No cubre: la facturación, la cobranza día a día (Cuentas por Cobrar) ni las metas del Stoplight (Dirección).\n\nREGLAS DEL ROL\n- O1. Solo se da acceso al panel con el rol y la sede que corresponden al cargo de la persona; un acceso que ya no corresponde se pide quitar a la Dirección (propuesta).\n- O2. Ningún estado geográfico de la rotación de leads queda sin un vendedor activo: si no, el lead queda sin vendedor.\n- O3. Cuando un vendedor deja de atender leads, se apaga en Configuración de Leads el mismo día y se reasignan sus leads abiertos.\n- O4. Las alertas del Centro de Control se revisan todos los días y lo que requiere acción se asigna como actividad (propuesta).\n- O5. Lo que se ve en Auditoría que no corresponde (un borrado, un cambio sin explicación) se reporta a la Dirección el mismo día.",
    responsables: [
      { rol: "Gerente de Operaciones", responsabilidad: "Hace los pasos de este manual en su sede. Responde por los accesos que otorga y por que los leads lleguen a un vendedor." },
      { rol: "Gerencia de Ventas", responsabilidad: "Lleva al equipo de ventas día a día (MR-GVE-01). Coordina con Operaciones cuotas, visitas y spiff." },
      { rol: "AdminLeads", responsabilidad: "Trabaja el tablero de leads, importa los Excel de campañas y revisa los cierres." },
      { rol: "Cuentas por Cobrar", responsabilidad: "Cobra y registra los pagos (MR-CXC-01)." },
      { rol: "Dirección (SuperAdmin)", responsabilidad: "Da el rol SuperAdmin, quita accesos, fija metas y umbrales." },
    ],
    definiciones: [
      { termino: "Rol del panel", definicion: "Lo que una persona ve y puede hacer en el panel (vendedor, almacén, CxC…). Se asigna en Usuarios junto con su sede." },
      { termino: "Sede (cids)", definicion: "La sede a la que pertenece el usuario: Valencia, Caracas o Panamá. Casi todas las pantallas muestran solo la suya." },
      { termino: "Rotación por estado", definicion: "Qué vendedores reciben los leads de cada estado geográfico. La usa la asignación automática de leads." },
      { termino: "Vendedor activo", definicion: "Vendedor que recibe leads. Uno inactivo deja de recibirlos y no ve Leads ni Cierres." },
      { termino: "Lead de Excel", definicion: "Lead de las campañas de antes del panel, importado desde Excel. Al reasignarlo a un vendedor pasa al tablero del panel." },
      { termino: "Auditoría del panel", definicion: "Registro de cada creación, edición y borrado hecho en el panel, con quién y cuándo." },
    ],
    pasos: [
      PASO(
        "Revisar las alertas del día",
        "Gerente de Operaciones · todos los días",
        "/gerente_operaciones/alert",
        "- Abre Alertas (Centro de Control): clientes inactivos, facturas por vencer en 3 días, vendedores sin actividad, caída de productos, mora de más de 30 días, devoluciones recientes, facturas por debajo de $200 y vendedores por debajo de cuota.\n- Lo que requiere acción, asígnalo en Actividades a quien corresponda, con fecha límite (regla O4).\n- Revisa el Dashboard: ventas del mes, crecimiento y top vendedores.\n\nCriterio de salida: cada alerta con acción tiene su responsable.",
      ),
      PASO(
        "Dar acceso al panel",
        "Gerente de Operaciones · cuando entra o cambia de cargo una persona",
        "/gerente_operaciones/usuarios",
        "- En Usuarios, \"Dar Rol Panel\": elige la cuenta de Odoo de la persona, su sede y el rol que corresponde a su cargo, y \"Confirmar Acceso\" (regla O1).\n- Sirve también para cambiar el rol o la sede de quien ya tiene acceso: su sesión abierta se cierra y entra con lo nuevo.\n- Si el rol es vendedor, queda también en la lista de vendedores.\n- Revisa la tabla después de guardar: si el rol no cambió, no se guardó (la pantalla no muestra el error).\n\nCriterio de salida: la persona entra y ve lo de su cargo y su sede.",
        "No puedes dar el rol SuperAdmin ni tocar a un SuperAdmin. Para quitar un acceso, pídeselo a la Dirección.",
      ),
      PASO(
        "Mantener la asignación de leads",
        "Gerente de Operaciones · cada semana y cuando cambia el equipo",
        "/adminleads/configuracion",
        "- En Leads › Configuración, pestaña \"Vendedores\": deja activos solo los que atienden leads (regla O3).\n- Pestaña \"Estados por vendedor\": revisa que cada estado tenga al menos un vendedor activo (regla O2).\n- Pestaña \"Pipeline\": las etapas del tablero (NUEVO, CONTACTADO y CERRADO no se tocan).\n- Si un vendedor sale, reasigna sus leads abiertos en Monitoreo de leads.\n\nCriterio de salida: ningún estado sin vendedor activo.",
        "Un vendedor que deja la empresa también se reasigna en Odoo (sus clientes) y se apaga aquí.",
      ),
      PASO(
        "Seguir los leads y los cierres",
        "Gerente de Operaciones · cada semana",
        "/adminleads/monitoreo_leads",
        "- En Monitoreo de leads revisa los NUEVOS sin contactar y reasigna los que lo necesiten (columna Vendedor o arrastrando la tarjeta). El vendedor recibe el aviso.\n- Un lead de Excel que se asigna a un vendedor pasa al tablero del panel.\n- En \"Por revisar\" confirma o descarta las ventas que el panel propone.\n- En Cierres revisa los ganados (con monto y factura) y corrige o reabre los que estén mal.\n- En Dashboard Leads revisa la efectividad, el tiempo de contacto y de cierre por vendedor y por canal.\n\nCriterio de salida: ningún lead NUEVO de más de un día sin contacto (propuesta).",
      ),
      PASO(
        "Acompañar a la Gerencia de Ventas",
        "Gerente de Operaciones con Gerencia de Ventas",
        "/gerente_operaciones/reporte-diario",
        "Sigue el Manual de Gerencia de Ventas (MR-GVE-01) en lo que te toca de la sede:\n- Reporte Diario y Reporte de Ventas: la venta del equipo contra la cuota.\n- Cuota: puedes cambiar la cuota de un vendedor (una vez por vendedor en el mes).\n- Planificación de visitas: revisar y marcar las visitas realizadas o no realizadas.\n- Semáforo de clientes: la cartera en riesgo por vendedor.\n- Spiff: las reglas de incentivos de la sede.\n\nCriterio de salida: tú y la Gerencia de Ventas ven los mismos números y acuerdan las acciones.",
      ),
      PASO(
        "Vigilar la cobranza",
        "Gerente de Operaciones · cada semana",
        "/cuentas-por-cobrar",
        "- En el desplegable Cuentas por Cobrar revisa el Dashboard de CxC (efectividad, cartera vencida, top deudores) y Sobregiro (clientes que pasan su límite).\n- Coordina con Cuentas por Cobrar los clientes vencidos más grandes y con la Gerencia de Ventas que sus vendedores llamen.\n\nCriterio de salida: los 10 mayores deudores vencidos tienen una acción acordada.",
      ),
      PASO(
        "Revisar la auditoría",
        "Gerente de Operaciones · cada semana (propuesta)",
        "/gerente_operaciones/auditoria_panel",
        "- Auditoría del Panel: quién creó, editó o borró qué en el panel, con los campos que cambiaron. Filtra por tabla o por acción (por ejemplo, DELETE).\n- Auditoría de Odoo: los cambios y borrados en Odoo de las últimas 24 horas.\n- Lo que no corresponde, repórtalo a la Dirección el mismo día (regla O5).",
      ),
      PASO(
        "Revisar los indicadores",
        "Gerente de Operaciones · cada semana y al cierre",
        "/gerente_operaciones/StoplightReport",
        "- En el Stoplight Report ves todos los grupos (Ventas, Compras, Cuentas por Cobrar y, si hay datos, Cuentas por Pagar y Marketing).\n- Lleva a la reunión con la Dirección lo que está en rojo y el plan para corregirlo.\n- Los reportes Por Vendedor, Por Cliente e Inventario (desplegable Reportes) sirven para el detalle.",
        "Si tu sede no es Valencia, compara Cuentas por Cobrar y Cuentas por Pagar con el Stoplight del desplegable Cuentas por Cobrar, que es de tu sede.",
      ),
    ],
    documentos:
      "REGISTROS\n- Accesos otorgados (rol y sede de cada usuario): panel, Usuarios; cada cambio queda en la Auditoría del Panel.\n- Vendedores activos, pipeline y rotación por estado: panel, Configuración de Leads (con historial).\n- Reasignaciones de leads y cierres: panel, Leads.\n- Cuotas y su historial, reglas de spiff, planes de visitas, actividades asignadas: panel.\n\nINDICADORES\n- Stoplight de la sede (todos los grupos).\n- Estados de la rotación sin vendedor activo. Meta: 0.\n- Leads NUEVOS con más de un día sin contacto. Meta: 0 (propuesta).\n- Alertas del Centro de Control sin responsable al final del día. Meta: 0 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta y quién quita accesos al panel.",
      },
    ],
  },
};

export const TUTORIAL_GERENTE_OPERACIONES: Semilla = {
  codigo: "TU-GOP-01",
  titulo: "Tutorial del panel: Gerencia de Operaciones",
  area: "Operaciones",
  version: "0.1",
  tipo: "tutorial",
  roles: ["gerente de operaciones"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina del Gerente de Operaciones) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de ventas de tu sede.\n- Tu menú tiene opciones sueltas y desplegables: Leads, Ventas, Cuentas por Cobrar, Reportes y Auditoría.\n- Casi todo es de tu sede. En Leads ves Valencia y Caracas juntas (o Panamá si eres de Panamá); Usuarios y las auditorías muestran todas las sedes.\n- Varias pantallas son las mismas de Gerencia de Ventas y de Cuentas por Cobrar: sus tutoriales las explican en detalle.\n- Puedes reordenar tu menú con «Editar orden del menú».",
    responsables: [],
    definiciones: [
      { termino: "Rol del panel", definicion: "Lo que una persona ve y puede hacer en el panel." },
      { termino: "Sede", definicion: "Valencia, Caracas o Panamá: casi todo se ve de la sede de tu usuario." },
      { termino: "Rotación por estado", definicion: "Qué vendedores reciben los leads de cada estado." },
      { termino: "Lead de Excel", definicion: "Lead de campañas viejas importado desde Excel." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/gerente_operaciones",
        "Las ventas de tu sede: ventas del mes, producto estrella, clientes activos, crecimiento, historial de facturación, top vendedores, marcas y productos más y menos vendidos, y top 5 clientes. Elige el mes o un rango de fechas.",
      ),
      PASO(
        "Alertas",
        "Menú › Alertas",
        "/gerente_operaciones/alert",
        "El Centro de Control de tu sede: clientes inactivos, facturas por vencer, vendedores sin actividad, caída de productos (con Excel), mora de más de 30 días, devoluciones recientes, facturas por debajo de $200 y vendedores por debajo de cuota. Se actualiza cada 5 minutos o con \"Actualizar\".",
      ),
      PASO(
        "Usuarios",
        "Menú › Usuarios",
        "/gerente_operaciones/usuarios",
        "Quién tiene acceso al panel.\n- Busca y filtra por rol del panel, rol de Odoo y estado.\n- \"Dar Rol Panel\": elige la cuenta de Odoo, la sede y el rol, y \"Confirmar Acceso\". Sirve también para cambiar el rol o la sede de alguien.",
        "Si al confirmar el modal no se cierra, no se guardó: revisa los datos. El rol SuperAdmin no lo puedes dar.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Las tareas del equipo.\n- \"Asignar\": a cualquier persona de tu sede, con título, fecha límite y descripción.\n- \"Mis Actividades\" (con el selector, las de otra persona de tu sede) y \"Asignadas por Mí\".",
      ),
      PASO(
        "Leads › Dashboard Leads",
        "Menú › Leads › Dashboard Leads",
        "/adminleads",
        "Las métricas de los leads: total, monto, efectividad, cierres, tiempo promedio de contacto y de cierre.\n- Filtra por sede, vendedor, canal y período.\n- Pestañas General, Campañas Meta, Histórico (Excel) y Servicios.\n- \"Exportar Excel\".",
      ),
      PASO(
        "Leads › Monitoreo de leads",
        "Menú › Leads › Monitoreo de leads",
        "/adminleads/monitoreo_leads",
        "El tablero de todos los leads.\n- Pestañas: \"Leads del panel\", \"Leads de Excel\", \"Importar Excel\" y \"Por revisar\".\n- Vista de tabla o de columnas; filtra por empresa, vendedor, sede, estado y estatus.\n- Reasigna el vendedor desde su columna o arrastrando la tarjeta; cierra un lead arrastrándolo a CERRADO.\n- \"+ Nuevo Lead\" en la pestaña del panel.\n- \"Por revisar\": confirma o descarta las ventas que el panel propone.",
        "Un lead cerrado por venta no cambia de vendedor. Un lead de Excel asignado pasa al tablero del panel.",
      ),
      PASO(
        "Leads › Cierres y Recompra",
        "Menú › Leads › Cierres",
        "/adminleads/cierres",
        "- Cierres: los leads cerrados, con filtros por vendedor, canal, fechas y motivo. Puedes editar el cierre (monto, factura, fecha) o reabrir el lead.\n- Recompra de clientes: cuántas veces volvió a comprar cada cliente que llegó por un lead. Trae su propio recorrido.\n- Clientes del mes: quién compró en el período, con sus facturas; puedes elegir sede.",
      ),
      PASO(
        "Leads › Configuración",
        "Menú › Leads › Configuración",
        "/adminleads/configuracion",
        "- \"Pipeline\": las etapas del tablero.\n- \"Vendedores\": activa o desactiva quién recibe leads.\n- \"Estados por vendedor\": qué vendedores reciben los leads de cada estado.\n- \"Servicios\": costos fijos y recargas.",
        "Un estado sin vendedor activo deja sus leads sin vendedor.",
      ),
      PASO(
        "Ventas",
        "Menú › Ventas (desplegable)",
        "/gerente_operaciones/reporte-diario",
        "Las pantallas de ventas de tu sede: Reporte Diario, Reporte de Ventas, Cuota (puedes cambiarla una vez por vendedor en el mes), Semáforo de clientes, Mapa de Clientes (con la ficha de cada cliente) y Spiff (resumen y reglas).\n- Funcionan como en Gerencia de Ventas: su tutorial explica cada una.",
      ),
      PASO(
        "Planificación de visitas",
        "Menú › Planificación de visitas",
        "/gerente_operaciones/planificacion",
        "El plan de visitas de cada asesor de tu sede: elige asesor y semana, revisa o completa el plan, \"Guardar\", y marca cada visita \"Realizada\" o \"No realizada\". \"Resumen del mes\" muestra la cobertura territorial.",
      ),
      PASO(
        "Cuentas por Cobrar",
        "Menú › Cuentas por Cobrar (desplegable)",
        "/cuentas-por-cobrar",
        "Las pantallas de Cuentas por Cobrar de tu sede: Dashboard, Alertas, Contado/Crédito, Pago de Clientes, Clasificación, Tiempo de Cobro, Sobregiro, Facturado detallado, Stoplight, Integración de Pago, Referencia Comercial, Buscar Facturas y Top Clientes / Vendedor.\n- Funcionan igual que para Cuentas por Cobrar: su tutorial explica cada una.",
      ),
      PASO(
        "Reportes",
        "Menú › Reportes (desplegable)",
        "/gerente_operaciones/reports/sellers",
        "- Por Vendedor: lo que debe hacer por día contra lo que hace, y sus productos; \"Iniciar Auditoría Avanzada\" analiza con IA.\n- Por Cliente e Inventario: reportes por fechas de tu sede, en tabla o gráfico.",
      ),
      PASO(
        "Auditoría",
        "Menú › Auditoría (desplegable)",
        "/gerente_operaciones/auditoria_panel",
        "- Auditoría del Panel: cada creación, edición y borrado en el panel, con quién y cuándo; haz clic en una fila para ver los campos que cambiaron.\n- Auditoría de Odoo: los cambios y borrados en Odoo de las últimas 24 horas (\"Sincronizar Logs\" para traerlos).",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/gerente_operaciones/StoplightReport",
        "Todos los indicadores en semáforo: Ventas, Compras, Cuentas por Cobrar y, si hay datos, Cuentas por Pagar y Marketing. Haz clic en un indicador para ver su detalle. Las metas las fija la Dirección.",
      ),
      PASO(
        "Inventario",
        "Menú › Inventario",
        "/gerente_operaciones/inventory",
        "El stock de tu sede por producto y almacén. Busca y filtra por almacén, marca y categoría; \"Bajo Stock\" muestra los de 20 unidades o menos.",
      ),
      PASO(
        "Solicitudes de personal y Políticas",
        "Menú › Solicitudes de personal",
        "/solicitudes-personal",
        "- Solicitudes de personal: pide personal para tu área; la aprueba la Dirección y RRHH busca. Trae su propio recorrido.\n- Políticas y Acuerdos: abre las \"Pendientes de leer\" y pulsa \"Leído y entendido\".",
      ),
    ],
    documentos:
      "- Al dar un rol el modal no se cierra: no se guardó. Revisa la cuenta, la sede y el rol.\n- Un lead no llega a ningún vendedor: su estado no tiene vendedor activo en Configuración.\n- Un número de Cuentas por Cobrar no coincide entre tu Stoplight y el del desplegable: usa el del desplegable, que es de tu sede.\n- Incobrables aparece en el menú pero no carga para tu rol: es de Cuentas por Cobrar y Administración.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Gerencia de Operaciones." }],
  },
};
