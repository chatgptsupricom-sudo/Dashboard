import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Almacén (name "almacen" en la tabla roles).
// Nombres de botones y pantallas del panel a nov-2026. El despacho paso a paso
// también está en PR-ALM-001 (Egreso de mercancía); este manual es la rutina
// completa del rol. Lo marcado "(propuesta)" lo confirma la Gerencia de
// Operaciones antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_ALMACEN: Semilla = {
  codigo: "MR-ALM-01",
  titulo: "Manual de Almacén",
  area: "Almacén",
  version: "0.1",
  tipo: "manual",
  roles: ["almacen"],
  contenido: {
    objetivo:
      "Que todo lo que entra y sale del almacén pase por el panel, contado y con sus seriales, para que el inventario de Odoo coincida con lo que hay en el almacén y quede constancia de quién hizo cada paso.\n\nEste manual es la rutina del rol: despachos, recepción de contenedores, catálogos, mantenimiento de las unidades y actas de RMA. El despacho detallado, con lo que hace Seguridad en el portón, está en PR-ALM-001 (Egreso de mercancía). Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica al personal de Almacén de Valencia, Caracas y Panamá.\n- Cubre: despacho de pedidos facturados, recepción de contenedores por packing list y recepción con factura, personal y unidades, mantenimiento de camiones y montacargas y firma de actas de RMA.\n- No cubre: la facturación, la verificación en el portón (Seguridad), la carga del packing list (Compras) ni el servicio técnico (RMA).\n\nREGLAS DEL ROL\n- A1. Nada sale ni entra sin pasar por el panel. Las órdenes de entrega y las recepciones no se validan a mano en Odoo: el panel las valida.\n- A2. Se cuenta lo que se ve, no lo que dice el papel. Si no coincide, se anota la diferencia con su motivo.\n- A3. Todo producto con serial se pistolea, unidad por unidad.\n- A4. Las cajas dañadas, húmedas o abiertas se registran con foto y motivo el mismo día.\n- A5. El personal, los choferes y las unidades se registran en el panel antes de usarlos.",
    responsables: [
      { rol: "Almacén", responsabilidad: "Hace los pasos de este manual. Responde por que lo contado y lo pistoleado sea lo que realmente salió o entró." },
      { rol: "Almacenista de armado", responsabilidad: "Arma el pedido y lo cuenta renglón por renglón. Su trabajo lo califica Seguridad (Picking)." },
      { rol: "Almacenista de despacho", responsabilidad: "Entrega el pedido en el portón. Su trabajo lo califica Seguridad (Despacho)." },
      { rol: "Seguridad", responsabilidad: "Verifica en el portón lo que sale, firma el acta y decide si sale, vuelve a Almacén o se cancela." },
      { rol: "Compras", responsabilidad: "Carga el packing list, elige la orden de compra y decide el reparto entre sedes. Crea la OC cuando falta." },
      { rol: "Vendedor / Asistente de Ventas", responsabilidad: "Indica el método de retiro de cada pedido. Sin él no se puede registrar el despacho." },
    ],
    definiciones: [
      { termino: "Egreso o despacho", definicion: "Registro del panel que sigue la salida de un pedido: Por armar → Armando → Pre-despacho → (Por empaquetar) → Por asignar despacho → En portón → Por calificar → Cerrado." },
      { termino: "Orden de despacho", definicion: "Orden de entrega de Odoo (ej. CENT1/OUT/06321). Aparece en el panel cuando está Lista (inventario apartado) y facturada." },
      { termino: "Despacho parcial", definicion: "Salida de solo una parte del pedido, con motivo. Lo que no sale queda pendiente en Odoo." },
      { termino: "Packing list", definicion: "Lista de lo que trae un embarque, por contenedor. La carga Compras; Almacén la cuenta." },
      { termino: "Precinto", definicion: "Sello del contenedor. Almacén escribe los que ve sin conocer los esperados; el panel los compara después." },
      { termino: "Recepción con factura", definicion: "Recepción sin contenedores, por el número de factura del proveedor (así recibe Caracas lo que le vende Valencia)." },
      { termino: "Factura Especial de Caracas", definicion: "Compra directa de Caracas que viaja en el mismo embarque. Se cuenta y se serializa, pero no entra al Odoo de la sede que recibe." },
      { termino: "Orden de mantenimiento", definicion: "Trabajo de taller de una unidad: Reportado → En el taller → Listo → Cerrado." },
    ],
    pasos: [
      PASO(
        "Empezar el turno",
        "Almacén · todos los días",
        "/seguridad/mercancia/dashboard",
        "- Abre el Dashboard: cuántos despachos hay en cada etapa y cuáles esperan a Almacén.\n- Abre Órdenes pendientes: lo que está facturado y listo en Odoo y todavía no tiene despacho. Empieza por las más antiguas y por \"Más de 7 días facturadas\".\n- Si una orden dice \"Sin método del vendedor\", pídeselo al vendedor: sin método no se puede registrar.\n- Abre Despachos de mercancía, pestaña \"Para mí\": lo que te toca seguir.\n- Anota el kilometraje de los camiones que van a salir (Mantenimiento de Unidades).\n\nCriterio de salida: sabes qué pedidos hay que armar hoy y ninguna unidad sale sin su kilometraje del día.",
      ),
      PASO(
        "Tener al día el personal y las unidades",
        "Almacén",
        "/seguridad/mercancia/personal",
        "- Un almacenista o chofer nuevo se agrega en Personal antes de su primer despacho.\n- Un camión nuevo se agrega en Gestionar Unidades con su placa; desde ahí aparece solo en Mantenimiento.\n- Seguridad no los registra: solo los elige de la lista.\n\nCriterio de salida: todos los que arman, despachan o manejan están en la lista.",
        "La pantalla no deja editar ni borrar. Si se registró un nombre mal, avisa a soporte (IT).",
      ),
      PASO(
        "Registrar y armar el despacho",
        "Almacén",
        "/seguridad/mercancia/ordenes",
        "- En Órdenes pendientes abre la orden y pulsa \"Registrar despacho con esta orden\" (o en Despachos de mercancía › Registrar, escribe la orden y \"Buscar\").\n- Elige el \"Almacenista del armado\", revisa el tipo de entrega y pulsa \"Guardar\". Queda en Por armar.\n- \"Iniciar armado\" al empezar y \"Terminar armado y pasar a pre-despacho\" al reunir todo.\n- En la columna \"Armado\" escribe cuántas unidades de cada producto hay y pulsa \"Verificar armado\". Solo avanza si todo está contado y coincide con la orden.\n- Si falta mercancía y el pedido sale igual, usa \"¿Es un despacho parcial?\" con el motivo y avisa al vendedor el mismo día.\n- Encomienda: empaqueta, identifica los bultos y pulsa \"Empaquetado listo\".\n\nCriterio de salida: despacho en Por asignar despacho, con el conteo igual a la orden.",
        "Si al guardar sale \"todavía no está Lista en Odoo\" o \"todavía no está facturada\", la orden no está para despachar: espera o avisa al vendedor.",
      ),
      PASO(
        "Pistolear seriales y enviar a Seguridad",
        "Almacén",
        "/seguridad/mercancia/egreso",
        "- En el despacho, pistolea en \"Pistolee aquí el serial de cada unidad…\" el serial de cada producto que lo lleva. Cada serial se carga solo en la orden de Odoo: no hace falta cargarlo allá.\n- Elige el \"Almacenista de despacho\" y, si es ruta, el \"Chofer\" y la \"Placa del vehículo\".\n- Pulsa \"Asignar y enviar a Seguridad\". El panel valida la orden en Odoo (descuenta el inventario) y el despacho pasa a En portón.\n- Imprime el recibo de entrega para el cliente.\n\nCriterio de salida: despacho En portón y orden validada en Odoo.",
        "No pasa si faltan seriales, si la unidad está en el taller o si la orden cambió en Odoo. Nunca valides la orden de entrega a mano en Odoo (regla A1).",
      ),
      PASO(
        "Atender lo que Seguridad devuelve",
        "Almacén",
        "/seguridad/mercancia/egreso",
        "- Si Seguridad devuelve el despacho, vuelve a \"Para mí\" en Por asignar despacho, con su motivo. Corrige (producto faltante, serial equivocado) y vuelve a \"Asignar y enviar a Seguridad\".\n- Si el cliente cambia la forma de retiro mientras el pedido está en Almacén, usa \"Cambiar método\". En el portón ya no se puede.\n- Si Seguridad cancela un despacho ya validado, avisa a tu supervisor y al vendedor el mismo día: la devolución en Odoo no es automática.\n\nCriterio de salida: ningún despacho devuelto queda más de un día sin corregir (propuesta).",
      ),
      PASO(
        "Recibir un contenedor",
        "Almacén",
        "/seguridad/mercancia/recepcion",
        "- En Recepción (packing list), pestaña Por llegar, abre el packing list que cargó Compras.\n- Cuando llega cada contenedor: toma la foto del contenedor al llegar y las fotos de los precintos, escribe los precintos que ves y pulsa \"Registrar llegada de este contenedor\".\n- Los precintos esperados no se muestran hasta registrar la llegada: escribe lo que ves, no lo que dice el papel.\n\nCriterio de salida: contenedor registrado con sus fotos y precintos.",
        "Si escribiste mal un precinto, \"Corregir precintos\" pide un motivo y queda registrado.",
      ),
      PASO(
        "Contar la descarga",
        "Almacén",
        "/seguridad/mercancia/recepcion",
        "- Cada teléfono elige el contenedor que descarga (\"¿Qué contenedor estás descargando?\"). Varios teléfonos pueden contar a la vez: el total se suma solo.\n- Los productos con serial se cuentan pistoleando (\"Pistolear seriales\"); si vienen en una lista, \"Subir seriales\".\n- Los demás, escribe la cantidad. Si no coincide con lo esperado, escribe el motivo de la diferencia.\n- Caja dañada, húmeda o abierta: márcala en \"Estado de la caja\" con cantidad, motivo y foto.\n- El conteo se guarda solo; \"Guardar avance\" fuerza el guardado.\n\nCriterio de salida: todos los renglones del contenedor contados, con motivo en las diferencias.",
      ),
      PASO(
        "Terminar el contenedor y cerrar el packing list",
        "Almacén",
        "/seguridad/mercancia/recepcion",
        "- Al vaciar el contenedor: foto del contenedor al terminar, notas si hacen falta y \"Terminar descarga de este contenedor\". Las observaciones salen por correo a Compras y Logística.\n- Cuando todos los contenedores están terminados, \"Cerrar packing list\". El recuadro \"Para cerrar falta:\" dice qué falta (contenedores, renglones sin contar, motivos, fotos de cajas).\n- Al cerrar, el panel carga en Odoo la recepción de la OC con los seriales y el traslado a Existencias. Lo que falta queda pendiente en Odoo.\n- Revisa el estado de la carga: \"Cargado en Odoo\", \"falta validar\" (la OC se valida una sola vez cuando llegó todo, con \"Validar la recepción de la OC: ya llegó todo\") o \"No se pudo cargar en Odoo\" (pulsa \"Cargar en Odoo\" para reintentar).\n- Si hay reparto entre Valencia y Caracas, baja el CSV del reparto para separar la mercancía.\n\nCriterio de salida: packing list cerrado y cargado en Odoo.",
        "Cerrada, la recepción ya no se edita. Si la carga dice que está frenada, no la cargues a mano en Odoo: avisa al SuperAdmin.",
      ),
      PASO(
        "Recibir con factura (Caracas)",
        "Almacén",
        "/seguridad/mercancia/recepcion/factura",
        "- En Recepción, pulsa \"Recibir con factura\", escribe el número de factura y \"Buscar\".\n- Revisa la orden de compra que propone el panel (mismo total y productos pendientes) y pulsa \"Empezar a recibir\".\n- Cuenta y pistolea como en un contenedor y cierra igual: se carga en Odoo al cerrar.\n\nCriterio de salida: recepción cerrada y cargada en Odoo.",
        "Si sale que la sede no tiene una OC pendiente, pídele a Compras que la cree y la confirme antes de recibir.",
      ),
      PASO(
        "Mantenimiento de las unidades",
        "Almacén · todos los días",
        "/seguridad/mercancia/mantenimiento",
        "- Anota el kilometraje de cada camión (u horas de cada montacargas) en \"Kilometraje de hoy\" y \"Guardar\". De ahí sale cuándo le toca cada servicio.\n- Cuando se hace un servicio (aceite, frenos…), márcalo \"Hecho\".\n- Si una unidad tiene una falla, \"Reportar mantenimiento\": tipo, prioridad, qué hay que hacerle y las tareas. Luego \"Pasar al taller\", \"Trabajo terminado\" y \"Recibir y devolver a operación\" con el costo.\n- Cuando un camión vuelve de ruta, \"Marcar regreso\".\n\nCriterio de salida: ningún servicio vencido sin orden de mantenimiento (propuesta).",
        "Una unidad en el taller no se puede asignar a un despacho.",
      ),
      PASO(
        "Firmar las actas de RMA",
        "Almacén",
        "/seguridad/mercancia/actas-rma",
        "- En Firmas de actas RMA están los ingresos y despachos de equipos de servicio técnico de tu sede de los últimos 45 días.\n- Abre los que dicen \"Por firmar\", elige quién firma y firma con el dedo.\n- La firma de Almacén es opcional: el acta vale con la de Seguridad (o RMA en Caracas) y el cliente.",
      ),
    ],
    documentos:
      "REGISTROS\n- Despachos: etapas, conteo, seriales, chofer, placa, recorrido y calificaciones en el panel; orden de entrega validada en Odoo.\n- Recepciones: fotos, precintos, conteo por contenedor, seriales, daños y observaciones en el panel; recepción y traslado en Odoo.\n- Unidades: kilometraje, servicios y órdenes de mantenimiento en el panel.\n\nINDICADORES (los revisa la Gerencia de Operaciones)\n- Órdenes con más de 7 días facturadas sin despacho. Meta: 0 (propuesta).\n- Despachos con novedades en el portón (Dashboard, \"Descuadres (30 días)\"). Meta: bajar cada mes.\n- Calificación promedio de Picking y Despacho. Meta: 4 o más (propuesta).\n- Órdenes de entrega o recepciones validadas a mano en Odoo. Meta: 0.\n- Recepciones que no se pudieron cargar en Odoo sin reintentar en el día. Meta: 0.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-11",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Operaciones confirma las metas marcadas como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_ALMACEN: Semilla = {
  codigo: "TU-ALM-01",
  titulo: "Tutorial del panel: Almacén",
  area: "Almacén",
  version: "0.1",
  tipo: "tutorial",
  roles: ["almacen"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina de Almacén) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de despachos de tu sucursal.\n- Ves solo lo de tu sede.\n- El panel funciona en el teléfono: la recepción de contenedores y el pistoleo de seriales están pensados para hacerse desde ahí, con la cámara o con la pistola.\n- Las pantallas se actualizan solas: cuando llega un despacho por armar o Seguridad decide algo, sale un aviso arriba con el botón «Ver».\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "Despacho", definicion: "La salida de un pedido facturado, desde que se registra hasta que Seguridad lo califica." },
      { termino: "Para mí", definicion: "Pestaña con los despachos que esperan algo de Almacén." },
      { termino: "Pre-despacho", definicion: "Etapa donde se cuenta lo armado contra la orden." },
      { termino: "Portón (C4)", definicion: "Donde Seguridad verifica lo que sale." },
      { termino: "Packing list", definicion: "Lo que trae un embarque, por contenedor." },
      { termino: "Pistolear", definicion: "Leer el código o el serial con la pistola o la cámara del teléfono." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/seguridad/mercancia/dashboard",
        "El resumen de los despachos de tu sucursal.\n- Arriba: despachos de hoy, pendientes de verificar, descuadres de los últimos 30 días y la calificación promedio.\n- \"Despachos en curso\": cuántos hay en cada etapa y si le toca a Almacén o a Seguridad.\n- \"Despachos recientes\" y \"Mejor calificados del mes\" (Picking y Despacho).\n- Botones \"Ver órdenes pendientes\" y \"Registrar\" para empezar un despacho.",
      ),
      PASO(
        "Órdenes pendientes",
        "Menú › Órdenes pendientes",
        "/seguridad/mercancia/ordenes",
        "Las órdenes de Odoo listas y facturadas que todavía no tienen despacho.\n- Arriba: por despachar, sin método del vendedor, más de 7 días facturadas, con alerta de ruta y listas sin facturar.\n- Busca por orden, cliente, factura o ruta, y filtra por método de retiro.\n- \"Ver detalle\" muestra cliente, factura y productos; \"Registrar despacho con esta orden\" abre el registro con la orden ya cargada.",
        "Una orden lista pero sin facturar no se puede despachar: aparece en \"Listas sin facturar\" hasta que Caja la facture.",
      ),
      PASO(
        "Despachos de mercancía",
        "Menú › Despachos de mercancía",
        "/seguridad/mercancia/egreso",
        "Todos los despachos, en pestañas: Para mí, En proceso, Cerrados y Todos. Filtra por tipo de entrega o exporta a Excel.\n\nAl abrir uno, arriba ves en qué etapa está y a quién le toca. Los botones de Almacén, en orden:\n- \"Iniciar armado\".\n- \"Terminar armado y pasar a pre-despacho\".\n- Escribe lo armado en la columna \"Armado\" y pulsa \"Verificar armado\" (o \"Confirmar despacho parcial\" si sale incompleto).\n- \"Empaquetado listo\", solo en encomiendas.\n- Pistolea los seriales, elige almacenista de despacho (y chofer y placa si es ruta) y pulsa \"Asignar y enviar a Seguridad\".\n- \"Imprimir recibo de entrega\".\n\nLo del portón (aprobar, firmar, calificar) lo hace Seguridad; tú lo ves en el mismo despacho.",
        "\"Asignar y enviar a Seguridad\" valida la orden en Odoo y descuenta el inventario: revisa bien antes.",
      ),
      PASO(
        "Registrar un despacho",
        "Despachos de mercancía › Registrar",
        "/seguridad/mercancia/egreso/nuevo",
        "- Escribe la orden de despacho (ej. CENT1/OUT/06321) y pulsa \"Buscar\". Los productos vienen de Odoo y no se editan.\n- Elige el \"Almacenista del armado\".\n- El \"Tipo de entrega\" viene del vendedor; si cambió, \"Cambiar método\".\n- Agrega observaciones si hace falta y pulsa \"Guardar\".",
        "Si dice que el vendedor no indicó el método, que no está facturada o que no está Lista en Odoo, no se puede registrar todavía.",
      ),
      PASO(
        "Recepción (packing list)",
        "Menú › Recepción (packing list)",
        "/seguridad/mercancia/recepcion",
        "Los contenedores que Compras cargó, en pestañas Por llegar, Descargando, Cerrados y Todos.\n\nAl abrir uno:\n- Contenedores: en cada uno, foto al llegar, fotos de los precintos, los precintos que ves y \"Registrar llegada de este contenedor\".\n- Conteo: elige qué contenedor descargas, cuenta cada renglón (los que tienen serial, con \"Pistolear seriales\" o \"Subir seriales\"), marca las cajas en mal estado con foto y escribe el motivo de cada diferencia. Se guarda solo.\n- \"Terminar descarga de este contenedor\" con la foto final.\n- \"Cerrar packing list\" cuando el recuadro \"Para cerrar falta:\" esté vacío.\n- Después ves cómo quedó la carga en Odoo y, si hace falta, \"Cargar en Odoo\" o \"Validar la recepción de la OC: ya llegó todo\".\n\nTambién puedes bajar los seriales en Excel, las observaciones en PDF y el CSV del reparto entre Valencia y Caracas.",
        "Varios teléfonos pueden contar a la vez, cada uno su contenedor: el total se suma solo.",
      ),
      PASO(
        "Recibir con factura",
        "Recepción › Recibir con factura",
        "/seguridad/mercancia/recepcion/factura",
        "Para recibir sin contenedores, por la factura del proveedor (lo usa Caracas).\n- Escribe el número de factura y pulsa \"Buscar\".\n- Revisa la factura y la orden de compra que propone el panel.\n- \"Empezar a recibir\": se abre la recepción para contar y cerrar como un packing list.",
      ),
      PASO(
        "Personal",
        "Menú › Personal",
        "/seguridad/mercancia/personal",
        "La lista de almacenistas y choferes de tu sede.\n- Escribe nombre y apellido y pulsa \"Agregar\" en el panel que corresponda.\n- Solo Almacén los registra; Seguridad y el despacho los eligen de esta lista.",
      ),
      PASO(
        "Gestionar Unidades",
        "Menú › Gestionar Unidades",
        "/seguridad/mercancia/unidades",
        "Los vehículos que salen a despachar.\n- Escribe la placa (y una descripción si quieres) y pulsa \"Agregar\".\n- Cada camión registrado aparece solo en Mantenimiento de Unidades.",
      ),
      PASO(
        "Mantenimiento de Unidades",
        "Menú › Mantenimiento de Unidades",
        "/seguridad/mercancia/mantenimiento",
        "El patio con los camiones y montacargas y en qué estado está cada uno (operativo, en ruta, por atender, en el taller, listo).\n- Elige un equipo y anota el \"Kilometraje de hoy\" (u horas). Con eso el panel dice cuándo le toca cada servicio; marca \"Hecho\" el que se hizo.\n- \"Reportar mantenimiento\" abre una orden con sus tareas. Sigue con \"Pasar al taller\", \"Trabajo terminado\" y \"Recibir y devolver a operación\".\n- \"Marcar regreso\" cuando un camión vuelve de ruta.\n- El \"Jefe de taller IA\" sugiere un plan o un diagnóstico; las órdenes las confirmas tú.\n- \"Agregar equipo\" para montacargas o camiones que no están en Unidades.",
      ),
      PASO(
        "Firmas de actas RMA",
        "Menú › Firmas de actas RMA",
        "/seguridad/mercancia/actas-rma",
        "Los ingresos y despachos de equipos de servicio técnico de tu sede (últimos 45 días), marcados \"Firmada\" o \"Por firmar\".\n- Abre uno, elige quién firma y firma con el dedo.\n- Es opcional.",
      ),
    ],
    documentos:
      "- Una orden no aparece en Órdenes pendientes: no está Lista en Odoo o no está facturada.\n- No te deja asignar el despacho: faltan seriales, la unidad está en el taller o el chofer, el almacenista o la placa no están registrados.\n- No te deja cerrar el packing list: lee el recuadro \"Para cerrar falta:\", ahí dice qué falta.\n- La carga en Odoo dio error: pulsa \"Cargar en Odoo\"; si dice que está frenada, avisa al SuperAdmin y no la cargues a mano en Odoo.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-11", descripcion: "Primera versión del recorrido por las pantallas de Almacén." }],
  },
};
