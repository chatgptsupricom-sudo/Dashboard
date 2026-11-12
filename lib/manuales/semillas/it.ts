import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol IT (name "it" en la tabla roles). Hoy su trabajo en
// el panel es el paso PREAPRUEBA del flujo de notas de crédito
// (lib/notas-credito/). El acceso lo da ser responsable de ese paso en una
// sede (pestaña Responsables del SuperAdmin), no solo el rol. Nombres de
// pantallas y botones a nov-2026. Lo marcado "(propuesta)" lo confirma la
// Dirección antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_IT: Semilla = {
  codigo: "MR-IT-01",
  titulo: "Manual de IT: preaprobación de notas de crédito",
  area: "IT",
  version: "0.1",
  tipo: "manual",
  roles: ["it"],
  contenido: {
    objetivo:
      "Que ninguna nota de crédito llegue a aprobación sin que alguien haya revisado que corresponde: que el equipo de RMA de verdad no se puede reparar, que lo que pide el cliente tiene sentido y que los productos y seriales son de esa factura.\n\nEste manual es la rutina del paso Preaprueba del flujo de notas de crédito. Cómo se usa la pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica a quien está asignado como «preaprueba» en una o más sedes (lo asigna el SuperAdmin en Notas de crédito › Responsables).\n- Cubre: revisar y preaprobar o rechazar las solicitudes de RMA y de clientes (portal), y crear las notas de crédito que no vienen de RMA.\n- No cubre: aprobar (lo hace quien aprueba), hacer la nota de crédito en Odoo (quien procesa) ni asignar la factura de una solicitud de RMA.\n- El flujo: Solicitada → Preaprobada (tú) → Aprobada → Hecha en Odoo.\n\nREGLAS DEL PASO\n- P1. Las solicitudes por preaprobar se resuelven en máximo 2 días hábiles (propuesta).\n- P2. Se preaprueba solo si el motivo está claro y, en las de RMA, si el diagnóstico respalda que no se puede reparar.\n- P3. El motivo de un rechazo se escribe pensando que el cliente lo va a leer: claro, sin montos ni nombres internos.\n- P4. Una nota de crédito nueva (no RMA) lleva los productos y seriales exactos de la factura; un serial no va en dos notas.",
    responsables: [
      { rol: "Preaprueba (IT)", responsabilidad: "Revisa cada solicitud y la preaprueba o la rechaza; crea las notas de crédito que no vienen de RMA." },
      { rol: "RMA", responsabilidad: "Solicita la nota de crédito de un equipo que no se puede reparar, con el diagnóstico." },
      { rol: "Cliente", responsabilidad: "Pide la nota de crédito en el portal con su factura, productos y motivo." },
      { rol: "Aprueba", responsabilidad: "Aprueba o rechaza lo preaprobado." },
      { rol: "Procesa", responsabilidad: "Hace la nota de crédito en Odoo con lo aprobado." },
      { rol: "SuperAdmin", responsabilidad: "Asigna los responsables de cada paso por sede." },
    ],
    definiciones: [
      { termino: "Solicitud de RMA", definicion: "Pedido de Servicio Técnico para un equipo que no se puede reparar. Trae el caso, el producto, el motivo y por qué no se puede reparar." },
      { termino: "Solicitud del portal", definicion: "Pedido del cliente con su factura, sus productos con serial, un motivo de la lista y su contacto." },
      { termino: "Nota de crédito directa", definicion: "La que crea preaprueba para algo que no es de RMA; nace preaprobada." },
      { termino: "NC en revisión", definicion: "Estado del equipo de RMA mientras su nota de crédito se decide: RMA no lo puede mover a mano." },
      { termino: "Por acreditar", definicion: "Lo que queda de una factura que todavía no tiene nota de crédito." },
    ],
    pasos: [
      PASO(
        "Revisar lo que espera preaprobación",
        "Preaprueba · todos los días",
        "/notas-credito",
        "- Entra a Notas de crédito: abre en \"Por preaprobar\" (el número del menú dice cuántas esperan por ti; también te llega un correo con cada una).\n- Empieza por las más viejas (regla P1). Usa el buscador por cliente, factura, caso RMA o motivo.\n\nCriterio de salida: ninguna solicitud con más de 2 días hábiles esperando (propuesta).",
      ),
      PASO(
        "Revisar una solicitud de RMA",
        "Preaprueba",
        "/notas-credito",
        "- Abre la solicitud y lee \"Por qué la nota de crédito\" y \"No se puede reparar\".\n- En \"El caso de RMA\" revisa el equipo, el serial, la falla, el diagnóstico del técnico, las observaciones y las fotos.\n- Revisa el monto: es una unidad del producto según la factura; si dice \"Monto por definir\", la factura la asignará quien hace la nota.\n- Si el diagnóstico respalda que no se puede reparar (regla P2), \"Preaprobar\" (con un comentario si hace falta). Si no, \"Rechazar\" con el motivo: el equipo vuelve al estado que tenía y RMA decide qué hacer.",
      ),
      PASO(
        "Revisar una solicitud del cliente (portal)",
        "Preaprueba",
        "/notas-credito",
        "- Abre la solicitud: factura, productos con seriales, motivo elegido y detalle, y el contacto del cliente (puedes llamarlo o escribirle desde ahí).\n- Si hace falta, confirma con el cliente o con el vendedor antes de decidir.\n- \"Preaprobar\" si corresponde. Si no, \"Rechazar\" con un motivo que el cliente pueda leer (regla P3): lo ve en su enlace de seguimiento.",
        "Si otra persona ya la movió, el panel avisa: recarga la pantalla.",
      ),
      PASO(
        "Crear una nota de crédito que no es de RMA",
        "Preaprueba · cuando la pide un área",
        "/notas-credito",
        "- Pulsa \"Nueva nota de crédito\" (si tienes varias sedes, elige la sede).\n- Busca la factura por número o cliente.\n- Elige los productos (agrupados por marca) y sus seriales: si Odoo los tiene, márcalos; si no, escríbelos; sin serial, pon la cantidad (regla P4).\n- Escribe por qué se hace y \"Enviar a aprobación\". Nace preaprobada y le llega a quien aprueba.\n\nCriterio de salida: la nota tiene los productos y seriales correctos y su motivo.",
        "Un serial que ya está en otra nota sale tachado; no puedes acreditar más de lo que queda por acreditar de la factura.",
      ),
      PASO(
        "Seguir lo que preaprobaste",
        "Preaprueba · cada semana",
        "/notas-credito",
        "- En \"Mis solicitudes\" ves las que creaste, preaprobaste o rechazaste, con su estado: por aprobar, aprobada, en borrador, publicada o rechazada.\n- La tarjeta dice si la nota ya se creó en Odoo y su número.\n- Si una lleva mucho tiempo sin avanzar en aprobación o en Odoo, avísale a quien la tiene.",
      ),
    ],
    documentos:
      "REGISTROS\n- Cada solicitud con su historial (quién la creó, preaprobó, aprobó, rechazó y por qué): panel, Notas de crédito.\n- La nota de crédito hecha: Odoo.\n\nINDICADORES\n- Solicitudes por preaprobar con más de 2 días hábiles. Meta: 0 (propuesta).\n- Notas rechazadas en aprobación después de preaprobadas. Meta: bajar cada mes (propuesta).",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_IT: Semilla = {
  codigo: "TU-IT-01",
  titulo: "Tutorial del panel: IT (notas de crédito)",
  area: "IT",
  version: "0.1",
  tipo: "tutorial",
  roles: ["it"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. Tu trabajo aquí es preaprobar notas de crédito, todo en una sola pantalla. En este recorrido vas a ver cada parte de esa pantalla y cómo se usa.\n\nQué hacer y cuándo está en tu Manual.",
    alcance:
      "- Al entrar llegas directo a Notas de crédito.\n- Ves solo las sedes donde eres responsable de preaprobar. Si la pantalla dice «No tienes acceso a las notas de crédito», pide al SuperAdmin que te agregue como responsable (puede tardar medio minuto en verse).\n- El número junto a «Notas de crédito» en el menú son las que esperan por ti.",
    responsables: [],
    definiciones: [
      { termino: "Preaprobar", definicion: "Dar el primer visto bueno: la solicitud pasa a quien aprueba." },
      { termino: "Rechazar", definicion: "La solicitud no procede; el motivo lo puede leer el cliente." },
      { termino: "Directa", definicion: "Nota de crédito que creas tú; nace preaprobada." },
    ],
    pasos: [
      PASO(
        "Por preaprobar",
        "Notas de crédito › Por preaprobar",
        "/notas-credito",
        "La lista de lo que espera por ti: las de RMA (\"RMA N.º …\") y las que pidió el cliente en el portal.\n- Cada tarjeta: número, origen, sede, cliente y factura, productos y seriales, motivo, monto y fecha.\n- Busca por cliente, nota, factura, caso RMA, motivo o autor; filtra por sede si tienes varias.\n- Toca una para abrir el detalle.",
      ),
      PASO(
        "El detalle de una solicitud",
        "Notas de crédito › una solicitud",
        "/notas-credito",
        "- Arriba: de dónde viene (RMA, portal o directa), la sede, el cliente, la factura y el monto.\n- \"Por qué la nota de crédito\" (en RMA, también por qué no se puede reparar).\n- Los productos con sus seriales y precios, y en las de RMA el bloque \"El caso de RMA\" con la falla, el diagnóstico y las fotos.\n- Los pasos (Solicitada → Preaprobada → Aprobada → Hecha en Odoo) y el historial.",
      ),
      PASO(
        "Preaprobar o rechazar",
        "Notas de crédito › una solicitud",
        "/notas-credito",
        "- \"Preaprobar\": confirma que pasa a quien aprueba; el comentario es opcional y queda en el historial.\n- \"Rechazar\": escribe el motivo (obligatorio) y \"Confirmar rechazo\". En las del portal, el cliente lo lee.",
        "Si alguien ya la movió, el panel te pide recargar la pantalla.",
      ),
      PASO(
        "Nueva nota de crédito",
        "Notas de crédito › Nueva nota de crédito",
        "/notas-credito",
        "Para lo que no es un equipo de RMA.\n- Busca la factura (número o cliente).\n- Elige los productos (agrupados por marca) y marca sus seriales, escríbelos o pon la cantidad.\n- Escribe el motivo y \"Enviar a aprobación\": nace preaprobada.",
        "El botón sale solo en las sedes donde el flujo tiene a alguien en cada paso.",
      ),
      PASO(
        "Mis solicitudes",
        "Notas de crédito › Mis solicitudes",
        "/notas-credito",
        "Las que creaste, preaprobaste o rechazaste, con su estado hasta Odoo. Filtra por estado y mira si la nota ya está creada en Odoo y con qué número.",
      ),
    ],
    documentos:
      "- Dice «No tienes acceso a las notas de crédito»: no eres responsable de ningún paso; pídeselo al SuperAdmin.\n- No sale «Nueva nota de crédito»: a esa sede le falta alguien en aprobar o en procesar.\n- No puedes elegir un serial: ya está en otra nota de crédito o no salió con esa factura.\n- El enlace al caso de RMA no abre: los datos del caso ya están en el detalle de la solicitud.\n- Cualquier otra falla del panel: avisa a soporte con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por la pantalla de notas de crédito para el paso Preaprueba." }],
  },
};
