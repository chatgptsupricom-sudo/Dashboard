import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Asistente de Ventas (name "asistente de ventas").
// Nombres de pantallas y botones del panel a nov-2026. Lo marcado
// "(propuesta)" lo confirma la Gerencia de Ventas antes de publicar. Su
// trabajo principal es el método de retiro de los pedidos de la sede.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_ASISTENTE_VENTAS: Semilla = {
  codigo: "MR-ASV-01",
  titulo: "Manual del Asistente de Ventas",
  area: "Ventas",
  version: "0.1",
  tipo: "manual",
  roles: ["asistente de ventas"],
  contenido: {
    objetivo:
      "Que ningún pedido de la sede se quede sin salir porque le falta el método de retiro, y que el equipo de ventas tenga a mano el catálogo, los estados de cuenta y cómo va contra su cuota.\n\nEste manual es la rutina del Asistente de Ventas. Cómo se usa cada pantalla está en el Tutorial del menú. El proceso de venta completo está en MP-VEN-00 y MP-VEN-01; el despacho, en PR-ALM-001.",
    alcance:
      "- Aplica a los Asistentes de Ventas de Valencia, Caracas y Panamá; cada uno ve su sede.\n- Cubre: método de retiro de los pedidos de todos los vendedores de la sede, apoyo al vendedor con catálogo y estados de cuenta, y seguimiento de la venta diaria, la cuota y el spiff.\n- No cubre: cotizar ni confirmar pedidos (vendedor), cambiar cuotas o reglas de spiff (Gerencia de Ventas) ni el despacho (Almacén).\n\nREGLAS DEL ROL\n- A1. Todos los pedidos confirmados de la sede tienen método de retiro antes del final del día en que se confirman (propuesta).\n- A2. El método lo decide el cliente con el vendedor: el asistente lo registra, no lo cambia sin confirmarlo con el vendedor.\n- A3. Un transporte externo se registra solo con la foto de la autorización firmada por el cliente.\n- A4. Si el pedido no llega al mínimo de ruta gratis, el vendedor avisa al cliente que el flete corre por su cuenta antes de despachar.",
    responsables: [
      { rol: "Asistente de Ventas", responsabilidad: "Registra el método de retiro de los pedidos de la sede y apoya al equipo de ventas. Responde por que ningún pedido quede sin método." },
      { rol: "Vendedor", responsabilidad: "Acuerda con el cliente cómo recibe el pedido y también puede registrar el método de los suyos." },
      { rol: "Gerencia de Ventas", responsabilidad: "Asigna las cuotas y las reglas de spiff." },
      { rol: "Almacén", responsabilidad: "Despacha los pedidos que tienen factura y método; desde que empieza el despacho, solo Almacén cambia el método." },
    ],
    definiciones: [
      { termino: "Método de retiro", definicion: "Cómo recibe el cliente el pedido: Retiro en sucursal, Por ruta, Encomienda o Transporte externo. Sin él, Almacén no puede despachar." },
      { termino: "Ruta gratis", definicion: "Monto mínimo sin IVA para que la ruta no cobre flete. Valencia: 300 $ en la ruta Valencia (Carabobo) y 1.000 $ en las demás. Panamá: 200 $, y 2.500 $ para Colón y La Chorrera. Caracas no aplica." },
      { termino: "Pedidos juntos", definicion: "Varios pedidos del mismo cliente que salen en el mismo viaje: la ruta gratis se calcula con la suma." },
      { termino: "En despacho", definicion: "Pedido que Almacén ya empezó a despachar: el método ya no se cambia desde Ventas." },
      { termino: "Cuota al día", definicion: "La parte de la cuota del mes que corresponde a los días hábiles ya pasados." },
    ],
    pasos: [
      PASO(
        "Registrar el método de retiro de los pedidos",
        "Asistente de Ventas · varias veces al día",
        "/gerente_venta/metodo-retiro",
        "- En Método de retiro abre la tarjeta \"Sin método\": son los pedidos de todos los vendedores de la sede que Almacén no puede despachar todavía.\n- Confirma con el vendedor cómo lo recibe el cliente (regla A2).\n- Abre al cliente: sus pedidos sin método quedan marcados. Si salen juntos, deja marcados todos (hasta 30, del mismo cliente).\n- Elige el método:\n  - Retiro en sucursal (nota opcional: quién retira, horario).\n  - Por ruta: elige la ruta de la sede.\n  - Encomienda: elige o escribe la agencia.\n  - Transporte externo: la compañía y la foto nítida de la autorización del cliente (regla A3).\n- Pulsa \"Guardar\" (o \"Guardar para N pedidos\").\n\nCriterio de salida: la tarjeta \"Sin método\" vacía al final del día (regla A1).",
        "Si el pedido no llega al mínimo de ruta gratis, el panel dice cuánto falta: avísale al vendedor para que lo acuerde con el cliente (regla A4).",
      ),
      PASO(
        "Revisar las alertas y los cambios",
        "Asistente de Ventas · todos los días",
        "/gerente_venta/metodo-retiro",
        "- En \"Con método\" revisa los pedidos con alerta en rojo: dirección fuera de Carabobo con la ruta Valencia, o \"Ya no es gratis\" porque lo facturado bajó.\n- Si el cliente cambia de idea antes del despacho, vuelve a guardar el método.\n- Si ya está \"En despacho\", el método solo lo cambia Almacén: avísale.",
      ),
      PASO(
        "Apoyar al vendedor con catálogo y estados de cuenta",
        "Asistente de Ventas · cuando lo piden",
        "/gerente_venta/catalogo",
        "- Catálogo: los productos con existencia de la sede. Busca, marca los que necesite el cliente y \"Exportar Excel\" con las columnas que quieras (referencia, nombre, marca, disponible, precio, imagen).\n- Estado de Cuentas: elige el vendedor, luego el cliente, y revisa lo que debe y sus facturas.\n\nCriterio de salida: el vendedor tiene lo que necesita para el cliente el mismo día (propuesta).",
      ),
      PASO(
        "Seguir la venta del día",
        "Asistente de Ventas · todos los días",
        "/gerente_venta/reporte-diario",
        "- Reporte Diario: la venta de cada vendedor contra su cuota al día. Baja el Excel si la Gerencia lo pide.\n- Cuota: cómo va cada vendedor en el mes (solo lectura; la cambia la Gerencia).\n- Spiff: lo ganado por vendedor y por regla, y las reglas vigentes (solo lectura).\n- Dashboard: las ventas del mes de la sede.",
      ),
    ],
    documentos:
      "REGISTROS\n- Método de retiro de cada pedido, quién lo indicó, la nota y la foto de la autorización: panel, Método de retiro.\n- El despacho y los cambios de método que hace Almacén: panel, Despachos de mercancía.\n\nINDICADORES\n- Pedidos confirmados sin método de retiro al final del día. Meta: 0 (propuesta).\n- Pedidos por transporte externo sin autorización del cliente. Meta: 0.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Gerencia de Ventas confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_ASISTENTE_VENTAS: Semilla = {
  codigo: "TU-ASV-01",
  titulo: "Tutorial del panel: Asistente de Ventas",
  area: "Ventas",
  version: "0.1",
  tipo: "tutorial",
  roles: ["asistente de ventas"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina del Asistente de Ventas) está en tu Manual.",
    alcance:
      "- Al entrar llegas al Dashboard de ventas de tu sede.\n- Todo es de tu sede; si tu usuario no tiene sede asignada, las pantallas no cargan: avisa a soporte.\n- Cuota y Spiff son de solo lectura para ti.\n- Puedes reordenar tu menú arrastrando las opciones.",
    responsables: [],
    definiciones: [
      { termino: "Método de retiro", definicion: "Cómo recibe el cliente su pedido." },
      { termino: "Ruta gratis", definicion: "Monto mínimo sin IVA para no cobrar el flete de la ruta." },
      { termino: "En despacho", definicion: "Almacén ya empezó a despacharlo: el método no se cambia." },
      { termino: "Cuota al día", definicion: "Lo que cada vendedor debería llevar según los días hábiles pasados." },
    ],
    pasos: [
      PASO(
        "Método de retiro",
        "Menú › Método de retiro",
        "/gerente_venta/metodo-retiro",
        "Los pedidos de todos los vendedores de tu sede, agrupados por cliente.\n- Tarjetas que filtran: Sin método (abre aquí), Con método, En despacho y Todos los pedidos.\n- Busca por cliente, pedido, factura u orden de despacho; filtra por método, facturación y vendedor; ordena por antigüedad o monto.\n- Abre un cliente, marca los pedidos (\"Elegir todos\" o uno por uno), elige el método y \"Guardar\".\n- Cada pedido con método muestra cuál, con qué otros va, quién lo indicó, la autorización y las alertas.",
        "Transporte externo pide la compañía y la foto de la autorización del cliente (JPG, PNG o WEBP, hasta 15 MB).",
      ),
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/gerente_venta",
        "Las ventas de tu sede: ventas del mes, producto estrella, clientes activos, crecimiento, historial, top vendedores, marcas y productos. Elige el mes o un rango.",
      ),
      PASO(
        "Reporte Diario",
        "Menú › Reporte Diario",
        "/gerente_venta/reporte-diario",
        "La venta de cada vendedor contra su cuota al día, con el ranking y su gráfica. Elige la fecha; botón Excel.",
      ),
      PASO(
        "Cuota",
        "Menú › Cuota",
        "/gerente_venta/cuota",
        "Las metas del mes de cada vendedor: progreso, meta, facturado, cuánto falta y el ritmo necesario por día. Solo lectura.",
      ),
      PASO(
        "Spiff",
        "Menú › Spiff",
        "/gerente_venta/spiff",
        "Los incentivos de tu sede.\n- \"Resumen del mes\": lo ganado por vendedor y por regla.\n- \"Reglas\": las reglas vigentes y el ranking de cada una, con las facturas de cada vendedor. Solo lectura.",
      ),
      PASO(
        "Catálogo",
        "Menú › Catálogo",
        "/gerente_venta/catalogo",
        "Los productos con existencia de tu sede.\n- Busca por nombre, referencia o código de barras, o elige una categoría.\n- Marca productos o \"Seleccionar los N filtrados\".\n- \"Exportar Excel\": elige las columnas y si va todo en una sola hoja.",
      ),
      PASO(
        "Estado de Cuentas",
        "Menú › Estado de Cuentas",
        "/gerente_venta/estado-cuenta",
        "Lo que deben los clientes, por vendedor.\n- Elige el vendedor, luego el cliente: su antigüedad de deuda y sus facturas.\n- Haz clic en una factura para ver su detalle.",
      ),
    ],
    documentos:
      "- Un pedido no aparece en Método de retiro: no tiene orden de despacho pendiente, ya salió o está cancelado.\n- No puedes marcar un pedido: Almacén ya lo está despachando; si hay que cambiarlo, avísale a Almacén.\n- No puedes juntar pedidos: tienen que ser del mismo cliente y de la misma sede, hasta 30.\n- Al guardar transporte externo dice que no encuentra la foto: vuelve a adjuntarla.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas del Asistente de Ventas." }],
  },
};
