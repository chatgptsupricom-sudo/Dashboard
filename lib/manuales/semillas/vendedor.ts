import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Vendedor (name "seller" en la tabla roles).
// Los nombres de botones y pantallas son los del panel a nov-2026. Las reglas
// marcadas "(propuesta)" no las impone el panel: las confirma la Gerencia de
// Ventas antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_VENDEDOR: Semilla = {
  codigo: "MR-VEN-01",
  titulo: "Manual del vendedor",
  area: "Ventas",
  version: "0.1",
  tipo: "manual",
  roles: ["seller"],
  contenido: {
    objetivo:
      "Decir qué le toca hacer al vendedor de SUPRICOM cada día, cada semana y cada mes, en qué orden y con qué reglas, para que ningún lead, pedido ni cliente quede sin atender.\n\nEste manual es la rutina del rol. El detalle de cómo se cotiza y se confirma un pedido en Odoo está en el manual MP-VEN-01 (Ventas: de la cotización al pedido confirmado). Cómo se usa cada pantalla del panel está en el Tutorial del menú.",
    alcance:
      "- Aplica a los vendedores de Valencia, Caracas y Panamá.\n- Cubre: atender los leads asignados y cerrarlos, cotizar y confirmar pedidos, registrar el método de retiro, planificar visitas, cuidar la cartera, seguir los casos de RMA de sus clientes, pedir material de apoyo y revisar sus resultados.\n- No cubre: la facturación, el armado y despacho, la cobranza ni las notas de crédito (cada una tiene su manual y su responsable).\n- Sistemas: Odoo (cotizaciones, pedidos, clientes) y el panel (leads, método de retiro, visitas, cartera, resultados).",
    responsables: [
      { rol: "Vendedor", responsabilidad: "Hace los pasos de este manual con sus clientes y sus leads. Responde por que lo que registra en el panel y en Odoo sea cierto y esté al día." },
      { rol: "AdminLeads", responsabilidad: "Recibe los leads de las campañas y se los asigna o reasigna al vendedor. Aprueba las solicitudes de Material POP (Valencia)." },
      { rol: "Asistente de Ventas", responsabilidad: "Apoya al vendedor: puede registrar el método de retiro de los pedidos de la sede." },
      { rol: "Gerente de Ventas", responsabilidad: "Asigna la cuota, revisa el plan de visitas y marca las visitas realizadas, y revisa cada semana los resultados con cada vendedor." },
      { rol: "Almacén", responsabilidad: "Despacha los pedidos que tienen factura y método de retiro. Avisa al vendedor si falta mercancía." },
    ],
    definiciones: [
      { termino: "Lead", definicion: "Persona o empresa que pidió información por una campaña o canal (redes, web, WhatsApp) y que el panel le asigna a un vendedor. Vive en la pantalla Leads." },
      { termino: "Etapas del lead", definicion: "NUEVO → CONTACTADO → (etapas que configure AdminLeads) → CERRADO. Se avanza una etapa a la vez." },
      { termino: "Cierre", definicion: "Cómo terminó un lead: Cierre ganado (compró, con monto y factura), Ya es cliente o Cierre perdido (con el motivo)." },
      { termino: "Cartera", definicion: "Los clientes que en Odoo tienen al vendedor asignado. Es lo que ve en Clientes y en el Semáforo de clientes." },
      { termino: "Cuota", definicion: "Meta de facturación del mes, sin IVA, que asigna la Gerencia. Se ve en el Dashboard y en el Stoplight." },
      { termino: "Método de retiro", definicion: "Cómo recibe el cliente su pedido: Retiro en sucursal, Por ruta, Encomienda o Transporte externo. Sin él, Almacén no puede despachar." },
      { termino: "Spiff", definicion: "Incentivo por vender marcas o productos con meta. Se ve en la pantalla Spiff." },
      { termino: "Semáforo de clientes", definicion: "Clasificación de cada cliente de la cartera en verde, amarillo o rojo según cómo viene comprando contra su propio historial." },
    ],
    pasos: [
      PASO(
        "Empezar el día: revisar el panel",
        "Vendedor · todos los días",
        "/vendedores",
        "- Abre el Dashboard y mira cómo vas con la Cuota del Mes (\"Faltan $X\" y, en el detalle, cuánto tienes que vender por día hábil).\n- Abre Leads y revisa la columna NUEVO: son los leads que te llegaron y no has contactado.\n- Abre Actividades y revisa lo que tienes pendiente o en curso para hoy.\n- Abre Método de retiro y revisa la tarjeta \"Sin método\": son pedidos tuyos que Almacén no puede despachar.\n\nCriterio de salida: sabes qué leads, pedidos y tareas tienes que atender hoy.",
      ),
      PASO(
        "Contactar cada lead nuevo",
        "Vendedor",
        "/vendedores/leads",
        "- Contacta al lead por teléfono o WhatsApp (el teléfono de la tarjeta abre WhatsApp).\n- Apenas lo contactes, pásalo de NUEVO a CONTACTADO. El panel guarda ese momento como el tiempo de primer contacto.\n- Escribe en \"Observaciones...\" qué pidió y qué acordaron.\n- Plazo: el mismo día hábil en que llega (propuesta, a confirmar por la Gerencia de Ventas).\n\nCriterio de salida: ningún lead tuyo en NUEVO de un día para otro.",
        "Si el lead no es para ti (otra zona, otra sede) avísale a AdminLeads: el vendedor no puede transferir ni borrar leads.",
      ),
      PASO(
        "Avanzar y cerrar el lead",
        "Vendedor",
        "/vendedores/leads",
        "- Mueve el lead etapa por etapa a medida que avanza la negociación. El panel no deja saltar etapas ni cerrar un lead que sigue en NUEVO.\n- Cuando termina, ciérralo con \"Cerrar Lead\":\n  - Cierre ganado: fecha de cierre, monto en USD y número de la factura de Odoo. El panel busca la factura en Odoo y corrige con ella el RIF y el nombre del cliente.\n  - Ya es cliente: si el lead resultó ser un cliente que ya compraba.\n  - Cierre perdido: fecha y motivo (Sin inventario, Cliente final, Sin respuesta del cliente).\n- Si un cliente ganado vuelve a comprar en los 30 días siguientes, regístralo con \"Segunda Compra\".\n- Un lead sin respuesta no se deja abierto: después de 3 intentos en 7 días se cierra como perdido por \"Sin respuesta del cliente\" (propuesta, a confirmar).\n\nCriterio de salida: todo lead que terminó está cerrado con su motivo; los ganados, con su factura.",
        "Un lead cerrado ya no cambia de estado. Revisa bien el número de factura antes de confirmar.",
      ),
      PASO(
        "Cotizar y confirmar el pedido en Odoo",
        "Vendedor",
        "",
        "Se hace en Odoo siguiendo el manual MP-VEN-01 (Ventas: de la cotización al pedido confirmado):\n- Verifica al cliente y su condición de pago antes de cotizar.\n- Cotiza con los precios de la lista; los descuentos van en \"Desc. %\" y dentro de la tabla aprobada.\n- Envía la cotización desde Odoo y dale seguimiento hasta cerrarla.\n- Confirma el pedido solo con la aceptación del cliente por escrito.\n\nCriterio de salida: pedido confirmado en Odoo, completo y con sus aprobaciones anotadas.",
      ),
      PASO(
        "Registrar el método de retiro",
        "Vendedor (o Asistente de Ventas)",
        "/vendedores/metodo-retiro",
        "- El mismo día en que confirmas el pedido, elige cómo lo recibe el cliente: Retiro en sucursal, Por ruta (con la ruta), Encomienda (con la agencia) o Transporte externo (con la compañía y la foto de la autorización firmada por el cliente).\n- Si varios pedidos del mismo cliente salen juntos, márcalos juntos (\"Elegir todos\"): viajan en el mismo despacho y la ruta gratis se calcula con la suma.\n- Ruta gratis: Valencia, 300 $ sin IVA en la ruta Valencia (Carabobo) y 1.000 $ en las demás; Panamá, 200 $ y 2.500 $ para Colón y Chorrera. Si el cliente no llega al monto, acuerda el costo con él antes de registrar.\n\nCriterio de salida: ningún pedido tuyo en \"Sin método\" al final del día.",
        "Cuando el pedido pasa a \"En despacho\" ya no se puede cambiar el método. Si hay que cambiarlo, habla con Almacén.",
      ),
      PASO(
        "Planificar las visitas de la semana",
        "Vendedor · cada viernes para la semana siguiente (propuesta)",
        "/vendedores/planificacion",
        "- En Planificación de visitas, abre la semana siguiente y llena Zona / Ruta y Marcas priorizadas.\n- Agrega al menos 7 visitas en la semana (mañana y tarde de lunes a viernes), cada una con cliente, zona, tema y objetivo. Marca \"Visita foránea\" las que son fuera de tu zona habitual.\n- Pulsa Guardar antes de salir: los puestos sin cliente se borran.\n- La Gerencia marca después cuáles se hicieron; una visita ya marcada no se edita.\n\nCriterio de salida: plan de la semana guardado con 7 visitas o más.",
      ),
      PASO(
        "Cuidar la cartera",
        "Vendedor · cada semana",
        "/semaforo-clientes",
        "- Abre el Semáforo de clientes y revisa primero los rojos y los que empeoraron \"Vs. semana pasada\".\n- Abre cada cliente para ver por qué cambió de color y llámalo o agéndale una visita.\n- Usa Top Clientes para ver qué compra cada cliente y qué dejó de comprar, y Clientes para sus datos de contacto.\n- Anota el contacto en Odoo (nota en la ficha del cliente o una cotización): el panel toma de ahí el \"Último contacto\".\n\nCriterio de salida: ningún cliente en rojo sin un contacto en los últimos 7 días (propuesta, a confirmar).",
      ),
      PASO(
        "Seguir los casos de servicio técnico de tus clientes",
        "Vendedor",
        "/vendedores/casos-rma",
        "- En RMA de mis clientes ves cada caso: en qué etapa está, el diagnóstico y si se pidió nota de crédito.\n- Revisa \"Listos, sin entregar\" y avisa al cliente que puede retirar su equipo.\n- Si el cliente reclama por un equipo, no lo resuelvas por tu cuenta: el caso lo lleva RMA.\n\nCriterio de salida: el cliente sabe en qué va su caso cuando pregunta.",
      ),
      PASO(
        "Usar el material de apoyo",
        "Vendedor",
        "/vendedores/catalogo",
        "- Catálogo: productos con existencia de tu sede, con precio; puedes exportar a Excel los que necesites para mandarle al cliente.\n- Banco de Flyers: descarga los flyers con precio base, con un precio que tú pongas o sin precio.\n- Material POP (solo Valencia): pide material publicitario para un cliente o para uso interno. Lo aprueba AdminLeads y te avisa por correo cuando está aprobado y cuando se entrega. Si ya no lo necesitas, cancélalo para liberar el material.",
        "No mandes precios al cliente sin una cotización de Odoo detrás (MP-VEN-01).",
      ),
      PASO(
        "Revisar tus resultados",
        "Vendedor · cada semana, con el Gerente de Ventas",
        "/vendedores/StoplightReport",
        "- Stoplight Report: tu cumplimiento de cuota, visitas, efectividad de cierre de cotizaciones, activación de cartera, clientes nuevos y cobertura de marcas del mes. Pulsa cada indicador para ver su detalle.\n- Spiff: cuánto llevas ganado por marca y tu posición.\n- Cierres: tu historial de leads cerrados.\n- Lleva a la reunión semanal con el Gerente de Ventas lo que está en rojo y qué vas a hacer.\n\nCriterio de salida: sabes qué indicador está en rojo y tienes un plan para la semana.",
      ),
    ],
    documentos:
      "REGISTROS\n- Leads, etapas, observaciones y cierres: panel, Leads y Cierres.\n- Cotizaciones, pedidos y aprobaciones: Odoo y su chatter.\n- Método de retiro: panel, Método de retiro.\n- Plan de visitas: panel, Planificación de visitas.\n- Solicitudes de Material POP: panel, Material POP.\n\nINDICADORES (el Gerente de Ventas los revisa cada semana)\n- Leads en NUEVO con más de un día. Meta: 0 (propuesta).\n- Leads ganados sin factura o con factura que no está en Odoo. Meta: 0.\n- Pedidos confirmados sin método de retiro después de 24 horas. Meta: 0.\n- Visitas planificadas por semana. Meta: 7 o más.\n- Cumplimiento de cuota del mes (Stoplight).\n- Clientes en rojo en el Semáforo sin contacto en 7 días. Meta: 0 (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Ventas confirma los plazos marcados como propuesta (primer contacto del lead, cierre por falta de respuesta, día de planificación y contacto de clientes en rojo).",
      },
    ],
  },
};

export const TUTORIAL_VENDEDOR: Semilla = {
  codigo: "TU-VEN-01",
  titulo: "Tutorial del panel: vendedor",
  area: "Ventas",
  version: "0.1",
  tipo: "tutorial",
  roles: ["seller"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina del vendedor) está en tu Manual.",
    alcance:
      "- Entras con el mismo correo y clave de Odoo. Al entrar llegas al Dashboard.\n- Lo que ves es solo tuyo: tus leads, tus clientes, tus pedidos y tus cifras.\n- Las ventas y los clientes salen de Odoo; los montos van sin IVA.\n- Puedes reordenar tu menú arrastrando las opciones; el orden se guarda.\n- Ctrl + Mayús + P activa el modo presentación: oculta montos y nombres de clientes para mostrar la pantalla sin exponer datos.",
    responsables: [],
    definiciones: [
      { termino: "Lead", definicion: "Persona o empresa interesada que te asigna el panel. Lo trabajas en Leads." },
      { termino: "Cierre ganado / perdido", definicion: "Cómo termina un lead: compró (con factura) o no compró (con el motivo)." },
      { termino: "Cuota", definicion: "Tu meta de facturación del mes, sin IVA." },
      { termino: "Método de retiro", definicion: "Cómo recibe el cliente su pedido: sucursal, ruta, encomienda o transporte externo." },
      { termino: "Spiff", definicion: "Incentivo por vender marcas o productos con meta." },
      { termino: "Semáforo", definicion: "Verde, amarillo o rojo según cómo viene comprando cada cliente contra su propio historial." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/vendedores",
        "Es tu resumen de ventas.\n- Arriba eliges el período: un mes o \"Histórico Total\".\n- Tarjetas: tu ranking de ventas y de leads, Total Facturado, Monto Leads y Crecimiento Mensual.\n- \"Cuota del Mes\": cuánto llevas facturado contra tu meta y cuánto falta. Pulsa \"Click para detalle →\" para ver los días hábiles que quedan, cuánto tienes que vender por día y cuánto para llegar al 150 %.\n- Más abajo: la evolución de tus ventas, la eficiencia de tus leads, tus 5 mejores clientes y tus 5 productos más vendidos.",
        "El detalle de la cuota es siempre del mes actual, aunque arriba elijas otro período.",
      ),
      PASO(
        "Leads",
        "Menú › Leads",
        "/vendedores/leads",
        "Tu tablero de oportunidades, en columnas: NUEVO, CONTACTADO, las etapas que configure AdminLeads y CERRADO.\n- Busca por empresa o contacto y filtra por ubicación.\n- En cada tarjeta: teléfono (abre WhatsApp), RIF, ubicación, interés, canal, campaña y \"Observaciones...\" (se guarda al salir del campo).\n- Arrastra la tarjeta para pasarla de etapa. Se avanza una etapa a la vez y no se puede cerrar un lead que sigue en NUEVO.\n- Para cerrarlo, pulsa \"Cerrar Lead\" o arrástralo a CERRADO y elige:\n  - Cierre ganado: fecha, monto en USD y número de factura (los tres obligatorios).\n  - Ya es cliente: la fecha.\n  - Cierre perdido: la fecha y el motivo.\n- En un cierre ganado aparece \"Segunda Compra\" para registrar que el cliente volvió a comprar.\n- El tablero se actualiza solo cuando te llega un lead nuevo.",
        "Un lead cerrado ya no se puede mover (salvo los cerrados por abandono). Editar, borrar o pasar un lead a otro vendedor lo hace AdminLeads.",
      ),
      PASO(
        "Cierres",
        "Menú › Cierres",
        "/vendedores/Cierres",
        "Tu historial de leads cerrados, solo para consultar.\n- Filtra por Ganado, Ya es cliente o Perdido.\n- La tabla muestra empresa, contacto, motivo, monto, factura, fecha de cierre y observaciones.\n- Los cierres se registran en Leads, no aquí.",
      ),
      PASO(
        "Método de retiro",
        "Menú › Método de retiro",
        "/vendedores/metodo-retiro",
        "Aquí dices cómo recibe el cliente cada pedido. Sin esto, Almacén no lo despacha.\n- Las tarjetas de arriba filtran: Todos los pedidos, Sin método, Con método y En despacho. Empieza siempre por \"Sin método\".\n- Los pedidos salen agrupados por cliente. Marca uno o varios (o \"Elegir todos\") y elige el método:\n  - Retiro en sucursal.\n  - Por ruta: elige la ruta.\n  - Encomienda: elige o escribe la agencia.\n  - Transporte externo: la compañía y una foto de la autorización del cliente (JPG, PNG o WEBP, hasta 15 MB).\n- Pulsa \"Guardar\" (o \"Guardar para N pedidos\"). Los pedidos guardados juntos viajan juntos y la ruta gratis se calcula con la suma.",
        "Un pedido \"En despacho\" ya no deja cambiar el método.",
      ),
      PASO(
        "Clientes",
        "Menú › Clientes",
        "/vendedores/clientes",
        "Tu cartera: los clientes que en Odoo te tienen como vendedor.\n- Busca por nombre o RIF.\n- \"Por periodo\" muestra solo los clientes a los que facturaste en esas fechas.\n- En cada cliente: \"Llamar\" y \"Correo\".\n- \"Exportar Excel\" baja la cartera con teléfono, correo, dirección, plazo de pago, límite de crédito y saldo.",
      ),
      PASO(
        "Top Clientes",
        "Menú › Top Clientes",
        "/vendedores/top-clientes",
        "Qué te compraron y quién, en un período.\n- Elige las fechas (Hoy, Este Mes, 30 días, 90 días) y, si quieres, filtra por zona, producto o tipo de pago.\n- Arriba ves facturación total, facturas, clientes, contado, crédito y productos.\n- Pulsa un cliente para abrir su ficha: lo que te compró, lo que debe, sus días de crédito, lo atrasado y sus productos más y menos vendidos.",
      ),
      PASO(
        "Semáforo de clientes",
        "Menú › Semáforo de clientes",
        "/semaforo-clientes",
        "Te dice qué clientes están dejando de comprarte.\n- Elige la ventana: 30, 60 o 90 días.\n- Las tarjetas cuentan cuántos clientes están en verde, amarillo y rojo, cuántos dejaron de comprar y cuánto se factura en riesgo.\n- En la tabla, filtra por color o marca \"Solo los que cambiaron de color\". La columna \"Vs. semana pasada\" dice si mejoró o empeoró.\n- Pulsa un cliente para ver por qué está en ese color y sus compras de cada mes.\n- La pestaña \"Cómo se calcula\" explica las reglas.",
        "La primera vez que se abre en el día puede tardar alrededor de un minuto.",
      ),
      PASO(
        "Planificación de visitas",
        "Menú › Planificación de visitas",
        "/vendedores/planificacion",
        "Tu plan de visitas de la semana.\n- Muévete entre semanas con las flechas.\n- Llena Zona / Ruta y Marcas priorizadas.\n- En el tablero de lunes a viernes, pulsa \"Agregar visita\" en la mañana o la tarde: cliente, zona, tema, objetivo y si es \"Visita foránea\".\n- Pulsa \"Guardar\". Si cambias de semana sin guardar, te pregunta.\n- \"Resumen del mes\" muestra cómo vas; \"Excel\" baja el plan.",
        "La meta es de 7 visitas o más por semana. Las marca como realizadas tu gerente.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Tu lista de tareas en tres columnas: PENDIENTES, EN CURSO y CULMINADAS.\n- \"+ Nueva Actividad\": título, fecha límite (no puede ser pasada) y descripción, los tres obligatorios.\n- Arrastra la tarjeta para cambiar su estado. Hay que pasar por EN CURSO antes de culminarla, y una culminada ya no se mueve.\n- En cada tarjeta puedes escribir una observación.\n- \"Asignadas por Mí\" muestra las tareas que tú le diste a otros.",
      ),
      PASO(
        "Catálogo",
        "Menú › Catálogo",
        "/vendedores/catalogo",
        "Los productos con existencia de tu sede, con precio.\n- Busca por nombre, código o código de barras, o elige una categoría.\n- Haz clic en las tarjetas para marcarlas, o \"Seleccionar los N filtrados\".\n- \"Exportar Excel\" te deja elegir las columnas (referencia, nombre, marca, cantidad disponible, precio, imagen).",
      ),
      PASO(
        "Banco de Flyers",
        "Menú › Banco de Flyers",
        "/vendedores/banco-imagenes",
        "Flyers listos para mandar a tus clientes.\n- Busca o filtra por categoría.\n- Abre un flyer y elige \"Precio base\" (el de Odoo) o \"Precio personalizado\"; puedes arrastrar la etiqueta del precio.\n- Descarga con o sin precio.\n- Con varios seleccionados, \"Editar seleccionados\" y bájalos como imágenes, en un PDF o en un .zip.",
      ),
      PASO(
        "Material POP (solo Valencia)",
        "Menú › Material POP",
        "/vendedores/material-pop",
        "Para pedir material publicitario.\n- \"Nueva solicitud\": productos y cantidades, y para quién es:\n  - Para un cliente: el cliente, si se entrega \"De una vez\" o \"Cuando compre\" (con la orden de Odoo, obligatoria en ese caso).\n  - Uso interno: para qué es.\n- Pulsa \"Enviar solicitud\". La aprueba AdminLeads y te llega un correo cuando se aprueba y cuando se entrega.\n- En \"Mis solicitudes\" ves el estado y puedes cancelar (\"Cancelar solicitud\" o \"Ya no lo necesito\").",
      ),
      PASO(
        "RMA de mis clientes",
        "Menú › RMA de mis clientes",
        "/vendedores/casos-rma",
        "Los casos de servicio técnico de tus clientes, solo para consultar.\n- Las tarjetas filtran: todos, en el taller, listos sin entregar y entregados.\n- Busca por caso, cliente, producto, serial o factura.\n- Abre un caso para ver sus etapas (ticket, recepción, revisión, resultado, entrega), el diagnóstico, las fotos, la nota de crédito si la hay y el historial.",
      ),
      PASO(
        "Stoplight Report",
        "Menú › Stoplight Report",
        "/vendedores/StoplightReport",
        "Tus indicadores del mes en verde, amarillo o rojo, solo con tus cifras.\n- Elige el mes.\n- Verás cumplimiento de cuota, visitas, efectividad de cierre de cotizaciones, activación de cartera, clientes nuevos, cobertura de marcas y ciclo de reposición.\n- Pulsa un indicador para ver de dónde sale.",
      ),
      PASO(
        "Spiff",
        "Menú › Spiff",
        "/vendedores/spiff",
        "Tus incentivos del mes.\n- Elige el mes.\n- Vista por Marca: cuánto vendiste, la meta, el spiff por meta y lo ganado. Pulsa una marca para ver sus productos.\n- \"Mi Spiff\": tu acumulado y tu posición frente a los demás vendedores.",
      ),
    ],
    documentos:
      "- Una opción del menú no aparece: Leads y Cierres se ocultan si tu usuario está pausado, y Material POP es solo de Valencia. Pregunta a tu gerente.\n- Un pedido no aparece en Método de retiro, o una factura no la encuentra el cierre del lead: revisa en Odoo que el pedido o la factura sean tuyos y estén confirmados.\n- Un lead no es para ti: avísale a AdminLeads para que lo reasigne.\n- Un número no te cuadra: los montos van sin IVA y las notas de crédito restan.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las 15 pantallas del vendedor." }],
  },
};
