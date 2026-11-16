import type { Semilla } from "@/lib/manuales/semillas";

// Contenido base del rol Gerente de Marca (name "gerente de marca").
// Nombres de pantallas y botones del panel a nov-2026. Ve solo las marcas que
// el SuperAdmin le asigna por correo (enteras o solo Cómputo Corporativo),
// siempre en Valencia y Caracas, y solo lee. Lo marcado "(propuesta)" lo
// confirma la Dirección antes de publicar.

const PASO = (titulo: string, responsable: string, enlace: string, descripcion: string, nota = "") => ({
  titulo,
  responsable,
  enlace,
  descripcion,
  nota,
  imagenes: [] as number[],
});

export const MANUAL_GERENTE_MARCA: Semilla = {
  codigo: "MR-GMA-01",
  titulo: "Manual del Gerente de Marca",
  area: "Marcas",
  version: "0.1",
  tipo: "manual",
  roles: ["gerente de marca"],
  contenido: {
    objetivo:
      "Que cada marca tenga quien responda por ella: que su inventario no envejezca en el almacén, que su venta y su cobranza se sigan cada mes y que los vendedores tengan sus flyers para venderla.\n\nEste manual es la rutina del Gerente de Marca. Cómo se usa cada pantalla está en el Tutorial del menú.",
    alcance:
      "- Aplica a cada Gerente de Marca, con las marcas que el SuperAdmin le asigna (la marca entera o solo su línea Cómputo Corporativo, sin impresoras, consumibles ni papelería).\n- Siempre ve Valencia y Caracas, juntas o por separado.\n- Cubre: seguimiento de la venta y la cobranza de sus marcas, antigüedad del inventario, lo que viene en camino y los flyers.\n- El rol es de consulta: no cambia precios, compras ni flyers. Lo que decide lo lleva a Compras, Ventas o Marketing.\n\nREGLAS DEL ROL\n- G1. Si no ves tus marcas, pide a soporte o al SuperAdmin que te las asignen; nadie más puede hacerlo.\n- G2. El inventario de más de 90 días de cada marca tiene un plan para moverlo (promoción, cambio de precio, devolución al proveedor), acordado con Ventas y Compras (propuesta: cada mes).\n- G3. Un producto sin venta en 6 meses no se vuelve a comprar sin tu visto bueno (propuesta).\n- G4. Todo producto de tus marcas que se vende tiene su flyer en el banco; si falta, se lo pides a AdminLeads.",
    responsables: [
      { rol: "Gerente de Marca", responsabilidad: "Sigue sus marcas con este manual y propone las acciones para venderlas y mover el inventario." },
      { rol: "SuperAdmin", responsabilidad: "Asigna las marcas a cada gerente (entera o Cómputo Corporativo)." },
      { rol: "Compras", responsabilidad: "Decide qué y cuánto comprar; consulta al gerente lo que no rota." },
      { rol: "Gerencia de Ventas", responsabilidad: "Empuja la venta de las marcas con el equipo de vendedores." },
      { rol: "AdminLeads / Diseño", responsabilidad: "Hacen y suben los flyers de los productos." },
    ],
    definiciones: [
      { termino: "Cómputo Corporativo", definicion: "Toda la marca menos impresoras, consumibles y papelería." },
      { termino: "Existencia / Disponible", definicion: "Existencia = unidades en el almacén principal. Disponible = existencia menos lo reservado para pedidos." },
      { termino: "Antigüedad", definicion: "Días que lleva cada unidad en el almacén, en tramos de 0-30, 31-60, 61-90, 91-180 y más de 180 días." },
      { termino: "Antes de Odoo", definicion: "Inventario que venía de Smartbit y entró con la carga inicial de Odoo (antes del 7 de abril de 2026): sus días salen con «+» porque es como mínimo esa antigüedad." },
      { termino: "Facturado / Cobrado", definicion: "Facturado = facturas menos notas de crédito, sin IVA. Cobrado = la parte ya pagada de cada factura." },
    ],
    pasos: [
      PASO(
        "Revisar tus marcas cada semana",
        "Gerente de Marca · cada semana",
        "/gerente_marca",
        "- En el Dashboard revisa el inventario al costo, el disponible, lo facturado y lo cobrado del mes de tus marcas.\n- En la tarjeta de cada marca mira las unidades vendidas del mes y la barra de antigüedad.\n- Revisa la tabla \"Inventario sin venta en 6 meses\": los productos con más dinero parado.\n\nCriterio de salida: sabes qué marca va bien y cuál necesita una acción esta semana.",
      ),
      PASO(
        "Atacar el inventario viejo",
        "Gerente de Marca · cada mes (propuesta)",
        "/gerente_marca/antiguedad",
        "- En Antigüedad de inventario revisa el valor de más de 90 días por marca y por tipo de producto.\n- Abre el detalle por producto filtrando la antigüedad más alta y ordena por costo total: ahí está lo urgente.\n- Mira las ventas de los últimos 6 meses de cada producto: un total en rojo (0) es un producto que no se vende.\n- Arma con Ventas y Compras un plan para lo de más de 90 días (regla G2) y avisa a Compras qué no recomprar (regla G3).\n- Baja el Excel para la reunión.\n\nCriterio de salida: el inventario de más de 90 días de cada marca tiene un plan.",
        "Lo marcado \"Antes de Odoo\" puede ser más viejo de lo que dicen sus días: el «+» indica que es como mínimo esa antigüedad.",
      ),
      PASO(
        "Seguir la venta y la cobranza",
        "Gerente de Marca · cada semana",
        "/gerente_marca/ventas",
        "- En Ventas por marca elige Valencia y Caracas (o una) y el período.\n- Revisa facturado, cobrado y por cobrar de cada marca; haz clic en una marca para ver sus números de parte.\n- Comparte con la Gerencia de Ventas los números de parte que no se mueven.\n\nCriterio de salida: sabes cuánto vendió y cobró cada marca en el mes.",
        "Ventas por marca va desde abril de 2026: lo anterior está en Smartbit.",
      ),
      PASO(
        "Ver lo que hay y lo que viene",
        "Gerente de Marca · cada semana",
        "/gerente_marca/inventario",
        "- En Inventario por marca revisa existencia, disponible, por llegar y valor al costo de cada marca y producto.\n- Antes de que llegue mercancía nueva, revisa que no se sume a un producto que ya está viejo en el almacén.",
      ),
      PASO(
        "Tener los flyers listos",
        "Gerente de Marca",
        "/gerente_marca/banco-imagenes",
        "- En Banco de Flyers ves los flyers de tus productos y marcas: descárgalos con precio de Odoo, con precio personalizado o sin precio, sueltos, en un PDF o en un .zip.\n- Si a un producto que se vende le falta flyer, pídelo a AdminLeads (regla G4): tú no subes flyers.",
      ),
      PASO(
        "Organizar tu trabajo",
        "Gerente de Marca",
        "/gestion/actividades",
        "En Actividades crea tus tareas con fecha límite (\"+ Nueva Actividad\") y muévelas a En curso y Culminadas a medida que avanzas.",
      ),
    ],
    documentos:
      "REGISTROS\n- Tus actividades: panel.\n- Todo lo demás se lee de Odoo en vivo; los análisis se bajan en Excel (Antigüedad, Ventas e Inventario por marca).\n\nINDICADORES\n- Valor de inventario de más de 90 días por marca. Meta: bajar cada mes (propuesta).\n- Productos sin venta en 6 meses. Meta: bajar cada mes (propuesta).\n- Facturado y % cobrado del mes por marca.",
    cambios: [
      {
        version: "0.1",
        fecha: "2026-11-12",
        descripcion: "Borrador inicial. Pendiente: la Dirección confirma lo marcado como propuesta.",
      },
    ],
  },
};

export const TUTORIAL_GERENTE_MARCA: Semilla = {
  codigo: "TU-GMA-01",
  titulo: "Tutorial del panel: Gerente de Marca",
  area: "Marcas",
  version: "0.1",
  tipo: "tutorial",
  roles: ["gerente de marca"],
  contenido: {
    objetivo:
      "Bienvenido al panel de SUPRICOM. En este recorrido vas a ver, pantalla por pantalla, para qué sirve cada opción de tu menú y cómo se usa. Cada paso tiene el botón «Abrir esta pantalla» para que la pruebes mientras lees.\n\nQué hacer y cuándo (la rutina del Gerente de Marca) está en tu Manual.",
    alcance:
      "- Al entrar llegas a tu Dashboard.\n- Ves solo tus marcas (arriba, en «Marcas:»), siempre en Valencia y Caracas; eliges las dos juntas o una.\n- La sede que elijas se recuerda al pasar de una pantalla a otra.\n- Si no tienes marcas asignadas, el menú solo dice «Mis marcas» y las pantallas muestran «¡Ups!»: pide a soporte que te las asignen y recarga la página.\n- El rol es de consulta: no cambias nada en Odoo.",
    responsables: [],
    definiciones: [
      { termino: "Existencia", definicion: "Unidades en el almacén principal." },
      { termino: "Disponible", definicion: "Existencia menos lo reservado." },
      { termino: "Antes de Odoo", definicion: "Inventario de la carga inicial: sus días llevan «+»." },
      { termino: "Cómputo Corporativo", definicion: "La marca sin impresoras, consumibles ni papelería." },
    ],
    pasos: [
      PASO(
        "Dashboard",
        "Menú › Dashboard",
        "/gerente_marca",
        "El resumen de tus marcas.\n- Elige sede y actualiza desde Odoo.\n- Tarjetas: inventario al costo, disponible, facturado del mes y cobrado del mes.\n- Una tarjeta por marca con lo vendido del mes, inventario, facturado, % cobrado y la barra de antigüedad.\n- \"Inventario sin venta en 6 meses\": los 8 productos con más dinero parado.\n- Accesos directos a Inventario, Antigüedad, Ventas y Banco de Flyers.",
      ),
      PASO(
        "Antigüedad de inventario",
        "Menú › Antigüedad de inventario",
        "/gerente_marca/antiguedad",
        "Cuánto tiempo lleva cada producto en el almacén y cuánto se está vendiendo.\n- Tarjetas: inventario al costo, días promedio, más de 90 días y sin venta en 6 meses.\n- \"Total inventario por marca\": cada marca con sus tipos de producto, existencia, disponible, costo, días y la barra por tramos; haz clic en una fila para filtrar el detalle.\n- \"Detalle por producto\": busca o filtra por marca, tipo y antigüedad; ordena por cualquier columna. Muestra lo vendido en cada uno de los últimos 6 meses.\n- Excel con las dos hojas.",
      ),
      PASO(
        "Ventas por marca",
        "Menú › Ventas por marca",
        "/gerente_marca/ventas",
        "Lo facturado y cobrado de tus marcas.\n- Elige sede y período (mes, últimos 6 meses o año).\n- Tarjetas: facturado, cobrado, por cobrar y unidades.\n- \"Por marca\" (haz clic para filtrar) y \"Por número de parte\". Excel.",
      ),
      PASO(
        "Inventario por marca",
        "Menú › Inventario por marca",
        "/gerente_marca/inventario",
        "Existencia, disponible, por llegar y valor al costo de tus marcas y productos, por sede. Filtra por categoría y \"Solo con existencia o por llegar\". Excel.",
      ),
      PASO(
        "Banco de Flyers",
        "Menú › Banco de Flyers",
        "/gerente_marca/banco-imagenes",
        "Los flyers de tus productos y marcas.\n- Busca o filtra por categoría.\n- Abre un flyer: precio de Odoo o personalizado (arrastra la etiqueta) y descárgalo con o sin precio.\n- Con varios seleccionados: \"Editar seleccionados\" y bájalos sueltos, en un PDF o en un .zip.",
      ),
      PASO(
        "Actividades",
        "Menú › Actividades",
        "/gestion/actividades",
        "Tus tareas: \"+ Nueva Actividad\" (título, fecha límite, descripción) y el tablero de pendientes, en curso y culminadas.",
      ),
    ],
    documentos:
      "- Ves «¡Ups!… no tienes marcas asignadas»: pide a soporte o al SuperAdmin que te las asignen y recarga.\n- Falta una marca o ves productos de impresión que no son tuyos: tu marca está asignada entera o como Cómputo Corporativo; pide que la corrijan.\n- No encuentras el flyer de un producto: no está en el banco; pídeselo a AdminLeads.\n- Ventas por marca no muestra antes de abril de 2026: lo anterior está en Smartbit.\n- Cualquier otra falla del panel: avisa a soporte (IT) con una captura de la pantalla.",
    cambios: [{ version: "0.1", fecha: "2026-11-12", descripcion: "Primera versión del recorrido por las pantallas del Gerente de Marca." }],
  },
};
