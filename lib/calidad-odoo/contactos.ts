import type { Chequeo, Columna, Fila } from "./tipos";
import type { Contacto, Equipo, Etiqueta, Usuario } from "./odoo";
import { compacto, ejemplos, espaciosDeMas, marcarEspacios, nombreBase, palabras, repetidos } from "./texto";

/**
 * Chequeos de contactos (clientes y proveedores) y de cómo están
 * segmentados (etiquetas, equipos de venta, vendedor asignado).
 */

const VENEZUELA = 238;

const rol = (c: Contacto) => [c.cliente && "Cliente", c.proveedor && "Proveedor"].filter(Boolean).join(" y ");

const fila = (c: Contacto, extra: Record<string, unknown> = {}, grupo?: string): Fila => ({
  id: c.id,
  modelo: "res.partner",
  companyId: c.companyId,
  ...(grupo ? { grupo } : {}),
  contacto: c.nombre,
  rif: c.rif,
  rol: rol(c),
  vendedor: c.vendedor?.[1] ?? "",
  creadoPor: c.creadoPor,
  ...extra,
});

const COL_BASE: Columna[] = [
  { clave: "contacto", titulo: "Contacto" },
  { clave: "rif", titulo: "RIF / RUC" },
  { clave: "rol", titulo: "Es" },
];
const COL_FIN: Columna[] = [
  { clave: "vendedor", titulo: "Vendedor" },
  { clave: "creadoPor", titulo: "Creado por" },
];

/** RIF venezolano normalizado: letra + 9 dígitos (cédula V/E: 6 a 9 dígitos). */
const RIF_VE = /^([JGPC]\d{9}|[VE]\d{6,9})$/;

/** ¿El RIF/RUC no puede ser válido? (no la verificación del dígito, solo la forma). */
function rifInvalido(c: Contacto): string | null {
  const v = compacto(c.rif);
  if (!v) return null;
  if (/^(\d)\1+$/.test(v.replace(/^[A-Z]/, "")) || /^1234567/.test(v.replace(/^[A-Z]/, ""))) return "Número de relleno";
  if (c.pais?.[0] === VENEZUELA) {
    if (RIF_VE.test(v)) return null;
    if (/^[JGPC]\d+$/.test(v)) return `Le ${v.length - 1 < 9 ? "faltan" : "sobran"} dígitos (${v.length - 1} de 9)`;
    if (/^\d{1,10}-\d{1,4}-\d+/.test(c.rif.trim())) return "Parece un RUC de Panamá: revisar el país del contacto";
    if (/^\d+$/.test(v)) return "Sin letra (V, E, J, G, P)";
    return "No tiene forma de RIF";
  }
  if ((v.match(/\d/g) || []).length < 4) return "Es texto, no un número de identificación";
  return null;
}

/** RIF válido pero escrito con guiones, puntos o espacios (el estándar en Odoo es J123456789). */
const rifConSignos = (c: Contacto) =>
  c.pais?.[0] === VENEZUELA && !!c.rif && RIF_VE.test(compacto(c.rif)) && c.rif !== compacto(c.rif);

const EMAIL = /^[^\s@,;/]+@[^\s@,;/]+\.[a-z]{2,}$/i;

function telefonoMalo(t: string): boolean {
  const d = t.replace(/\D/g, "");
  return !!t.trim() && (d.length < 7 || /^(\d)\1+$/.test(d) || /^0?1234567/.test(d));
}

/** Nombre de usuario genérico usado como vendedor ("Asistente de Ventas"). */
const VENDEDOR_GENERICO = /asistente|administrador|admin\b|caja|ventas\b|tienda|general/i;

export function chequeosContactos(
  contactos: Contacto[],
  paisEstado: Map<number, number>,
  usuarios: Usuario[],
): Chequeo[] {
  const clientes = contactos.filter((c) => c.cliente);
  const usuario = new Map(usuarios.map((u) => [u.id, u]));
  const salida: Chequeo[] = [];

  // ── Duplicados por RIF ──
  const porRif = repetidos(contactos, (c) => {
    const v = compacto(c.rif);
    return v.length >= 6 && !rifInvalido(c) ? `${c.companyId}|${v}` : null;
  });
  const enGrupoRif = new Set(porRif.flat().map((c) => c.id));
  salida.push({
    id: "contactos-rif-duplicado",
    area: "contactos",
    severidad: "error",
    titulo: "Contactos duplicados (mismo RIF en la misma sede)",
    descripcion: `Grupos de contactos con el mismo RIF/RUC dentro de la misma empresa.`,
    porQue: "Las ventas, cobranzas y el estado de cuenta del cliente quedan repartidos entre dos fichas: el saldo de una no se ve en la otra, el crédito se controla mal y los reportes por cliente cuentan dos clientes donde hay uno.",
    pasos: [
      "En Contactos, buscar el RIF del grupo para ver todas las fichas.",
      "Decidir cuál ficha se queda (la que tiene el nombre fiscal correcto y más movimientos).",
      "Seleccionar las fichas en la vista de lista → Acción → Fusionar, y elegir la ficha destino. Odoo pasa facturas, pagos y pedidos a la ficha que queda.",
      "Si en realidad son dos clientes distintos (por ejemplo una sucursal), corregir el RIF de la ficha que está mal o convertirla en dirección hija de la principal.",
    ],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: porRif.flatMap((g) => g.map((c) => fila(c, {}, compacto(c.rif)))),
  });

  // ── Duplicados por nombre (con RIF distinto o sin RIF) ──
  const porNombre = repetidos(contactos, (c) => {
    const n = nombreBase(c.nombre);
    return n.length >= 5 ? `${c.companyId}|${n}` : null;
  }).filter((g) => !g.every((c) => enGrupoRif.has(c.id)));
  salida.push({
    id: "contactos-nombre-duplicado",
    area: "contactos",
    severidad: "atencion",
    titulo: "Posibles duplicados por nombre",
    descripcion: `Grupos de contactos con el mismo nombre (sin contar C.A., S.A., signos ni mayúsculas) y RIF distinto o vacío.`,
    porQue: "Casi siempre es el mismo cliente creado dos veces, una de ellas sin RIF o con el RIF mal escrito. Mismo efecto que un duplicado por RIF.",
    pasos: [
      "Abrir las fichas del grupo y comparar RIF, dirección y teléfono.",
      "Si es el mismo cliente: corregir el RIF de la ficha buena y fusionar (lista de Contactos → seleccionar → Acción → Fusionar).",
      "Si son distintos, diferenciar el nombre (por ejemplo, agregar la sucursal) para que no se confundan al facturar.",
    ],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: porNombre.flatMap((g) => g.map((c) => fila(c, {}, nombreBase(c.nombre)))),
  });

  // ── Sin RIF ──
  const sinRif = contactos.filter((c) => !c.rif.trim() && !/consumidor|end consumer/i.test(c.tipoId));
  salida.push({
    id: "contactos-sin-rif",
    area: "contactos",
    severidad: "error",
    titulo: "Clientes y proveedores sin RIF / RUC",
    descripcion: `Contactos comerciales sin número de identificación fiscal.`,
    porQue: "Una factura a un cliente sin RIF no cumple con el SENIAT/DGI, no se puede declarar bien la retención y el cliente no se puede identificar ni buscar por RIF (origen típico de duplicados).",
    pasos: [
      "Abrir el contacto y cargar el RIF en el campo de identificación fiscal (formato J123456789, sin guiones).",
      "Si el contacto es un duplicado de otro que sí tiene RIF, fusionarlos en vez de cargarlo dos veces.",
      "Si es un consumidor final (Panamá), cambiar el tipo de identificación a «Consumidor Final».",
    ],
    columnas: [...COL_BASE, { clave: "pais", titulo: "País" }, ...COL_FIN],
    filas: sinRif.map((c) => fila(c, { pais: c.pais?.[1] ?? "" })),
  });

  // ── RIF inválido ──
  const invalidos = contactos.map((c) => ({ c, motivo: rifInvalido(c) })).filter((x) => x.motivo);
  salida.push({
    id: "contactos-rif-invalido",
    area: "contactos",
    severidad: "error",
    titulo: "RIF / RUC mal escrito",
    descripcion: `Contactos con un número de identificación que no puede ser válido (dígitos de más o de menos, texto, números de relleno).`,
    porQue: "Un RIF mal escrito sale así en la factura fiscal y en los libros de venta y retenciones; además impide encontrar al cliente por RIF y genera duplicados.",
    pasos: [
      "Verificar el RIF correcto (en el SENIAT, el RIF del cliente en una factura anterior o con el vendedor).",
      "Corregirlo en la ficha del contacto, sin guiones ni puntos: letra + 9 dígitos (ej. J123456789; cédulas V12345678).",
      "En Venezuela el país del contacto debe ser Venezuela; en extranjeros, cargar su número fiscal real, no el nombre de la empresa.",
    ],
    columnas: [...COL_BASE, { clave: "motivo", titulo: "Problema" }, { clave: "pais", titulo: "País" }, ...COL_FIN],
    filas: invalidos.map(({ c, motivo }) => fila(c, { motivo, pais: c.pais?.[1] ?? "" })),
  });

  // ── RIF con guiones / puntos ──
  const conSignos = contactos.filter(rifConSignos);
  salida.push({
    id: "contactos-rif-formato",
    area: "contactos",
    severidad: "mejora",
    titulo: "RIF con guiones, puntos o espacios",
    descripcion: `RIF venezolanos válidos pero escritos distinto al estándar (J123456789).`,
    porQue: "El 90% de los RIF en Odoo están sin signos. Los que tienen guiones o puntos no aparecen al buscar el RIF «limpio», y así se crean duplicados.",
    pasos: ["Abrir el contacto y reescribir el RIF sin guiones, puntos ni espacios (ej. V-16.497.149-6 → V164971496)."],
    columnas: [...COL_BASE, { clave: "sugerido", titulo: "Debería ser" }, ...COL_FIN],
    filas: conSignos.map((c) => fila(c, { sugerido: compacto(c.rif) })),
  });

  // ── Estado de otro país / sin país ──
  const ubicacion = contactos
    .map((c) => {
      if (!c.pais) return { c, motivo: "Sin país" };
      if (c.estado && paisEstado.get(c.estado[0]) && paisEstado.get(c.estado[0]) !== c.pais[0])
        return { c, motivo: `El estado «${c.estado[1]}» es de otro país` };
      return { c, motivo: "" };
    })
    .filter((x) => x.motivo);
  salida.push({
    id: "contactos-ubicacion",
    area: "contactos",
    severidad: "error",
    titulo: "Estado de otro país o contacto sin país",
    descripcion: `Contactos con un estado que no pertenece a su país o sin país${ejemplos(ubicacion.filter((x) => x.c.estado).map(({ c }) => `«${c.estado![1]}» en un contacto de ${c.pais?.[1]}`))}.`,
    porQue: "Los reportes de ventas por estado/zona y el mapa de clientes los ubican mal, y la localización fiscal (Venezuela/Panamá) depende del país del contacto.",
    pasos: [
      "Abrir el contacto y, en la dirección, elegir el estado correcto del país correcto (en la lista aparece el código del país entre paréntesis: (VE), (PA)).",
      "Si falta el país, cargarlo (Venezuela para clientes de Valencia y Caracas, salvo extranjeros).",
    ],
    columnas: [...COL_BASE, { clave: "motivo", titulo: "Problema" }, { clave: "pais", titulo: "País" }, { clave: "estado", titulo: "Estado" }, { clave: "ciudad", titulo: "Ciudad" }],
    filas: ubicacion.map(({ c, motivo }) => fila(c, { motivo, pais: c.pais?.[1] ?? "", estado: c.estado?.[1] ?? "", ciudad: c.ciudad })),
  });

  // ── Clientes sin estado ──
  const sinEstado = clientes.filter((c) => c.pais && !c.estado && c.companyId != null);
  salida.push({
    id: "contactos-sin-estado",
    area: "contactos",
    severidad: "mejora",
    titulo: "Clientes sin estado / provincia",
    descripcion: `Clientes sin estado en la dirección.`,
    porQue: "Sin estado el cliente no aparece en los reportes por zona ni en el mapa de clientes, y no se puede analizar la venta por región.",
    pasos: ["Abrir el cliente y completar estado/provincia y ciudad en la dirección."],
    columnas: [...COL_BASE, { clave: "ciudad", titulo: "Ciudad" }, ...COL_FIN],
    filas: sinEstado.map((c) => fila(c, { ciudad: c.ciudad })),
  });

  // ── Ciudad = estado ──
  const ciudadEstado = contactos.filter(
    (c) => c.ciudad && c.estado && palabras(c.ciudad) === palabras(c.estado[1].replace(/\s*\([A-Z]{2}\)\s*$/, "")),
  );
  salida.push({
    id: "contactos-ciudad-es-estado",
    area: "contactos",
    severidad: "mejora",
    titulo: "Ciudad cargada con el nombre del estado",
    descripcion: `Contactos donde la ciudad dice lo mismo que el estado (ej. ciudad «Carabobo»).`,
    porQue: "Viene de la importación inicial. No se puede saber en qué ciudad está el cliente (Valencia, Puerto Cabello, Maracay…) para rutas de despacho o análisis por zona.",
    pasos: ["Abrir el contacto y reemplazar la ciudad por la real (la calle suele decirla).", "Se puede hacer en lote desde la vista de lista de Contactos editando la columna Ciudad."],
    columnas: [...COL_BASE, { clave: "ciudad", titulo: "Ciudad" }, { clave: "estado", titulo: "Estado" }, ...COL_FIN],
    filas: ciudadEstado.map((c) => fila(c, { ciudad: c.ciudad, estado: c.estado?.[1] ?? "" })),
  });

  // ── Correo inválido ──
  const emailMalo = contactos.filter((c) => c.email.trim() && !EMAIL.test(c.email.trim()));
  salida.push({
    id: "contactos-email-invalido",
    area: "contactos",
    severidad: "error",
    titulo: "Correo electrónico mal escrito",
    descripcion: `Contactos con un correo que no puede recibir mensajes (sin @, sin punto, dos correos en el mismo campo, relleno).`,
    porQue: "Las facturas electrónicas, estados de cuenta y recordatorios de cobro que Odoo envía por correo no le llegan al cliente.",
    pasos: [
      "Abrir el contacto y corregir el correo (un solo correo por campo).",
      "Si el cliente tiene varios correos, crear contactos hijos (Contactos y direcciones) con cada uno.",
    ],
    columnas: [...COL_BASE, { clave: "email", titulo: "Correo" }, ...COL_FIN],
    filas: emailMalo.map((c) => fila(c, { email: c.email })),
  });

  // ── Teléfono de relleno ──
  const telMalo = contactos.filter((c) => telefonoMalo(c.telefono) || telefonoMalo(c.movil));
  salida.push({
    id: "contactos-telefono-invalido",
    area: "contactos",
    severidad: "atencion",
    titulo: "Teléfono incompleto o de relleno",
    descripcion: `Contactos con un teléfono de menos de 7 dígitos o de relleno («123», «0000000»).`,
    porQue: "No se puede llamar al cliente para cobrar o coordinar despachos, y WhatsApp desde Odoo no funciona.",
    pasos: ["Abrir el contacto y cargar el teléfono completo con código de área (ej. 0414-1234567 / +507 6123-4567), o dejarlo vacío si no se conoce."],
    columnas: [...COL_BASE, { clave: "telefono", titulo: "Teléfono" }, { clave: "movil", titulo: "Móvil" }, ...COL_FIN],
    filas: telMalo.map((c) => fila(c, { telefono: c.telefono, movil: c.movil })),
  });

  // ── Sin forma de contacto ──
  const incomunicados = clientes.filter((c) => !c.email.trim() && !c.telefono.trim() && !c.movil.trim());
  salida.push({
    id: "contactos-sin-contacto",
    area: "contactos",
    severidad: "atencion",
    titulo: "Clientes sin teléfono ni correo",
    descripcion: `Clientes sin ninguna forma de contacto.`,
    porQue: "No hay cómo enviarles la factura, cobrarles ni avisarles de un despacho.",
    pasos: ["Pedir los datos al vendedor asignado y cargarlos en la ficha del cliente."],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: incomunicados.map((c) => fila(c)),
  });

  // ── Nombre con espacios de más ──
  const espacios = contactos.filter((c) => espaciosDeMas(c.nombre));
  salida.push({
    id: "contactos-nombre-espacios",
    area: "contactos",
    severidad: "mejora",
    titulo: "Nombres con espacios de más",
    descripcion: `Contactos con espacios al inicio, al final o dobles en el nombre (en la tabla se ven como «·»).`,
    porQue: "Al buscar el cliente por nombre no aparece, los reportes lo ordenan fuera de lugar y es una de las causas de que se creen duplicados.",
    pasos: ["Abrir el contacto y reescribir el nombre sin espacios sobrantes."],
    columnas: [{ clave: "visible", titulo: "Nombre (· = espacio de más)" }, ...COL_BASE.slice(1), ...COL_FIN],
    filas: espacios.map((c) => fila(c, { visible: marcarEspacios(c.nombre) })),
  });

  // ── Nombre en minúsculas / signos raros ──
  const raros = contactos
    .map((c) => {
      const motivos: string[] = [];
      if (/[a-zñáéíóú]/.test(c.nombre)) motivos.push("Minúsculas (el resto está en MAYÚSCULAS)");
      if (/[`´_|@;]/.test(c.nombre)) motivos.push("Signos raros (` ´ _ | @ ;)");
      return { c, motivo: motivos.join(" · ") };
    })
    .filter((x) => x.motivo);
  salida.push({
    id: "contactos-nombre-formato",
    area: "contactos",
    severidad: "mejora",
    titulo: "Nombres fuera del formato",
    descripcion: `Contactos escritos en minúsculas o con signos que no van (el estándar en Odoo es el nombre fiscal en MAYÚSCULAS).`,
    porQue: "El nombre sale así en la factura fiscal. Mantener un solo formato facilita buscar y evita duplicados.",
    pasos: ["Reescribir el nombre en MAYÚSCULAS, tal como aparece en el RIF, cambiando ´ o ` por apóstrofo ' y quitando _ | @."],
    columnas: [...COL_BASE, { clave: "motivo", titulo: "Problema" }, ...COL_FIN],
    filas: raros.map(({ c, motivo }) => fila(c, { motivo })),
  });

  // ── Persona / empresa mal marcado ──
  const tipoMal = contactos
    .filter((c) => c.pais?.[0] === VENEZUELA)
    .map((c) => {
      const v = compacto(c.rif);
      if (c.esEmpresa && /^[VE]\d/.test(v)) return { c, motivo: "Marcado como Empresa pero el RIF es de persona (V/E)" };
      if (!c.esEmpresa && /^[JG]\d/.test(v)) return { c, motivo: "Marcado como Persona pero el RIF es de empresa (J/G)" };
      return { c, motivo: "" };
    })
    .filter((x) => x.motivo);
  salida.push({
    id: "contactos-persona-empresa",
    area: "contactos",
    severidad: "mejora",
    titulo: "Persona o empresa mal marcada",
    descripcion: `Contactos donde el tipo (Persona / Empresa) no coincide con la letra del RIF.`,
    porQue: "Afecta las retenciones de ISLR (persona natural y jurídica retienen distinto) y los reportes de clientes por tipo.",
    pasos: ["Abrir el contacto y, arriba del nombre, marcar «Persona» o «Empresa» según el RIF (V/E = persona, J/G = empresa). Si la letra del RIF es la que está mal, corregir el RIF."],
    columnas: [...COL_BASE, { clave: "motivo", titulo: "Problema" }, ...COL_FIN],
    filas: tipoMal.map(({ c, motivo }) => fila(c, { motivo })),
  });

  // ── Vendedor ──
  const sinVendedor = clientes.filter((c) => !c.vendedor && c.companyId != null);
  salida.push({
    id: "clientes-sin-vendedor",
    area: "segmentacion",
    severidad: "atencion",
    titulo: "Clientes sin vendedor asignado",
    descripcion: `Clientes sin vendedor en la ficha.`,
    porQue: "El pedido nuevo de ese cliente no trae vendedor, la venta y la comisión quedan sin dueño y el cliente no aparece en la cartera de nadie.",
    pasos: ["Abrir el cliente → pestaña Ventas y compras → campo Vendedor.", "Para varios a la vez: vista de lista de Contactos, seleccionar, y editar la columna Vendedor."],
    columnas: [...COL_BASE, { clave: "creadoPor", titulo: "Creado por" }],
    filas: sinVendedor.map((c) => fila(c)),
  });

  const vendInactivo = clientes.filter((c) => c.vendedor && usuario.get(c.vendedor[0]) && !usuario.get(c.vendedor[0])!.activo);
  salida.push({
    id: "clientes-vendedor-inactivo",
    area: "segmentacion",
    severidad: "error",
    titulo: "Clientes asignados a un vendedor que ya no está",
    descripcion: `Clientes cuyo vendedor es un usuario archivado en Odoo.`,
    porQue: "Son clientes huérfanos: nadie los atiende, sus pedidos nuevos salen a nombre de alguien que ya no trabaja y las comisiones y metas por vendedor no los cuentan.",
    pasos: ["Definir con el gerente de ventas a quién se reasigna la cartera.", "Vista de lista de Contactos → filtrar por el vendedor → seleccionar todos → editar Vendedor."],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: vendInactivo.map((c) => fila(c)),
  });

  const vendOtraSede = clientes.filter((c) => {
    const u = c.vendedor && usuario.get(c.vendedor[0]);
    return u && u.activo && c.companyId != null && !u.companyIds.includes(c.companyId);
  });
  salida.push({
    id: "clientes-vendedor-otra-sede",
    area: "segmentacion",
    severidad: "error",
    titulo: "Clientes con un vendedor de otra sede",
    descripcion: `Clientes de una sede asignados a un vendedor que no tiene acceso a esa empresa.`,
    porQue: "El vendedor no puede ver ni facturar a ese cliente, y la venta se atribuye a la sede equivocada en los reportes por vendedor.",
    pasos: ["Abrir el cliente → Ventas y compras → cambiar el Vendedor por uno de la sede del cliente."],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: vendOtraSede.map((c) => fila(c)),
  });

  const vendGenerico = clientes.filter((c) => c.vendedor && VENDEDOR_GENERICO.test(c.vendedor[1]));
  salida.push({
    id: "clientes-vendedor-generico",
    area: "segmentacion",
    severidad: "mejora",
    titulo: "Clientes asignados a un usuario genérico",
    descripcion: `Clientes cuyo vendedor es un usuario de uso común («Asistente de Ventas», etc.), no una persona.`,
    porQue: "No hay un responsable real del cliente: no se le hace seguimiento y su venta no suma a la meta de ningún vendedor.",
    pasos: ["Asignar cada cliente a un vendedor real (vista de lista de Contactos → filtrar por el usuario genérico → editar Vendedor)."],
    columnas: [...COL_BASE, ...COL_FIN],
    filas: vendGenerico.map((c) => fila(c)),
  });

  return salida;
}

/** Etiquetas de contacto y equipos de venta: cómo está armada la segmentación. */
export function chequeosSegmentacion(contactos: Contacto[], etiquetas: Etiqueta[], equipos: Equipo[]): Chequeo[] {
  const clientes = contactos.filter((c) => c.cliente && c.companyId != null);
  const salida: Chequeo[] = [];

  // Contactos que alguien ya marcó como duplicado / a revisar y siguen activos.
  const marcadoras = etiquetas.filter((e) => /DUPLICAD|REVISAR/.test(palabras(e.nombre)));
  const idsMarca = new Set(marcadoras.map((e) => e.id));
  const marcados = contactos.filter((c) => c.etiquetas.some((id) => idsMarca.has(id)));
  salida.push({
    id: "seg-contactos-marcados",
    area: "segmentacion",
    severidad: "error",
    titulo: "Contactos marcados «Duplicado» o «Revisar» que siguen activos",
    descripcion: `Contactos que alguien ya etiquetó como duplicado o para revisar y no se resolvieron.`,
    porQue: "Se pueden seguir usando por error al facturar.",
    pasos: ["Resolver cada uno: fusionar con el contacto bueno (Acción → Fusionar) o, si está bien, quitarle la etiqueta."],
    columnas: [...COL_BASE, { clave: "etiqueta", titulo: "Etiqueta" }, ...COL_FIN],
    filas: marcados.map((c) => fila(c, { etiqueta: marcadoras.filter((e) => c.etiquetas.includes(e.id)).map((e) => e.nombre.trim()).join(", ") })),
  });

  // Etiquetas: la que casi todos tienen no segmenta; vacías; con espacios.
  const totalContactos = Math.max(1, contactos.length);
  const sinEtiqueta = clientes.filter((c) => !c.etiquetas.length).length;
  const conSoloCliente = (() => {
    const cliente = etiquetas.find((e) => palabras(e.nombre) === "CLIENTE");
    return cliente ? clientes.filter((c) => c.etiquetas.length === 1 && c.etiquetas[0] === cliente.id).length : 0;
  })();
  const filasEtiquetas: Fila[] = etiquetas
    .map((e) => {
      const motivos: string[] = [];
      if (e.contactos === 0) motivos.push("No la usa ningún contacto");
      if (espaciosDeMas(e.nombre)) motivos.push("Espacios de más en el nombre");
      if (e.contactos / totalContactos > 0.6) motivos.push("La tiene casi todo el mundo: no separa a nadie");
      return { e, motivo: motivos.join(" · ") };
    })
    .filter((x) => x.motivo)
    .map(({ e, motivo }) => ({ id: e.id, modelo: "res.partner.category", companyId: null, etiqueta: marcarEspacios(e.nombre), contactos: e.contactos, motivo }));
  salida.push({
    id: "seg-etiquetas",
    area: "segmentacion",
    severidad: "mejora",
    titulo: "Los clientes no están segmentados",
    descripcion: `Las etiquetas de contacto no clasifican a los clientes: ${conSoloCliente} clientes tienen solo «Cliente» y ${sinEtiqueta} no tienen ninguna.`,
    porQue: "Sin segmentos (mayorista, distribuidor, tienda, corporativo, gobierno, consumidor final…) no se pueden armar listas de precios por tipo de cliente, campañas, metas por canal ni reportes de a quién se le vende.",
    pasos: [
      "Acordar con Ventas una lista corta de segmentos (ej. Distribuidor, Mayorista, Tienda/Retail, Corporativo, Gobierno, Consumidor final).",
      "Crearlos en Contactos → Configuración → Etiquetas de contacto (sin espacios de más) y archivar las que no se usan.",
      "Asignar el segmento a cada cliente desde la vista de lista (seleccionar → editar Etiquetas). Empezar por los clientes con más compras.",
    ],
    columnas: [{ clave: "etiqueta", titulo: "Etiqueta" }, { clave: "contactos", titulo: "Contactos", tipo: "numero" }, { clave: "motivo", titulo: "Problema" }],
    filas: filasEtiquetas,
  });

  const sinEquipoSede = equipos.filter((t) => t.companyId == null);
  const sedesSinEquipo = [9, 10, 7].filter((s) => !equipos.some((t) => t.companyId === s));
  salida.push({
    id: "seg-equipos-venta",
    area: "segmentacion",
    severidad: "mejora",
    titulo: "Equipos de venta sin armar",
    descripcion: `${sedesSinEquipo.length === 3 ? "Ninguna sede tiene" : `${sedesSinEquipo.length} sedes no tienen`} su propio equipo de ventas; los equipos que existen no son de ninguna empresa${ejemplos(sinEquipoSede.map((t) => `«${t.nombre}»`), 4)}.`,
    porQue: "El equipo de ventas es lo que en Odoo separa la venta por sede o canal (tienda, calle, corporativo, web) en los reportes, el CRM y los tableros. Hoy todo cae en el mismo equipo.",
    pasos: [
      "En Ventas → Configuración → Equipos de ventas, crear un equipo por sede (y por canal si aplica), con su empresa y sus vendedores como miembros.",
      "Asignar el equipo en la ficha de cada vendedor/cliente (pestaña Ventas y compras), para que los pedidos nuevos lo traigan solo.",
    ],
    columnas: [{ clave: "equipo", titulo: "Equipo" }, { clave: "empresa", titulo: "Empresa" }, { clave: "miembros", titulo: "Miembros", tipo: "numero" }],
    filas: (sedesSinEquipo.length ? sinEquipoSede : []).map((t) => ({ id: t.id, modelo: "crm.team", companyId: null, equipo: t.nombre, empresa: "Sin empresa (todas)", miembros: t.miembros })),
  });

  return salida;
}
