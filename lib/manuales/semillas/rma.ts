import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol RMA / Servicio Técnico (name "rma" en la tabla roles).
// Nombres de pantallas y botones del panel a nov-2026. Los plazos (48 h
// hábiles de diagnóstico, salida antes del 7.º día hábil) los mide el panel
// (lib/rma/plazos.ts). Lo marcado "(propuesta)" lo confirma la Gerencia de
// Operaciones antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_RMA: Semilla = {
  codigo: "MR-RMA-01",
  titulo: "Manual de Servicio Técnico (RMA)",
  area: "Servicio Técnico",
  version: "0.1",
  tipo: "manual",
  roles: ["rma"],
  contenido: {
    objetivo:
      "Que todo equipo que un cliente trae a servicio técnico se diagnostique en 48 horas hábiles, se resuelva (reparado, nota de crédito o no procede) y salga antes del 7.º día hábil, con el cliente informado en cada paso y constancia firmada de cuándo entró y cuándo salió.\n\nEste manual es la rutina del rol. Cómo se usa cada pantalla está en el Tutorial del menú. Lo que hace Seguridad en el mostrador está en el Manual de Seguridad.",
    alcance:
      "- Aplica al personal de RMA de Valencia, Caracas y Panamá.\n- Cubre: equipos por llegar, recepción (en Caracas, sin Seguridad), diagnóstico, reparación, solicitud de nota de crédito, entrega al cliente y firmas de las actas.\n- Los equipos vendidos por Supricom llevan garantía y pueden terminar en nota de crédito. Los externos (no vendidos por Supricom) son un servicio que se cobra: hay que enviar el presupuesto al cliente antes de trabajar y nunca llevan nota de crédito.\n- No cubre: el registro del ingreso y la entrega en el mostrador donde hay Seguridad (Valencia y Panamá), la aprobación de la nota de crédito ni su emisión en Odoo.\n\nREGLAS DEL ROL\n- R1. Todo equipo entra con un ticket del portal o con un caso creado por RMA; nunca se trabaja un equipo sin caso.\n- R2. Diagnóstico en 48 horas hábiles desde que el equipo llega; salida antes del 7.º día hábil (el día del ingreso es el 1; un reingreso reinicia el reloj).\n- R3. Cada cambio se registra en el caso el mismo día: estado, diagnóstico y notas. Es lo que ve el cliente en su consulta y lo que dispara sus correos.\n- R4. La nota de crédito no se pone a mano: se solicita en Nota de Crédito, explicando por qué no se puede reparar.\n- R5. Ningún equipo sale sin acta firmada (Seguridad, RMA y cliente; en Caracas, RMA y quien se lo lleva).",
    responsables: [
      { rol: "RMA (técnico)", responsabilidad: "Diagnostica, repara, actualiza el caso y firma las actas. En Caracas registra además la recepción y la entrega." },
      { rol: "Seguridad", responsabilidad: "En Valencia y Panamá recibe el equipo en el mostrador (con el ticket) y lo entrega al cliente, con las firmas." },
      { rol: "Cliente", responsabilidad: "Reporta el equipo en el portal, lo trae o lo envía y firma al retirarlo." },
      { rol: "Preaprueba / Aprueba / Procesa", responsabilidad: "Deciden y hacen en Odoo la nota de crédito que RMA solicita." },
      { rol: "Vendedor", responsabilidad: "Ve los casos de sus clientes en solo lectura y les informa." },
    ],
    definiciones: [
      { termino: "Ticket del portal", definicion: "Reporte que hace el cliente en servicio.supricom.com.ve. Crea el caso en \"Por llegar\"." },
      { termino: "Estados del caso", definicion: "Por llegar → En diagnóstico → En reparación → Reparado / Nota de crédito / No procesado. \"Reingresado\" cuando vuelve un equipo ya atendido. \"NC en revisión\" mientras se decide una nota de crédito." },
      { termino: "Día hábil", definicion: "Lunes a viernes, hora de Caracas. El panel cuenta las 24 horas de cada día hábil y no descuenta feriados." },
      { termino: "Semáforo de plazo", definicion: "A tiempo, Por vencer o Vencido, según el plazo que corre: equipo por llegar (aviso a los 3 días hábiles), diagnóstico (48 h) o salida (7.º día hábil)." },
      { termino: "Equipo externo", definicion: "Equipo no comprado en Supricom: servicio presupuestado, sin garantía ni nota de crédito." },
      { termino: "Envío con varios productos", definicion: "Un mismo ticket con varios equipos. Cada producto tiene su estado y el envío queda entregado cuando sale el último." },
    ],
    pasos: [
      PASO(
        "Empezar el día: plazos y lo que viene",
        "RMA · todos los días",
        "/rma",
        "- Abre el Dashboard y revisa el aviso de plazos: casos con más de 48 h en diagnóstico, en su 7.º día hábil o con el equipo que no llega. \"Ver cuáles\" lleva a cada caso.\n- Revisa el correo de las 8:05 con el resumen de tu sede.\n- Abre Por llegar: los clientes que reportaron y no han traído el equipo. Llama a los que llevan 3 días hábiles o más.\n\nCriterio de salida: sabes qué casos vencen hoy y a quién llamar.",
      ),
      PASO(
        "Recibir el equipo",
        "Seguridad (Valencia y Panamá) / RMA (Caracas)",
        "/rma/por-llegar",
        "- Donde hay Seguridad: Seguridad registra el ingreso en el mostrador con el ticket. RMA elige quién recibe por RMA y firma. El caso pasa solo a En diagnóstico y el cliente recibe el correo.\n- Antes de tocar el equipo, abre el acta de ingreso y comprueba que tenga las firmas y los controles (accesorios, manipulación).\n- En Caracas (sin Seguridad): en el caso, tarjeta \"Recepción y entrega del equipo\", \"Registrar recepción\": qué llegó, accesorios, manipulación, cómo llegó (lo trae el cliente, con su firma, o por encomienda, con la foto de la guía o del paquete) y la firma de RMA.\n- Si el equipo llega sin ticket, el cliente lo reporta en el portal; si RMA ya lo tiene en la mano, crea el caso en \"Nuevo Caso\" (entra en diagnóstico).\n\nCriterio de salida: caso En diagnóstico con su acta de recepción.",
        "En un caso creado por RMA la factura que se completa sola no es una validación: comprueba la compra en Buscar factura.",
      ),
      PASO(
        "Validar la compra y la garantía",
        "RMA",
        "/rma/buscar-factura",
        "- En Buscar factura escribe la factura, el serial, el producto o el cliente (basta uno).\n- Lee el veredicto: \"Sí lo compró en la empresa\", \"Lo compró, pero lo devolvió\", \"solo pasó entre sedes\", \"nunca salió a un cliente\" o \"no está en Odoo\". Antes de abril de 2026 busca también en Smartbit.\n- En la factura revisa la garantía de cada producto y si ya tiene caso.\n- Si es un equipo externo, envía el presupuesto al cliente y espera su aprobación antes de trabajar.\n\nCriterio de salida: sabes si el equipo se compró en la empresa y si está en garantía.",
      ),
      PASO(
        "Diagnosticar en 48 horas hábiles",
        "RMA",
        "/rma/inventario/supricom",
        "- Abre el caso desde el inventario (Supricom o Externo) y revisa la falla, las fotos del cliente y los datos del portal.\n- Escribe el diagnóstico en \"Editar\" (o en \"Diagnóstico y datos\" de cada producto si el envío trae varios).\n- Cambia el estado: \"En reparación\" si se repara, \"No Procesado\" si no procede, o \"Solicitar nota de crédito\" si no se puede reparar (paso siguiente).\n- Escribe en \"Notas del Cambio\" lo que hace falta saber. El cliente del portal recibe un correo con el nuevo estado (no con el texto del diagnóstico).\n\nCriterio de salida: todo caso con diagnóstico y estado antes de las 48 h hábiles (regla R2).",
        "Con varios productos, el estado se cambia producto por producto: el del envío se calcula solo.",
      ),
      PASO(
        "Solicitar la nota de crédito",
        "RMA",
        "/rma/nota-credito/solicitar",
        "- Solo para equipos vendidos por Supricom que siguen en revisión (en diagnóstico, en reparación o reingresado).\n- En Nota de Crédito, \"Solicitar nota de crédito\": elige el caso y el producto, explica por qué corresponde la nota de crédito y por qué no se puede reparar (los dos obligatorios), agrega observaciones e imágenes.\n- \"Enviar solicitud\". El equipo pasa a \"NC en revisión\" y la solicitud va a quien preaprueba, luego a quien aprueba y por último a quien la hace en Odoo.\n- Si la rechazan, el equipo vuelve al estado que tenía y decides qué hacer. Si se aprueba, el equipo pasa a Nota de crédito.\n\nCriterio de salida: solicitud enviada con los dos motivos claros.",
        "Un equipo en \"NC en revisión\" con solicitud abierta no se mueve a mano: espera la decisión.",
      ),
      PASO(
        "Reparar y avisar",
        "RMA",
        "/rma/inventario/supricom",
        "- Cuando termina la reparación, cambia el estado a \"Reparado\". El cliente del portal recibe un correo con el enlace para elegir cómo recibe el equipo (sucursal, ruta o agencia).\n- Si el envío trae varios productos, el correo sale cuando termina el último.\n- Si un equipo vuelve con la misma falla, el caso pasa a \"Reingresado\" y el reloj de 7 días empieza de nuevo.\n\nCriterio de salida: el equipo listo y el cliente avisado antes del 7.º día hábil.",
      ),
      PASO(
        "Entregar el equipo",
        "Seguridad (Valencia y Panamá) / RMA (Caracas)",
        "/rma/inventario/supricom",
        "- Donde hay Seguridad: Seguridad lo entrega desde \"Listos para despachar\" con las firmas del cliente, de RMA y de Seguridad. En el caso, \"Firmas de las actas\": elige quién de RMA firma y firma.\n- Si se envía por agencia: en la tarjeta Entrega, \"Adjuntar guía de la agencia\" y \"Subir y marcar como entregado\" (el cliente recibe la guía por correo). Si retira en sucursal o va por ruta, \"Marcar como entregado\".\n- En Caracas: \"Registrar entrega\" en la tarjeta del caso: qué sale, cómo sale (lo retira el cliente, ruta interna o encomienda), quién se lo lleva con su firma y la firma de RMA. Después sube la prueba: la nota de entrega firmada (ruta) o la guía de la agencia (encomienda).\n\nCriterio de salida: equipo entregado con su acta firmada y, si fue enviado, con la prueba adjunta.",
        "Una firma guardada no se puede cambiar: si hubo un error, solo el SuperAdmin la rehace.",
      ),
      PASO(
        "Mantener al día el personal de RMA",
        "RMA",
        "/rma/personal",
        "- En Personal registra a cada persona de RMA que firma actas (solo el nombre).\n- Da de baja a quien ya no está; si vuelve, se reactiva.\n- Esa lista es la que sale en \"Recibió por RMA\", \"Entrega por RMA\" y \"Firmas de las actas\".",
      ),
    ],
    documentos:
      "REGISTROS\n- Caso, estados, diagnóstico, notas e historial: panel, detalle del caso.\n- Actas de recepción y entrega con sus firmas, fotos de llegada, notas de entrega y guías: panel (comprobantes imprimibles).\n- Solicitudes de nota de crédito y su decisión: panel, Nota de Crédito; la nota se emite en Odoo.\n\nINDICADORES (los revisa la Gerencia de Operaciones)\n- Casos con más de 48 h hábiles en diagnóstico. Meta: 0.\n- Equipos en las instalaciones en su 7.º día hábil o más. Meta: 0.\n- Tickets cuyo equipo no llega en 5 días hábiles sin contacto al cliente. Meta: 0 (propuesta).\n- Actas con firmas faltantes. Meta: 0.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Operaciones confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_RMA: Semilla = {
  codigo: "TU-RMA-01",
  titulo: "Tutorial del panel: Servicio Técnico (RMA)",
  area: "Servicio Técnico",
  version: "0.1",
  tipo: "tutorial",
  roles: ["rma"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de RMA) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de Servicio Técnico.\n- Ves los casos de todas las sedes; los correos de plazos y el resumen diario sí son de tu sede.\n- Los clientes que reportaron en el portal reciben un correo con cada cambio de estado; los casos que crea RMA en el panel no mandan correos.\n- Borrar un caso es definitivo: no se puede deshacer.",
    responsables: [],
    definiciones: [
      { termino: "Por llegar", definicion: "El cliente hizo el ticket pero el equipo no ha llegado." },
      { termino: "48 h hábiles", definicion: "Plazo para diagnosticar desde que llega el equipo." },
      { termino: "7.º día hábil", definicion: "El equipo debe salir antes de ese día, contando el del ingreso como el 1." },
      { termino: "NC en revisión", definicion: "El equipo espera la decisión de una nota de crédito." },
      { termino: "Externo", definicion: "Equipo no vendido por Supricom: servicio que se cobra." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/rma",
        "El resumen de servicio técnico.\n- Arriba, el aviso de plazos (rojo si hay vencidos, ámbar si hay por vencer): \"Ver cuáles\" abre la lista de casos.\n- Tarjetas: por llegar, en diagnóstico, en reparación, total, del mes, completados, pendientes, no procede y notas de crédito. Debajo de cada una, los vendidos y no vendidos por Supricom, que abren el inventario filtrado.\n- \"Productos que más entran a RMA\".\n- Botón \"Nuevo Caso\".",
      ),
      PASO(
        "Por llegar",
        "Menú › Por llegar",
        "/rma/por-llegar",
        "Los clientes que reportaron un equipo en el portal y todavía no lo traen.\n- Busca por caso, cliente, producto, serial, factura o marca.\n- Cada fila: fecha del ticket, sede, cliente, producto, teléfono (para llamar) y cuántos días hábiles lleva esperando.\n- Toca la fila para abrir el caso.\n- Se actualiza sola y avisa cuando entra un ticket nuevo.",
        "El caso sale de aquí cuando se registra la recepción (Seguridad, o RMA en Caracas).",
      ),
      PASO(
        "Inventario RMA Supricom",
        "Menú › Inventario RMA Supricom",
        "/rma/inventario/supricom",
        "Los casos de equipos vendidos por Supricom.\n- Busca por caso, cliente o producto; filtra por estado y por origen (Interno o Portal).\n- Columnas: caso, cliente, factura, modelo (+N si son varios), serial, estado con su semáforo de plazo y fecha.\n- Toca la fila para abrir el caso. \"Nuevo Caso\" para un equipo que tienes en la mano.\n- El aviso de arriba muestra los equipos que llevan muchos días sin despachar.",
      ),
      PASO(
        "Inventario RMA Externo",
        "Menú › Inventario RMA Externo",
        "/rma/inventario/externo",
        "Los casos de equipos no vendidos por Supricom (servicio presupuestado, sin garantía).\n- Igual que el de Supricom, pero sin notas de crédito y sin \"Nuevo Caso\": los externos entran solo por el portal.\n- En el caso verás el documento y el correo del cliente para enviarle el presupuesto.",
      ),
      PASO(
        "Nuevo caso",
        "Inventario Supricom › Nuevo Caso",
        "/rma/nuevo",
        "Para un equipo que RMA ya tiene en la mano.\n- Código de producto (se completa desde Odoo), si tiene serial, el serial y la factura.\n- Nombre y teléfono del cliente y la falla reportada (obligatorios).\n- Al guardar el caso entra En diagnóstico y empieza el plazo de 48 h.",
        "La factura que se completa sola es la última con ese producto, no necesariamente la del cliente: compruébala en Buscar factura.",
      ),
      PASO(
        "El caso por dentro",
        "Inventario › un caso",
        "/rma/inventario/supricom",
        "Al abrir un caso:\n- Arriba, el plazo que corre (por llegar, diagnóstico o en las instalaciones) con su vencimiento.\n- \"Cambiar Estado\" con notas; \"Editar\" para los datos y el diagnóstico; \"Eliminar\" (definitivo).\n- Si el envío trae varios productos, cada uno tiene su \"Cambiar estado\", \"Diagnóstico y datos\" y \"Quitar\"; \"Agregar producto\" suma otro; \"Entregar productos\" marca los que se lleva el cliente.\n- Fotos y videos del cliente, datos del portal (garantía al momento del reporte) y la tarjeta Entrega con \"Marcar como entregado\" o \"Adjuntar guía de la agencia\".\n- \"Firmas de las actas\" para firmar por RMA. En Caracas, en su lugar, \"Recepción y entrega del equipo\".\n- Historial de todos los cambios.",
      ),
      PASO(
        "Buscar factura",
        "Menú › Buscar factura",
        "/rma/buscar-factura",
        "Para saber si un equipo se compró en la empresa.\n- Escribe factura, serial, producto o cliente (basta uno) y, si quieres, la sede. Pulsa \"Buscar\".\n- Por serial: el veredicto y el recorrido del serial.\n- Por factura: sus productos con serial, despacho, garantía y si ya tienen caso.\n- Por producto o cliente: las compras, de Odoo y de Smartbit.\n- Toca un número de factura para abrirla. No muestra precios.",
        "Los seriales cortos de Smartbit se repiten entre productos: agrega el producto para filtrar.",
      ),
      PASO(
        "Nota de Crédito",
        "Menú › Nota de Crédito",
        "/rma/nota-credito",
        "Tus solicitudes de nota de crédito y en qué van (por preaprobar, por aprobar, aprobada, hecha en Odoo o rechazada, con el motivo).\n- \"Solicitar nota de crédito\": caso, producto, por qué la nota de crédito, por qué no se puede reparar, observaciones e imágenes. \"Enviar solicitud\".\n- También se llega desde \"Cambiar Estado\" en el caso.",
      ),
      PASO(
        "Personal",
        "Menú › Personal",
        "/rma/personal",
        "Quién de RMA firma las actas.\n- \"Agregar persona\" con su nombre completo.\n- \"Dar de baja\" o \"Reactivar\".",
      ),
    ],
    documentos:
      "- Cambiaste el estado y no cambió: si el envío tiene varios productos, cámbialo producto por producto; si está en NC en revisión, espera la decisión; la nota de crédito no se pone a mano.\n- No puedes registrar la recepción o la entrega: donde hay Seguridad, la registra Seguridad.\n- No puedes pedir nota de crédito: el equipo es externo o ya no está en revisión.\n- El cliente no recibió correo: los casos creados por RMA no mandan correos, solo los del portal.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de RMA." }],
  },
};
