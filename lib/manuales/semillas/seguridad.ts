import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Seguridad (name "seguridad" en la tabla roles).
// Nombres de botones y pantallas del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia de Operaciones antes de publicar.
// Caracas no tiene Seguridad para RMA: allá las actas de equipos las hace RMA
// (lib/rma/sedesSeguridad.ts).

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_SEGURIDAD: Semilla = {
  codigo: "MR-SEG-01",
  titulo: "Manual de Seguridad",
  area: "Seguridad",
  version: "0.1",
  tipo: "manual",
  roles: ["seguridad"],
  contenido: {
    objetivo:
      "Que por el portón solo salga lo que corresponde a cada pedido facturado, verificado unidad por unidad y con el acta firmada, y que todo equipo de servicio técnico (RMA) que entra o sale del taller quede recibido o entregado con su acta y las firmas de quien lo trae o se lo lleva.\n\nEste manual es la rutina del rol. Cómo se usa cada pantalla está en el Tutorial del menú. Lo que hace Almacén antes del portón está en el Manual de Almacén y en PR-ALM-001 (Egreso de mercancía).",
    alcance:
      "- Aplica al personal de Seguridad de Valencia y Panamá. En Caracas los equipos de RMA los recibe y entrega RMA; la verificación de mercancía en el portón sí es de Seguridad.\n- Cubre: verificación de la mercancía que sale (despachos), calificación de los almacenistas, recepción de equipos de RMA en el mostrador, entrega de equipos reparados y el registro del personal que firma.\n- No cubre: el armado y despacho (Almacén), el diagnóstico y reparación (RMA) ni la recepción de contenedores (Almacén).\n\nREGLAS DEL ROL\n- S1. Nada sale por el portón sin pistolear todo lo que lleva y sin el acta firmada con tu clave.\n- S2. Si algo no cuadra, no se aprueba: se decide con su motivo (despachar igual, parcial, devolver a Almacén o cancelar).\n- S3. Ningún equipo de RMA entra sin ticket del portal ni sale sin las firmas del cliente, de RMA y de Seguridad.\n- S4. La clave personal y la firma son de cada persona: no se prestan. Una firma guardada no se cambia.\n- S5. La calificación es honesta: si hubo novedades y das 4 o 5 estrellas al picking, explicas por qué.",
    responsables: [
      { rol: "Seguridad", responsabilidad: "Hace los pasos de este manual. Responde por lo que deja salir por el portón y por las actas que firma." },
      { rol: "Almacén", responsabilidad: "Arma el pedido, pistolea los seriales y lo envía al portón. Corrige lo que Seguridad devuelve." },
      { rol: "RMA (Servicio Técnico)", responsabilidad: "Firma la recepción y la entrega de los equipos junto a Seguridad, diagnostica y repara, y marca cuándo un caso está listo para salir." },
      { rol: "Cliente", responsabilidad: "Trae el equipo con su ticket del portal y firma al retirarlo." },
      { rol: "SuperAdmin", responsabilidad: "Es el único que puede rehacer una firma guardada por error." },
    ],
    definiciones: [
      { termino: "Portón (C4)", definicion: "Punto de control donde Seguridad verifica lo que sale del almacén." },
      { termino: "Despacho (egreso)", definicion: "La salida de un pedido facturado. A Seguridad le tocan dos etapas: En portón y Por calificar." },
      { termino: "Novedad", definicion: "Diferencia que encuentra Seguridad: falta algo por pistolear, un serial de otra orden, un producto que no está en la orden o algo que no salió." },
      { termino: "Despacho parcial", definicion: "Sale solo lo contado; el resto queda pendiente en Odoo." },
      { termino: "Clave personal", definicion: "Número de 4 a 6 cifras con el que cada persona de Seguridad firma el acta de mercancía. Se registra en Personal." },
      { termino: "Ticket del portal", definicion: "Reporte que hace el cliente en servicio.supricom.com.ve antes de traer un equipo. Todo ingreso de RMA sale de un ticket." },
      { termino: "Acta de RMA", definicion: "Hoja de recepción y despacho del equipo con los controles y las firmas de RMA, Almacén (opcional), Seguridad y cliente." },
    ],
    pasos: [
      PASO(
        "Empezar el turno",
        "Seguridad · todos los días",
        "/seguridad",
        "- Abre el Dashboard: RMA por despachar, RMA por llegar y los RMA con más de 7 días sin despachar.\n- Abre Mercancía › Despachos, pestaña \"Para mí\": los pedidos que esperan en el portón o por calificar.\n- Revisa en Personal que todos los del turno tengan clave: sin clave no pueden firmar el acta de mercancía.\n\nCriterio de salida: sabes qué pedidos y equipos vas a atender en el turno.",
      ),
      PASO(
        "Verificar la mercancía en el portón",
        "Seguridad",
        "/seguridad/mercancia/egreso",
        "- Abre el despacho que está En portón (te avisa el cartel \"Despacho listo para verificar en portón\").\n- Lee la Nota del pedido: dice quién retira.\n- Pistolea todo lo que sale: cada serial en los productos que lo llevan y el código de los demás (suma 1 por lectura), o escribe la cantidad en la columna \"Portón\".\n- Si la pistola lee algo que no es de la orden, el panel pregunta \"¿Qué es?\": \"Es un serial\", \"No está en la orden\" (queda como novedad) o \"No es nada, ignorar\".\n- Si un producto no sale, marca \"No salió\" y escribe el motivo.\n\nCriterio de salida: nada en \"Faltan N por pistolear\" y las novedades a la vista.",
        "Un código UPC/EAN es el del modelo, no un serial: el panel avisa.",
      ),
      PASO(
        "Firmar el acta y decidir la salida",
        "Seguridad",
        "/seguridad/mercancia/egreso",
        "- En Firmas del acta pulsa \"Firmar\", elige tu nombre y escribe tu clave personal (\"Firmar con clave\").\n- Si todo cuadra: \"Aprobar y despachar\" (o \"Aprobar despacho parcial\" si Almacén armó un parcial).\n- Si hay novedades: \"Hay novedades: decidir\" y elige:\n  - \"Sí, despachar igual\": sale con la diferencia anotada.\n  - \"Despacho parcial\": sale solo lo contado.\n  - \"Devolver a Almacén\": vuelve para que corrijan.\n  - \"No se despacha (cancelado)\": la orden no sale.\n- Escribe el motivo y \"Registrar decisión\". Almacén recibe el aviso.\n\nCriterio de salida: decisión registrada y acta firmada.",
        "Antes de dejar salir, el panel vuelve a consultar Odoo: una orden cancelada o sin factura no sale. Si despachas igual o cancelas algo ya validado, avisa el mismo día a Almacén y al vendedor (propuesta).",
      ),
      PASO(
        "Calificar y cerrar el despacho",
        "Seguridad",
        "/seguridad/mercancia/egreso",
        "- En Por calificar, da de 1 a 5 estrellas al Picking (quien armó: completo, sin faltas ni sobras, seriales correctos) y al Despacho (quien entregó: empaquetado y orden en C4).\n- Si hubo novedades, devoluciones o rondas anteriores y das 4 o 5 al picking, el comentario es obligatorio.\n- Un despacho cancelado solo califica el picking.\n- \"Calificar y cerrar\".\n\nCriterio de salida: despacho Cerrado el mismo día en que salió (propuesta).",
      ),
      PASO(
        "Recibir un equipo de RMA",
        "Seguridad (con RMA)",
        "/seguridad/por-llegar",
        "- En Equipos por llegar están los clientes que reportaron un equipo en el portal. Toca el ticket o, en Ingreso, \"Nuevo ingreso\" y elige el ticket.\n- Revisa los datos del ticket (cliente, producto, serial, falla) y la garantía que calcula el panel.\n- Si el envío trae varios productos, marca cada uno \"Llegó\" o \"No llegó\".\n- Responde \"Accesorios íntegros\" y \"Sin manipulación\".\n- Elige quién recibe por Seguridad y por RMA y firmen los dos con el dedo.\n- \"Registrar ingreso\". El panel le avisa al cliente por correo y arranca el plazo de diagnóstico de RMA.\n- Abre el ingreso y pide al cliente que firme en \"Recibe / Entrega\". Imprime el acta si la pide.\n\nCriterio de salida: ingreso registrado con las firmas de Seguridad, RMA y cliente.",
        "Sin ticket no hay ingreso: si el cliente no lo tiene, que lo haga en el portal (servicio.supricom.com.ve) antes de dejar el equipo.",
      ),
      PASO(
        "Entregar un equipo de RMA",
        "Seguridad (con RMA)",
        "/seguridad/despacho",
        "- En Despacho, \"Listos para despachar\" muestra lo que RMA terminó. Pulsa \"Despachar\".\n- Revisa el resultado de RMA y cómo lo recibe el cliente (sucursal, ruta o encomienda).\n- Escribe el nombre de quien retira y, si son varios productos, marca los que salen.\n- Responde \"Accesorios íntegros\".\n- Firman el cliente, RMA y Seguridad.\n- \"Registrar despacho\" e \"Imprimir comprobante\" si lo pide.\n\nCriterio de salida: equipo entregado con las tres firmas.",
        "Un producto que sigue en revisión en RMA no se puede marcar: todavía no puede salir.",
      ),
      PASO(
        "Mantener al día el personal",
        "Seguridad",
        "/seguridad/config/personal",
        "- Agrega a cada persona nueva de Seguridad con su clave personal (4 a 6 números).\n- Si alguien olvida su clave, \"Cambiar clave\" pide la actual; si no la recuerda, avisa a soporte.\n- Da de baja a quien ya no trabaja en Seguridad.\n\nCriterio de salida: todos los activos tienen clave y nadie dado de baja firma.",
        "Cinco claves equivocadas bloquean a esa persona 15 minutos.",
      ),
    ],
    documentos:
      "REGISTROS\n- Despachos de mercancía: lecturas de la pistola, novedades, decisión con motivo, acta firmada y calificaciones en el panel.\n- RMA: actas de ingreso y despacho con controles, firmas y comprobante impreso en el panel.\n- Calificaciones de almacenistas: pantalla Almacenistas.\n\nINDICADORES (los revisa la Gerencia de Operaciones)\n- Despachos que salieron con novedades sin avisar a Almacén y Ventas. Meta: 0.\n- Despachos en Por calificar con más de un día. Meta: 0 (propuesta).\n- Actas de RMA con firmas faltantes. Meta: 0.\n- RMA con más de 7 días sin despachar (Dashboard). Meta: bajar cada mes.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Operaciones confirma lo marcado como propuesta (aviso de despachos con novedades y cierre en el día).",
      },
    ],
  },
};

export const TUTORIAL_SEGURIDAD: Semilla = {
  codigo: "TU-SEG-01",
  titulo: "Tutorial del panel: Seguridad",
  area: "Seguridad",
  version: "0.1",
  tipo: "tutorial",
  roles: ["seguridad"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Seguridad) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de Seguridad.\n- Ves solo lo de tu sede.\n- Tu menú tiene dos desplegables: RMA (equipos de servicio técnico) y Mercancía (lo que sale por el portón).\n- Para la mercancía firmas con tu clave personal; en las actas de RMA, con el dedo.\n- Cuando Almacén envía un pedido al portón sale un aviso en Mercancía › Despachos con el botón «Ver».",
    responsables: [],
    definiciones: [
      { termino: "En portón", definicion: "Despacho que Almacén ya envió y espera tu verificación." },
      { termino: "Por calificar", definicion: "Despacho que ya salió y espera tus estrellas." },
      { termino: "Pistolear", definicion: "Leer el serial o el código con la pistola." },
      { termino: "Novedad", definicion: "Algo que no cuadra con la orden." },
      { termino: "Ticket del portal", definicion: "Reporte del cliente antes de traer un equipo a servicio técnico." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/seguridad",
        "El resumen del mes de tu sede.\n- Botones \"Registrar ingreso\" y \"Registrar despacho\" para los equipos de RMA.\n- Indicadores: despachos de mercancía del mes, RMA ingresados y despachados, y la calificación de los despachos.\n- \"RMA con más de 7 días sin despachar\", \"RMA por despachar\" (cada fila abre su despacho) y \"RMA por llegar\".\n- La calificación de los almacenistas del mes.",
      ),
      PASO(
        "Mercancía › Despachos",
        "Menú › Mercancía › Despachos",
        "/seguridad/mercancia/egreso",
        "Los pedidos que salen por el portón, en pestañas Para mí, En proceso, Cerrados y Todos. A ti te tocan los que están En portón y Por calificar.\n\nAl abrir uno:\n- Arriba ves si le toca a Seguridad, los datos de la entrega (chofer, placa, quién retira) y los renglones.\n- Pistolea lo que sale. Si un código no es de la orden, el panel pregunta \"¿Qué es?\". Si algo no sale, marca \"No salió\" con el motivo.\n- \"Novedades de la verificación\" muestra lo que no cuadra y cuánto falta por pistolear.\n- \"Firmar\" en Firmas del acta: tu nombre y tu clave personal.\n- \"Aprobar y despachar\" si todo cuadra, o \"Hay novedades: decidir\" (despachar igual, parcial, devolver a Almacén o cancelar) con el motivo.\n- Después, en Por calificar: estrellas al Picking y al Despacho y \"Calificar y cerrar\".\n- También puedes imprimir el recibo de entrega y bajar el Excel de seriales.",
        "\"Aprobar y despachar\" no se activa mientras falte algo por pistolear, falte un motivo o falte tu firma.",
      ),
      PASO(
        "Mercancía › Almacenistas",
        "Menú › Mercancía › Almacenistas",
        "/seguridad/almacenista",
        "Las calificaciones de cada almacenista de tu sede.\n- Promedio y cantidad de calificaciones.\n- Al abrir uno: cómo se reparten sus estrellas y los últimos comentarios.\n- Es solo para consultar.",
      ),
      PASO(
        "RMA › Equipos por llegar",
        "Menú › RMA › Equipos por llegar",
        "/seguridad/por-llegar",
        "Los clientes que reportaron un equipo en el portal y todavía no lo traen (últimos 30 días).\n- Cada tarjeta: caso, fecha, cliente, producto y serial.\n- Toca \"Registrar ingreso\" cuando llegue: se abre el ingreso con el ticket ya elegido.\n- Cuando entra un reporte nuevo sale un aviso arriba.",
      ),
      PASO(
        "RMA › Ingreso",
        "Menú › RMA › Ingreso",
        "/seguridad/ingreso",
        "Los equipos recibidos en el mostrador. Busca por cliente, serial o factura, filtra por fechas o exporta a Excel.\n\n\"Nuevo ingreso\":\n- Elige el ticket del portal (obligatorio).\n- Revisa la garantía y los datos del ticket (no se editan).\n- Si son varios productos, marca \"Llegó\" o \"No llegó\" en cada uno.\n- Responde \"Accesorios íntegros\" y \"Sin manipulación\".\n- Elige quién recibe por Seguridad y por RMA, firmen con el dedo y pulsa \"Registrar ingreso\".\n\nAl abrir un ingreso: \"Imprimir acta\" y Firmas del acta, donde firma el cliente (\"Recibe / Entrega\").",
        "Una firma guardada no se puede cambiar. Si hubo un error, solo el SuperAdmin la rehace.",
      ),
      PASO(
        "RMA › Despacho",
        "Menú › RMA › Despacho",
        "/seguridad/despacho",
        "Las entregas de equipos reparados.\n- Arriba, \"Listos para despachar\": lo que RMA ya terminó, con el botón \"Despachar\".\n- En el despacho: el resultado de RMA, cómo lo recibe el cliente, el nombre de quien retira, los productos que salen y \"Accesorios íntegros\".\n- Firman el cliente, RMA y Seguridad. Pulsa \"Registrar despacho\".\n- Al abrirlo después: \"Imprimir comprobante\".",
      ),
      PASO(
        "Personal",
        "Menú › Personal",
        "/seguridad/config/personal",
        "Quién de Seguridad firma las actas.\n- \"Agregar persona\" con su nombre y su clave personal (4 a 6 números).\n- \"Asignar clave\" o \"Cambiar clave\" (pide la actual).\n- \"Dar de baja\" o \"Reactivar\".\n- El aviso de arriba dice quién todavía no tiene clave: sin clave no puede firmar el acta de mercancía.",
      ),
    ],
    documentos:
      "- No te deja aprobar un despacho: mira \"Novedades de la verificación\" (falta pistolear algo o hay algo que no cuadra) y que esté tu firma.\n- La clave no funciona: después de 5 intentos queda bloqueada 15 minutos. Si la olvidaste, avisa a soporte (IT).\n- El cliente trae un equipo sin ticket: tiene que reportarlo en el portal (servicio.supricom.com.ve) antes.\n- Un equipo no aparece en Listos para despachar: RMA todavía no terminó el caso.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Seguridad." }],
  },
};
