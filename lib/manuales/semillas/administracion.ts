import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Administración (name "administración" en la tabla roles).
// Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia antes de publicar. Las pantallas de
// Cuentas por Cobrar que también ve este rol están en TU-CXC-01.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_ADMINISTRACION: Semilla = {
  codigo: "MR-ADM-01",
  titulo: "Manual de Administración",
  area: "Administración",
  version: "0.1",
  tipo: "manual",
  roles: ["administración"],
  contenido: {
    objetivo:
      "Que la contabilidad de cada sede esté al día y conciliada, que se pague a tiempo a los proveedores, que lo fiscal se declare completo y que la Gerencia vea en el Índice de Salud Administrativa la situación real de la sede.\n\nEste manual es la rutina del rol: seguimiento de las alertas, gastos contra presupuesto, cuentas por pagar, tesorería, conciliaciones (bancos, Binance y pagos entre sedes), fiscal y cierre del mes. Cómo se usa cada pantalla está en el Tutorial del menú. Las pantallas de Cuentas por Cobrar que también ves están en el manual y el tutorial de ese rol.",
    alcance:
      "- Aplica al personal de Administración de Valencia, Caracas y Panamá. Cada usuario ve solo su sede; un usuario sin sede asignada no ve nada (pide a soporte que se la asignen).\n- Cubre: Índice de Salud Administrativa y sus alertas, presupuesto de gastos, cuentas por pagar, tesorería, conciliación bancaria, conciliación de Binance, pagos entre sedes, fiscal, cierre contable y solicitudes de personal del área.\n- No cubre: la cobranza día a día (Cuentas por Cobrar), la facturación de ventas ni las compras.\n- Sistemas: Odoo (donde se registra, concilia, declara y cierra) y el panel (donde se mide y se cruza). El panel solo lee Odoo: toda corrección se hace en Odoo.\n\nREGLAS DEL ROL\n- D1. Toda alerta del Top 10 tiene responsable, fecha de compromiso y estatus al día.\n- D2. Las facturas de proveedor se cargan y publican en Odoo a más tardar 3 días después de recibidas (propuesta).\n- D3. Todo cobro y pago queda conciliado con su extracto; las cuentas puente y R/P terminan el mes en cero.\n- D4. Las retenciones se confirman en el mes en que se hacen: una retención en borrador no sale en la declaración.\n- D5. El mes se cierra con la checklist de Contabilidad y cierre en verde y el período bloqueado en Odoo.",
    responsables: [
      { rol: "Administración", responsabilidad: "Hace los pasos de este manual en su sede y responde por que los números del Índice sean los reales." },
      { rol: "Cuentas por Cobrar", responsabilidad: "Sube los comprobantes de Binance de los clientes y registra en Odoo los pagos que Administración concilió." },
      { rol: "Compras", responsabilidad: "Entrega las facturas de proveedor y crea las órdenes de compra." },
      { rol: "SuperAdmin", responsabilidad: "Aprueba las solicitudes de personal y revisa el Índice de todas las sedes." },
    ],
    definiciones: [
      { termino: "Índice de Salud Administrativa", definicion: "Puntaje de 0 a 100 de la sede en el mes, en seis áreas (CxC, Tesorería, CxP, Gastos y Presupuesto, Gestión Administrativa, Cumplimiento y Control). Los indicadores sin datos no cuentan en contra: el índice es puntos ÷ puntos evaluables." },
      { termino: "Top 10 Alertas", definicion: "Los indicadores en rojo o amarillo más graves. No se guardan: se recalculan en cada carga. Solo se guarda su seguimiento (compromiso y estatus) por mes." },
      { termino: "Saldo en libros", definicion: "Lo de la cuenta del banco más sus Recibos/Pagos Pendientes (R/P): un cobro o pago queda en R/P hasta que se concilia con el extracto." },
      { termino: "Cuentas puente", definicion: "Transitorias y depósitos por identificar. Deberían quedar en cero al cierre." },
      { termino: "Intercompañía", definicion: "Operaciones entre empresas del grupo (Supricom, Office Solutions Center, Ofimaster). Quedan fuera de la deuda con proveedores y de la cartera del Índice." },
      { termino: "Conciliado / solo por monto", definicion: "En las conciliaciones, conciliado = el panel encontró el pago por referencia o por monto y hora; \"solo por monto\" = coincide el monto pero hay que revisarlo." },
    ],
    pasos: [
      PASO(
        "Revisar el Índice y las alertas",
        "Administración · todos los días",
        "/administracion",
        "- Abre Salud Administrativa y revisa el índice y el Top 10 Alertas.\n- Haz clic en el título de cada alerta para ver de dónde sale y los registros de Odoo que la componen, con su enlace.\n- Para cada alerta pon la fecha de compromiso y el estatus (Abierta, En proceso, Cerrada). Se guarda solo (regla D1).\n- Corrige en Odoo lo que la causa; la alerta se va sola cuando el indicador vuelve a verde.\n\nCriterio de salida: ninguna alerta sin compromiso y ningún compromiso vencido sin explicación.",
        "Si el aviso dice que Odoo no respondió, no es que falte algo: reintenta en unos minutos.",
      ),
      PASO(
        "Cargar el presupuesto y vigilar el gasto",
        "Administración · al empezar el mes",
        "/administracion/gastos",
        "- En Gastos y Presupuesto baja la \"Plantilla presupuesto\" del mes, llena PRESUPUESTO por cuenta y súbela con \"Cargar presupuesto\" (una celda vacía no toca la cuenta; un 0 sí).\n- Sin presupuesto, 3 de los 5 indicadores del área no se pueden calcular.\n- Durante el mes revisa el \"Detalle por cuenta contable\": las cuentas en rojo pasan más de 10 % su presupuesto. Abre la cuenta para ver los gastos que la componen.\n\nCriterio de salida: presupuesto del mes cargado antes del día 5 (propuesta).",
      ),
      PASO(
        "Cuentas por pagar: cargar, programar y pagar",
        "Administración · cada semana",
        "/administracion/cuentas-por-pagar",
        "- Pestaña \"En borrador\": las facturas de proveedor cargadas sin publicar. Publícalas en Odoo (regla D2); en rojo las de más de 3 días.\n- \"Calendario de pagos\": lo que vence en las próximas 8 semanas, para programar los pagos.\n- \"Por proveedor\" y \"Documentos\" (filtro \"Solo vencidos\"): lo vencido.\n- Revisa el aviso de pagos sin aplicar: aplica en Odoo cada pago o anticipo a su factura.\n- Revisa el aviso de facturas sin condiciones de pago y corrígelas en Odoo.\n\nCriterio de salida: ningún borrador de más de 3 días y lo vencido con fecha de pago.",
      ),
      PASO(
        "Tesorería: disponible, tasa y extractos",
        "Administración · todos los días",
        "/administracion/tesoreria",
        "- Revisa el Disponible por banco y caja y la proyección de 4 semanas.\n- Revisa que la tasa BCV de Odoo sea la de hoy (Valencia y Caracas); si el aviso dice que es vieja, cárgala en Odoo.\n- Si sale el aviso de asientos en bolívares registrados a tasa 1, corrígelos en Odoo.\n- En la columna Extracto, los bancos en rojo no tienen extracto en los últimos 7 días: cárgalo y concilia.\n- Las cuentas puente y las retenciones van aparte: las puente deben quedar en cero.\n\nCriterio de salida: tasa del día cargada y ningún banco sin extracto de más de 7 días.",
        "Una cuenta en negativo: en Salud Administrativa, el detalle de Disponibilidad bancaria dice por qué y qué asientos la dejaron así.",
      ),
      PASO(
        "Conciliar los bancos",
        "Administración · cada semana",
        "/administracion/bancos",
        "- En Conciliación bancaria elige la cuenta y la semana.\n- \"Subir estado de cuenta\": Excel, CSV o el .xls del banco (se leen sin IA) o captura/PDF (con IA). Revisa el aviso si el saldo no cuadra en alguna fila (falta un movimiento).\n- Sube los comprobantes que mandan los clientes (nombre del archivo = cliente; carpeta con el día).\n- Revisa los estados: \"Entró al banco, falta en Odoo\" (registra el cobro en Odoo), \"No está en el banco\" (el dinero no llegó: avísale a CxC) y \"Solo por monto (revisar)\".\n- Amarra a mano lo que el panel no encontró y revisa el aviso de cobros \"En Odoo y no en el banco\".\n\nCriterio de salida: la semana sin \"falta en Odoo\" ni cobros en Odoo que no estén en el banco.",
        "El panel no concilia en Odoo: la conciliación del extracto se hace allá.",
      ),
      PASO(
        "Conciliar Binance",
        "Administración · cada semana",
        "/administracion/binance",
        "- En Conciliación Binance elige la semana. CxC ya subió los comprobantes de los clientes.\n- Pestaña \"Estado de cuenta\": sube las capturas o el PDF de los movimientos de Binance Pay (es uno para las tres sedes).\n- Revisa los comprobantes \"Coincide solo por monto (revisar)\" y \"Cliente distinto del pagador (por aprobar)\": si corresponde, \"Aprobar\".\n- Los de monto repetido que no se amarraron solos, amárralos a mano a su pago.\n- \"Monto distinto\" y \"No está en Binance\": averigua con CxC y el cliente.\n- En Salidas, haz lo mismo con los pagos que hace la empresa.\n- \"Imprimir conciliados\" para archivar los comprobantes firmados y \"Excel\" para el reporte.\n\nCriterio de salida: la semana sin comprobantes por revisar o por aprobar. Luego CxC los registra en Odoo.",
      ),
      PASO(
        "Aplicar los pagos entre sedes",
        "Administración · cada semana",
        "/administracion/intercompania",
        "- En Pagos entre sedes, pestaña \"Por hacer\": los pagos que otra sede le hizo a la tuya y todavía no aplicaste.\n- Mira a qué facturas los aplicó la otra sede y, en Odoo, aplica el cobro a tus facturas equivalentes por el monto de \"Aplica\" (\"Copiar facturas\" ayuda).\n- Recarga: el pago pasa a \"Listo en las dos sedes\".\n- \"Factura no encontrada\" y \"Por monto: revisar\": confirma la factura con la otra sede.\n\nCriterio de salida: \"Por hacer\" en cero al cierre del mes (propuesta).",
      ),
      PASO(
        "Fiscal: retenciones, libros e impuestos",
        "Administración · cada quincena y al cierre",
        "/administracion/fiscal",
        "- Pestaña \"Retenciones en borrador\": confírmalas en Odoo (regla D4); en rojo las de más de 5 días.\n- \"Facturas sin retención de IVA\": revisa si el proveedor está exento o falta hacer la retención.\n- Revisa que los libros de compras y ventas del mes estén creados y cerrados (Venezuela) y el IGTF por enterar.\n- Usa \"IVA / ITBMS del mes\" como referencia para cuadrar la declaración (no descuenta retenciones ni excedentes).\n- Baja el Excel para el contador o la declaración.\n\nCriterio de salida: ninguna retención en borrador y los libros cerrados antes de declarar.",
      ),
      PASO(
        "Cerrar el mes",
        "Administración · al cierre",
        "/administracion/contabilidad",
        "- En Contabilidad y cierre, pestaña \"Cierre del mes\": cada punto en verde o pendiente con su contador. Se calcula solo desde Odoo: para ponerlo en verde hay que corregir en Odoo.\n- Puntos: sin asientos en borrador, facturas publicadas, extractos conciliados, R/P y cuentas puente en cero, retenciones confirmadas, libros cerrados, tasa BCV al cierre y período bloqueado.\n- Revisa el estado de resultados y el balance general (aviso rojo si no cuadra).\n- Al terminar, bloquea el período en Odoo (Contabilidad › Configuración › Fechas de bloqueo).\n\nCriterio de salida: checklist completa y período bloqueado antes del día 10 del mes siguiente (propuesta).",
      ),
      PASO(
        "Pedir personal para el área",
        "Administración (gerente del área)",
        "/solicitudes-personal",
        "- En Solicitudes de personal, \"Nueva solicitud\": cargo, área, cantidad, puesto nuevo o reemplazo (a quién), urgencia, perfil y funciones.\n- \"Enviar al SuperAdmin\". Mientras no se decide, puedes editarla o retirarla.\n- Aprobada, ves el avance de la búsqueda de RRHH y, cuando hay candidatos evaluados, anotas tu entrevista técnica (fecha, apto o no apto y tu concepto).\n- Te llega un correo cuando se aprueba, se rechaza, se pausa, se cancela o se cubre.",
      ),
    ],
    documentos:
      "REGISTROS\n- Seguimiento de alertas (compromiso, estatus, quién): panel, Salud Administrativa.\n- Presupuesto de gastos por cuenta: panel, Gastos y Presupuesto.\n- Estados de cuenta, comprobantes y amarres de bancos y Binance: panel, sus conciliaciones.\n- Facturas, pagos, conciliaciones, retenciones, libros y bloqueo del período: Odoo.\n\nINDICADORES\n- Índice de Salud Administrativa de la sede. Meta: 90 o más (\"Excelente\").\n- Alertas del Top 10 sin compromiso o con compromiso vencido. Meta: 0.\n- Facturas de proveedor en borrador con más de 3 días. Meta: 0 (propuesta).\n- Retenciones en borrador con más de 5 días. Meta: 0.\n- Checklist de cierre completa antes del día 10. Meta: todos los meses (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia confirma los plazos marcados como propuesta (facturas en 3 días, presupuesto antes del día 5, pagos entre sedes al cierre, cierre antes del día 10).",
      },
    ],
  },
};

export const TUTORIAL_ADMINISTRACION: Semilla = {
  codigo: "TU-ADM-01",
  titulo: "Tutorial del panel: Administración",
  area: "Administración",
  version: "0.1",
  tipo: "tutorial",
  roles: ["administración"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Administración) está en tu Manual.",
    alcance:
      "- Al entrar llegas a Salud Administrativa.\n- Todo es de tu sede: en vez del selector de sede ves su nombre. Si dice «Sin sede asignada», pide a soporte que te la asignen.\n- Casi todo se lee de Odoo en vivo y el panel no escribe en Odoo: lo que se corrige, se corrige allá. En el panel solo guardas el seguimiento de las alertas, el presupuesto y lo que subes en las conciliaciones.\n- Los montos van en USD; lo que está en bolívares se muestra debajo.\n- Si Odoo no responde, la pantalla lo dice: no es un cero.\n- Además de tus pantallas tienes el desplegable «Cuentas por Cobrar» (lo explica el tutorial de ese rol).",
    responsables: [],
    definiciones: [
      { termino: "Índice", definicion: "Puntaje de 0 a 100 de la salud administrativa de la sede en el mes." },
      { termino: "Alerta", definicion: "Indicador en rojo o amarillo. Se le pone compromiso y estatus." },
      { termino: "R/P", definicion: "Recibos y pagos pendientes de conciliar con el extracto del banco." },
      { termino: "Cuenta puente", definicion: "Transitoria o depósito por identificar: debería estar en cero." },
      { termino: "Intercompañía", definicion: "Operaciones entre empresas del grupo." },
    ],
    pasos: [
      PASO(
        "Salud Administrativa",
        "Menú › Salud Administrativa",
        "/administracion",
        "Tu pantalla de inicio.\n- Arriba, el Índice general de 0 a 100 (Excelente, Atención o Acción inmediata) y el puntaje de cada área.\n- \"Top 10 Alertas\": las más graves. En cada una pon la fecha de \"Compromiso\" y el \"Estatus\"; se guarda solo. Las cerradas bajan al plegable de abajo.\n- Haz clic en el título de una alerta o en el nombre de un indicador: verás de dónde sale, el botón para abrirlo en Odoo y los registros que lo componen, cada uno con su enlace.\n- Más abajo, cada área con sus indicadores, meta, valor y semáforo, y las tarjetas de antigüedad de cartera, disponible por cuenta y mayores deudores.",
        "\"Detectada\" es la primera vez que la alerta se vio abierta en el mes.",
      ),
      PASO(
        "Gastos y Presupuesto",
        "Menú › Gastos y Presupuesto",
        "/administracion/gastos",
        "El gasto del mes contra el presupuesto.\n- Tarjetas: puntaje del área, gasto real, presupuesto y mes anterior.\n- Los 5 indicadores del área.\n- \"Detalle por cuenta contable\": real, presupuesto y variación; haz clic en una cuenta para ver los gastos que la componen.\n- \"Plantilla presupuesto\" baja el Excel para llenar y \"Cargar presupuesto\" lo sube.",
      ),
      PASO(
        "Cuentas por Pagar",
        "Menú › Cuentas por Pagar",
        "/administracion/cuentas-por-pagar",
        "Lo que se le debe a proveedores.\n- Tarjetas: saldo por pagar, vencido, vence en 7 y en 30 días, pagado en el mes.\n- La casilla \"Sin intercompañía\" viene marcada.\n- Pestañas: Por proveedor, Calendario de pagos (8 semanas), Documentos (\"Solo vencidos\"), En borrador y Pagos del mes.\n- \"Ver\" abre la factura con sus líneas, impuestos y pagos aplicados, y el botón \"Abrir en Odoo\".\n- Excel con todo.",
        "El mes solo cambia lo pagado; el saldo es siempre a hoy.",
      ),
      PASO(
        "Tesorería y Bancos",
        "Menú › Tesorería y Bancos",
        "/administracion/tesoreria",
        "El dinero disponible y la caja de las próximas semanas.\n- Tarjetas: disponible (bancos, cajas y lo sin conciliar), cobros y pagos del mes, líneas sin conciliar y tasa BCV.\n- Avisos: tasa vieja, asientos en bolívares a tasa 1, bancos sin extracto.\n- \"Flujo proyectado (4 semanas)\".\n- Tablas de bancos y cajas, retenciones y cuentas puente, con la fecha del último extracto de cada una.\n- Excel con las cuentas y el flujo.",
      ),
      PASO(
        "Conciliación bancaria",
        "Menú › Conciliación bancaria",
        "/administracion/bancos",
        "Cruza el estado de cuenta del banco con los cobros de Odoo y los comprobantes de los clientes.\n- Elige la cuenta y la semana.\n- \"Subir estado de cuenta\" (Excel, CSV, .xls del banco, captura o PDF) y \"Subir comprobantes\" o \"Carpeta\".\n- Tarjetas: comprobantes, conciliados, con problema y entradas sin comprobante; el aviso rojo de cobros en Odoo que no están en el banco.\n- En cada comprobante y cada movimiento puedes amarrar a mano, confirmar o soltar.\n- Clic en la referencia para ver la imagen. Excel con las tres hojas.",
      ),
      PASO(
        "Conciliación Binance",
        "Menú › Conciliación Binance",
        "/administracion/binance",
        "Cruza los comprobantes de Binance con el estado de cuenta.\n- Elige la semana (o \"Todas las semanas\") y Entradas o Salidas.\n- Pestaña \"Estado de cuenta\": \"Subir estado de cuenta\" (capturas o PDF de Binance Pay). \"Borrar\" quita solo lo que subió tu sede.\n- Pestaña \"Comprobantes\": el estado de cada uno; \"Aprobar\" en los que están por revisar o por aprobar, y \"Amarrar a un pago…\" cuando el monto se repite.\n- Tarjeta \"Conciliados\" › \"Imprimir conciliados\": una hoja por comprobante con la firma; después confirmas que salieron bien.\n- \"Excel\" con la imagen de cada comprobante y el recorte de su línea del estado de cuenta.",
      ),
      PASO(
        "Pagos entre sedes",
        "Menú › Pagos entre sedes",
        "/administracion/intercompania",
        "Los pagos de una sede a otra y a qué facturas se aplicaron.\n- Pestañas \"Por hacer\", \"Nos pagaron\" y \"Pagamos\"; filtro por estado y por mes.\n- Cada pago muestra las facturas que aplicó quien pagó y su equivalente en la sede que cobra, con lo que falta aplicar.\n- Aplica en Odoo y recarga: pasa a \"Listo en las dos sedes\".\n- \"Copiar facturas\" y Excel.",
      ),
      PASO(
        "Fiscal",
        "Menú › Fiscal",
        "/administracion/fiscal",
        "Lo que hay que declarar en el mes (SENIAT o DGI).\n- Tarjetas: facturas fiscales de venta, compras fiscales, IGTF, retenciones de IVA e ISLR (o ITBMS en Panamá) y facturas con IVA sin retención.\n- \"IVA / ITBMS del mes\", libros e IGTF, facturas fiscales y clasificación de retenciones.\n- Pestañas: retenciones en borrador, facturas sin retención, retenciones del mes y compras del mes.\n- Excel con todas las hojas.",
        "Una retención en borrador no sale en la declaración: confírmala en Odoo.",
      ),
      PASO(
        "Contabilidad y cierre",
        "Menú › Contabilidad y cierre",
        "/administracion/contabilidad",
        "El cierre del mes y una vista rápida de resultados.\n- Tarjetas: avance del cierre, ingresos, utilidad bruta y utilidad neta.\n- Pestaña \"Cierre del mes\": la checklist, que se calcula sola desde Odoo, con enlaces a la pantalla donde se revisa cada punto.\n- \"Estado de resultados\" (mes, mes anterior y acumulado; clic para ver las cuentas) y \"Balance general\".\n- Excel con las tres hojas.",
      ),
      PASO(
        "Cuentas por Cobrar",
        "Menú › Cuentas por Cobrar (desplegable)",
        "/cuentas-por-cobrar",
        "Todas las pantallas de Cuentas por Cobrar de tu sede: Dashboard, Alertas, Contado/Crédito, Pago de Clientes, Clasificación de Clientes, Tiempo de Cobro, Incobrables, Sobregiro, Facturado detallado, Stoplight, Integración de Pago, Referencia Comercial, Buscar Facturas, Top Clientes / Vendedor y Estado de cuenta.\n- Funcionan igual que para Cuentas por Cobrar: el tutorial de ese rol explica cada una.",
      ),
      PASO(
        "Solicitudes de personal",
        "Menú › Solicitudes de personal",
        "/solicitudes-personal",
        "Para pedir personal para tu área.\n- \"Nueva solicitud\": cargo, área, cantidad, motivo (puesto nuevo o reemplazo), urgencia, perfil y funciones; requisitos y salario son opcionales. \"Enviar al SuperAdmin\".\n- Filtra por estado. Mientras está \"Por aprobar\" puedes editarla o retirarla.\n- Aprobada, ves cómo va la búsqueda y anotas tu entrevista técnica a los candidatos.\n- La pantalla trae su propio recorrido (\"¿Cómo funciona?\").",
      ),
      PASO(
        "Políticas y Acuerdos",
        "Menú › Políticas y Acuerdos",
        "/politicas",
        "Las políticas, acuerdos y circulares vigentes de tu sede.\n- \"Pendientes de leer\": ábrelas y pulsa \"Leído y entendido\".\n- En \"Formatos para llenar\" está la carta de autorización general de envío.",
      ),
    ],
    documentos:
      "- Todo sale vacío o con error de acceso: tu usuario no tiene sede asignada. Pide a soporte que te la asignen.\n- Un indicador no tiene detalle por registro: todavía no tiene fuente en Odoo o se calcula con totales; la fórmula está en la tabla del índice.\n- Un número en rojo que ya corregiste: recarga; si sigue, revisa en Odoo que el cambio esté publicado.\n- Al subir un archivo dice que falta configurar la IA: avisa a soporte (los Excel y CSV del banco se leen igual).\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Administración." }],
  },
};
