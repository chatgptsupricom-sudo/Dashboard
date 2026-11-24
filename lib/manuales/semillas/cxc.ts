import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Cuentas por Cobrar (name "cuentas por cobrar").
// Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia de Administración antes de publicar.
// Plazos y límites de crédito antes de facturar: MP-VEN-02.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_CXC: Semilla = {
  codigo: "MR-CXC-01",
  titulo: "Manual de Cuentas por Cobrar",
  area: "Cuentas por Cobrar",
  version: "0.1",
  tipo: "manual",
  roles: ["cuentas por cobrar"],
  contenido: {
    objetivo:
      "Que lo que se vende a crédito se cobre a tiempo, que cada pago quede registrado en Odoo contra su factura y que la cartera que se informa a la Gerencia sea la real.\n\nEste manual es la rutina del rol: seguimiento diario de lo que vence, registro de pagos (incluidos los de Binance), cartera incobrable, crédito y reportes del mes. Lo que Cuentas por Cobrar hace antes de facturar (plazos, límites y excepciones de crédito) está en MP-VEN-02. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al personal de Cuentas por Cobrar de Valencia, Caracas y Panamá; cada uno ve su sede.\n- Cubre: cobranza de facturas emitidas, registro de pagos en Odoo, conciliación de comprobantes de Binance, incobrables, seguimiento del crédito, estados de cuenta, referencias comerciales y los indicadores del área.\n- No cubre: asignar plazos y límites antes de vender (MP-VEN-02), la facturación ni la conciliación bancaria (Administración).\n- Sistemas: Odoo (pagos, facturas, cupos) y el panel (seguimiento, reportes, comprobantes, incobrables). El panel no escribe en Odoo: todo pago y todo cambio de cupo se hace en Odoo.\n\nREGLAS DEL ROL\n- C1. Todo pago se registra en Odoo y se aplica a su factura el mismo día en que se confirma (propuesta). Un pago sin aplicar queda fuera de los indicadores.\n- C2. Un pago de Binance se registra con el ID de orden en el Memo del pago.\n- C3. Una factura solo se marca incobrable con una justificación que diga por qué no se va a cobrar.\n- C4. El cupo de un cliente se cambia solo en Odoo y con la aprobación anotada en el chatter de su ficha (MP-VEN-02).\n- C5. Los números que se informan salen del panel o de Odoo, no de hojas aparte.",
    responsables: [
      { rol: "Cuentas por Cobrar", responsabilidad: "Hace los pasos de este manual en su sede. Responde por que los pagos estén registrados y aplicados y por que la cartera informada sea la real." },
      { rol: "Vendedor", responsabilidad: "Es el responsable de cobranza de su cartera: llama a sus clientes cuando Cuentas por Cobrar se lo pide." },
      { rol: "Administración", responsabilidad: "Sube el estado de cuenta de Binance, concilia los comprobantes y aprueba los casos dudosos. Lleva la conciliación bancaria." },
      { rol: "Gerencia", responsabilidad: "Fija las metas de los indicadores del área y revisa cada mes el Stoplight." },
    ],
    definiciones: [
      { termino: "Efectividad de cobranza", definicion: "Lo cobrado en el mes ÷ lo que había que cobrar (lo vencido al empezar el mes + lo que venció en el mes − notas de crédito). Solo crédito." },
      { termino: "Cartera vencida", definicion: "Porcentaje del saldo a crédito que ya pasó su fecha de vencimiento." },
      { termino: "Recuperación de vencidos", definicion: "Lo cobrado en el mes de facturas que ya estaban vencidas el día 1 ÷ lo vencido al inicio." },
      { termino: "DSO (días de cobro)", definicion: "Cuántos días de venta a crédito hay en la calle: cartera a crédito al cierre ÷ ventas a crédito del mes × días del mes." },
      { termino: "Incobrable", definicion: "Factura que no se va a cobrar: las vencidas antes de 2025 (automáticas) y las marcadas a mano con justificación. Salen de los indicadores." },
      { termino: "Cobrado vs. Integración de pagos", definicion: "\"Cobrado\" (Contado/Crédito y Pago de Clientes) cuenta solo lo que entró por banco o caja. Integración de Pagos cuenta toda conciliación: también retenciones, 25 % de IVA y notas de crédito, salvo que se marque \"Excluir impuestos\"." },
      { termino: "Sobregiro", definicion: "Cliente que debe más que su límite de crédito de Odoo en esa sede." },
      { termino: "Pago sin aplicar", definicion: "Pago registrado en Odoo que no se concilió contra una factura (anticipo o saldo a favor)." },
    ],
    pasos: [
      PASO(
        "Empezar el día: lo que vence y lo vencido",
        "Cuentas por Cobrar · todos los días",
        "/cuentas-por-cobrar/alertas",
        "- Abre Alertas CxC: \"Facturas por Vencer\" (próximos 3 días) y \"Facturas Vencidas\" (de más a menos días).\n- Avisa a los clientes que vencen en 3 días y llama o pide al vendedor que llame a los vencidos, empezando por los de más días y más monto.\n- Anota en Odoo, en el chatter de la factura o del cliente, el compromiso de pago (fecha y monto) (propuesta).\n\nCriterio de salida: ningún vencido de tu sede sin un contacto en la semana (propuesta).",
      ),
      PASO(
        "Registrar y aplicar los pagos en Odoo",
        "Cuentas por Cobrar · todos los días",
        "/cuentas-por-cobrar/pago-clientes",
        "- Registra en Odoo cada pago confirmado y aplícalo a su factura (regla C1).\n- En Pago de Clientes revisa los del día:\n  - \"Sin conciliar\": pagos que no se aplicaron a una factura. Aplícalos o confirma con el cliente que es un anticipo.\n  - \"A revisar\": tasa que difiere más de 5 % o equivalente en USD en 0. Corrígelo en Odoo.\n\nCriterio de salida: \"Sin conciliar\" y \"A revisar\" en cero al cerrar el día, salvo anticipos confirmados (propuesta).",
      ),
      PASO(
        "Subir los comprobantes de Binance",
        "Cuentas por Cobrar",
        "/cuentas-por-cobrar/binance",
        "- Guarda cada comprobante con el nombre del cliente (si son varios del mismo cliente: 1-CLIENTE, 2-CLIENTE) en una carpeta con el día de los pagos (ej. 02-10-2026).\n- En Conciliación Binance, \"Cargar comprobantes\": sube la carpeta (\"Carpeta\"), los archivos o el .zip de Google Drive. La IA lee ID de orden, monto, moneda y fecha.\n- Revisa los que dan error: archivo ilegible, de más de 8 MB, o ID de orden ya cargado (si lo cargó otra sede, puede que el cliente haya pasado el mismo comprobante dos veces: avísale a Administración).\n- Administración sube el estado de cuenta y concilia.\n\nCriterio de salida: todos los comprobantes del día cargados.",
      ),
      PASO(
        "Registrar en Odoo los pagos de Binance conciliados",
        "Cuentas por Cobrar",
        "/cuentas-por-cobrar/binance",
        "- En Conciliación Binance, pestaña \"Por registrar en Odoo\": los comprobantes que Administración ya concilió y todavía no están en Odoo.\n- Registra cada pago en Odoo y pon el ID de orden en el Memo (regla C2).\n- Recarga la pantalla: el pago registrado sale de la lista.\n\nCriterio de salida: la lista \"Por registrar en Odoo\" vacía al cerrar la semana (propuesta).",
        "Si el ID no va en el Memo, el panel no lo reconoce y el pago queda en la lista aunque esté registrado.",
      ),
      PASO(
        "Vigilar el crédito y los sobregiros",
        "Cuentas por Cobrar · cada semana",
        "/cuentas-por-cobrar/sobregiro",
        "- En Sobregiro, pestaña Hoy, revisa \"Excedidos\" y \"Al límite (≥ 80 %)\".\n- A un cliente excedido con deuda vencida solo se le vende de contado, salvo excepción aprobada (MP-VEN-02, regla R6). Avisa al vendedor.\n- En Clasificación de Clientes revisa las sugerencias (subir, mantener, bajar o quitar crédito) y llévalas a la revisión mensual de cupos.\n- Si se decide cambiar un cupo, hazlo en Odoo con la aprobación anotada (regla C4). La pestaña Historial de Sobregiro registra el cambio solo.\n\nCriterio de salida: ningún excedido sin que su vendedor lo sepa.",
      ),
      PASO(
        "Marcar o revertir incobrables",
        "Cuentas por Cobrar",
        "/cuentas-por-cobrar/incobrables",
        "- Cuando una factura no se va a cobrar (cliente cerrado, en litigio, sin forma de ubicarlo…), en Incobrables › \"Marcar facturas\" búscala y pulsa \"Marcar incobrable\".\n- Escribe la justificación (obligatoria, mínimo 10 caracteres): por qué no se cobra y quién lo decidió (regla C3).\n- Si el cliente paga después, en \"Registro\" revierte la marca con su motivo.\n- La marca solo vive en el panel: saca la factura de los indicadores, pero en Odoo sigue abierta.\n\nCriterio de salida: toda marca con una justificación que otra persona entienda.",
        "Las facturas vencidas antes de 2025 ya son incobrables automáticas: no hay que marcarlas.",
      ),
      PASO(
        "Atender lo que piden los clientes",
        "Cuentas por Cobrar",
        "/cuentas-por-cobrar/estado-cuenta",
        "- Estado de cuenta: busca al cliente y pulsa \"Descargar Excel\" (sale con el membrete de la sede) para enviárselo.\n- Referencia comercial: elige al cliente, revisa los años de relación y a quién va dirigida, e imprime la carta en PDF.\n- Buscar Facturas: para ubicar una factura por número, cliente o vendedor.\n\nCriterio de salida: el cliente recibe lo que pidió el mismo día (propuesta).",
        "La referencia comercial no comprueba si el cliente paga bien: revísalo en Clasificación de Clientes antes de emitirla.",
      ),
      PASO(
        "Revisar los indicadores y cerrar el mes",
        "Cuentas por Cobrar · cada semana y al cierre",
        "/cuentas-por-cobrar",
        "- Cada semana: en el Dashboard revisa Efectividad, Cartera Vencida, Recuperación y DSO, el Top 10 de deudores vencidos y la cartera por responsable. Pide a cada vendedor que llame a sus vencidos.\n- Al cierre del mes, el panel guarda la foto de la Efectividad el día 1 a las 23:00: los pagos de ese mes tienen que estar registrados en Odoo antes.\n- Lleva a la reunión mensual el Stoplight Report y lo que está en rojo.\n- Para informes: Contado/Crédito (facturado, cobrado y por cobrar), Tiempo de Cobro, Integración de Pago y Facturado detallado, todos con Excel.\n\nCriterio de salida: los pagos del mes registrados antes de la foto de cierre.",
        "Un mes cerrado no cambia aunque después se carguen pagos con fecha de ese mes: por eso los pagos se registran a tiempo.",
      ),
    ],
    documentos:
      "REGISTROS\n- Pagos, aplicación a facturas, cupos y compromisos de pago: Odoo.\n- Comprobantes de Binance y su conciliación: panel, Conciliación Binance.\n- Incobrables marcados y revertidos con su justificación: panel, Incobrables › Registro.\n- Historial de cupos y excesos: panel, Sobregiro › Historial.\n\nINDICADORES (metas en el Stoplight, las fija la Gerencia)\n- Efectividad de cobranza, Cartera vencida, Recuperación de vencidos y DSO.\n- Pagos sin conciliar al cierre del día. Meta: 0, salvo anticipos (propuesta).\n- Comprobantes de Binance conciliados sin registrar en Odoo al cierre de la semana. Meta: 0 (propuesta).\n- Incobrables marcados sin justificación clara. Meta: 0.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia confirma los plazos marcados como propuesta (registro de pagos en el día, contacto semanal de vencidos, Binance al cierre de la semana).",
      },
    ],
  },
};

export const TUTORIAL_CXC: Semilla = {
  codigo: "TU-CXC-01",
  titulo: "Tutorial del panel: Cuentas por Cobrar",
  area: "Cuentas por Cobrar",
  version: "0.1",
  tipo: "tutorial",
  roles: ["cuentas por cobrar"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Cuentas por Cobrar) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de Cuentas por Cobrar.\n- Ves tu sede; el selector de sede solo aparece si tu usuario no tiene una asignada.\n- Casi todo se lee de Odoo en vivo y el panel no escribe en Odoo: los pagos y los cupos se registran allá.\n- Lo único que guardas en el panel: comprobantes de Binance, incobrables y el «Leído y entendido» de las políticas.\n- Fuera de los indicadores quedan las empresas del grupo (Supricom), SUPER TECHNO LLC, el contado y los incobrables.\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "Efectividad", definicion: "Cuánto se cobró de lo que había que cobrar en el mes." },
      { termino: "Cartera vencida", definicion: "Lo que ya pasó su fecha de pago." },
      { termino: "DSO", definicion: "Días de venta a crédito que están por cobrar." },
      { termino: "Incobrable", definicion: "Factura que no se va a cobrar y sale de los indicadores." },
      { termino: "Sobregiro", definicion: "Cliente que debe más que su límite de crédito." },
      { termino: "Con o sin IVA", definicion: "Lo facturado va sin IVA; lo que se debe (saldos, cartera) va con IVA." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/cuentas-por-cobrar",
        "El tablero del mes.\n- Elige mes y año (y sede, si te deja) y pulsa \"Actualizar\".\n- Tarjetas en semáforo: Efectividad Cobranza, Cartera Vencida, Recuperación Vencidos, DSO e Incobrables. Haz clic en una para ver su detalle por cliente y factura.\n- Resumen Cartera, Antigüedad de Cartera por tramos de días, Top 10 Deudores Vencidos y Cartera por Responsable de Cobranza.\n- Haz clic en un vendedor para ver sus facturas y en una factura para ver su detalle y sus pagos.\n- \"Excel (todos)\" baja todos los deudores vencidos.",
        "Los datos pueden tener hasta 10 minutos. Un mes cerrado muestra la foto que se guardó al cierre.",
      ),
      PASO(
        "Alertas CxC",
        "Menú › Alertas CxC",
        "/cuentas-por-cobrar/alertas",
        "Tu lista de llamadas del día.\n- \"Facturas por Vencer\": vencen en los próximos 3 días.\n- \"Facturas Vencidas\": de más a menos días de atraso.\n- Haz clic en la tarjeta para ver la lista y en una factura para ver su detalle, sus productos y sus pagos.\n- Se actualiza sola cada 5 minutos.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/cuentas-por-cobrar/StoplightReport",
        "Los 4 indicadores del área en semáforo, con su meta y su peso.\n- Pestañas Resumen, Semanal, Mensual, Trimestral y Anual para ver cómo vienen.\n- Haz clic en un indicador para ver su detalle.\n- Es del mes actual y de tu sede; las metas las fija la Gerencia.",
      ),
      PASO(
        "Contado/Crédito",
        "Menú › Contado/Crédito",
        "/cuentas-por-cobrar/contado-credito",
        "Qué parte es de contado y qué parte a crédito.\n- Modos: Facturado (sin IVA), Cobrado y Por cobrar (con IVA).\n- Filtra por mes o rango, vendedor, banco (en Cobrado) o cliente.\n- \"Excluir no vendedores\" y, en Cobrado, \"Excluir impuestos\" (retenciones, 25 % de IVA, IGTF e ISLR).\n- Verás la distribución del crédito por plazo y, en Cobrado, lo cobrado por banco. Haz clic para bajar a clientes y facturas.\n- \"Excel\" y \"Excel con el detalle\".",
        "Cobrado tarda 15 a 20 segundos en cargar.",
      ),
      PASO(
        "Pago de Clientes",
        "Menú › Pago de Clientes",
        "/cuentas-por-cobrar/pago-clientes",
        "Los pagos registrados en Odoo, en bolívares y en dólares.\n- Filtra por fecha de confirmación (por defecto, el mes), fecha de pago, estado, vendedor, banco o texto.\n- Tarjetas: cobros, total en USD y en Bs, \"Sin conciliar\" (pagos no aplicados a una factura) y \"A revisar\" (tasa o equivalente en USD dudosos). Haz clic para filtrarlos.\n- Haz clic en un pago para ver su ficha como en Odoo, con el adjunto.\n- \"Exportar a Excel\".",
      ),
      PASO(
        "Integración de Pago",
        "Menú › Integración de Pago",
        "/cuentas-por-cobrar/integraciondepago",
        "La copia del reporte de Odoo \"Integración de Pagos\": todo lo que se concilió contra facturas de cliente (banco, caja, retenciones, 25 % de IVA, notas de crédito).\n- Filtra por fecha de aplicación o de pago, mes o rango, vendedor o texto.\n- \"Excluir impuestos\" deja solo los cobros.\n- \"Exportar Excel\" baja todo lo filtrado.",
      ),
      PASO(
        "Conciliación Binance",
        "Menú › Conciliación Binance",
        "/cuentas-por-cobrar/binance",
        "Donde subes los comprobantes de Binance de los clientes.\n- Elige la semana.\n- \"Cargar comprobantes\": \"Subir comprobantes\" (fotos, PDF o .zip de Drive) o \"Carpeta\". El nombre del archivo es el cliente y la carpeta, el día de los pagos. Abajo a la izquierda ves el avance y los errores.\n- La tabla muestra el estado de cada uno (conciliado, por monto, monto distinto, no está en Binance…). La papelera quita uno.\n- \"Por registrar en Odoo\": los conciliados que faltan en Odoo, con su comprobante y la línea del estado de cuenta. Regístralos en Odoo con el ID de orden en el Memo.",
        "El estado de cuenta, la conciliación a mano y el Excel son de Administración.",
      ),
      PASO(
        "Estado de Cuentas",
        "Menú › Estado de Cuentas",
        "/cuentas-por-cobrar/estado-cuenta",
        "El estado de cuenta de cada cliente.\n- Busca por cliente o vendedor (con 3 letras también encuentra clientes sin saldo).\n- Al abrir uno: cargos, abonos y saldo corrido con los días de atraso.\n- \"Descargar Excel\" lo baja con el membrete de la sede para enviarlo al cliente.",
        "Los movimientos marcados en Odoo con \"Excluir seguimiento\" salen en gris y no suman.",
      ),
      PASO(
        "Buscar Facturas",
        "Menú › Buscar Facturas",
        "/cuentas-por-cobrar/buscar",
        "Para encontrar cualquier factura.\n- Escribe número, cliente o vendedor: busca en lo que sigue abierto.\n- O elige un rango de fechas y pulsa \"Aplicar\": lista todas las facturas y notas de crédito del rango, pagadas o no.\n- Haz clic en una factura para ver su detalle. \"Exportar Excel\".",
      ),
      PASO(
        "Top Clientes / Vendedor",
        "Menú › Top Clientes / Vendedor",
        "/cuentas-por-cobrar/top-clientes-vendedor",
        "La cartera agrupada por vendedor.\n- Cada vendedor con su cartera y su vencido (en rojo si pasa del 20 %).\n- Despliégalo para ver sus clientes y haz clic en uno para ver lo que debe, sus días de crédito y sus facturas.",
        "Incluye contado y cartera vieja, por eso no cuadra con el Dashboard.",
      ),
      PASO(
        "Sobregiro",
        "Menú › Sobregiro",
        "/cuentas-por-cobrar/sobregiro",
        "Los clientes que pasan su límite de crédito o están cerca.\n- Pestaña Hoy: tarjetas Excedidos, Al límite (≥ 80 %), Uso del crédito total y Deben sin límite asignado (haz clic para filtrar). Tabla con límite, usado, disponible, vencido y días.\n- Pestaña Historial: elige un rango y verás cuántas veces se pasó cada cliente, los cambios de cupo (quién y cuándo, según Odoo) y el cupo de cualquier día.\n- \"Excel\" en las dos.",
        "El historial existe desde que el panel empezó a guardar fotos cada hora: lo anterior no está.",
      ),
      PASO(
        "Clasificación de Clientes",
        "Menú › Clasificación de Clientes",
        "/cuentas-por-cobrar/clasificacion-clientes",
        "Quién paga bien y quién mal.\n- Elige el período (3, 6, 12 o 24 meses).\n- \"Mejor récord de pago\" y \"Con más retrasos\", con días de atraso promedio, uso del cupo y una sugerencia: subir, mantener, bajar o quitar crédito.\n- Las sugerencias son informativas: el cupo se cambia en Odoo.",
      ),
      PASO(
        "Tiempo de Cobro",
        "Menú › Tiempo de Cobro",
        "/cuentas-por-cobrar/tiempo-cobro",
        "Cuántos días tardan en pagar, de la emisión al pago completo.\n- Elige tipo (crédito, contado o todas) y período.\n- Tarjetas: cuánto tardan, la factura típica, el porcentaje pagado a tiempo y lo pagado.\n- Gráfico por días y tablas por cliente, por vendedor y por zona; haz clic para ver las facturas.\n- \"Exportar todo\" o el Excel de cada tabla.",
      ),
      PASO(
        "Incobrables",
        "Menú › Incobrables",
        "/cuentas-por-cobrar/incobrables",
        "Las facturas que no se van a cobrar.\n- \"Todos los incobrables\": las automáticas (vencidas antes de 2025) y las marcadas a mano.\n- \"Marcar facturas\": busca la factura (3 letras o más), \"Marcar incobrable\" y escribe la justificación.\n- \"Registro\": todas las marcas con quién y por qué; desde ahí se revierte una, con su motivo.\n- Excel en \"Todos los incobrables\" y en \"Registro\".",
        "Marcar no toca Odoo: la factura sigue abierta allá.",
      ),
      PASO(
        "Facturado detallado",
        "Menú › Facturado detallado",
        "/cuentas-por-cobrar/facturado-detallado",
        "El reporte \"Facturación de Productos\" de Odoo, pero de cualquier mes.\n- Elige el mes; busca o filtra por marca, vendedor o zona.\n- Una fila por producto facturado, con cliente, precio y total en USD.\n- Botón Excel.",
      ),
      PASO(
        "Referencia Comercial",
        "Menú › Referencia Comercial",
        "/cuentas-por-cobrar/referencia-comercial",
        "Para emitir la carta de referencia comercial.\n- Elige al cliente: los años de relación salen solos desde su primera factura.\n- Elige a quién va dirigida.\n- Revisa la vista previa y pulsa \"Imprimir / Descargar PDF\".\n- No se guarda nada.",
      ),
      PASO(
        "Políticas y Acuerdos",
        "Menú › Políticas y Acuerdos",
        "/politicas",
        "Las políticas, acuerdos y circulares vigentes de tu sede.\n- \"Pendientes de leer\" muestra las que te faltan: ábrelas y pulsa \"Leído y entendido\".\n- En \"Formatos para llenar\" está la carta de autorización general de envío: busca al cliente, llena el resto e imprímela o bájala en Word.",
      ),
    ],
    documentos:
      "- Un número no cuadra entre pantallas: el Dashboard deja fuera contado, incobrables, Supricom y SUPER TECHNO; Top Clientes y Estado de Cuentas no. Lo facturado va sin IVA; lo que se debe, con IVA.\n- Un pago de Binance sigue en \"Por registrar en Odoo\" después de registrarlo: revisa que el ID de orden esté en el Memo del pago.\n- La pestaña \"Por registrar en Odoo\" da error: Odoo no respondió, vuelve a intentar en unos minutos.\n- Un mes cerrado no cambia después de cargar un pago atrasado: es la foto de cierre.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Cuentas por Cobrar." }],
  },
};
