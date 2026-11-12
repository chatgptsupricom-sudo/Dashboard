import type { Contenido } from "@/lib/manuales/datos";
import type { TipoManual } from "@/lib/manuales/permisos";
import { MANUAL_ADMINISTRACION, TUTORIAL_ADMINISTRACION } from "@/lib/manuales/semillas/administracion";
import { MANUAL_ADMINLEADS, TUTORIAL_ADMINLEADS } from "@/lib/manuales/semillas/adminLeads";
import { MANUAL_ALMACEN, TUTORIAL_ALMACEN } from "@/lib/manuales/semillas/almacen";
import { MANUAL_ASISTENTE_VENTAS, TUTORIAL_ASISTENTE_VENTAS } from "@/lib/manuales/semillas/asistenteVentas";
import { MANUAL_COMPRAS, TUTORIAL_COMPRAS } from "@/lib/manuales/semillas/compras";
import { MANUAL_CXC, TUTORIAL_CXC } from "@/lib/manuales/semillas/cxc";
import { MANUAL_GERENCIA_VENTAS, TUTORIAL_GERENCIA_VENTAS } from "@/lib/manuales/semillas/gerenciaVentas";
import { MANUAL_GERENTE_OPERACIONES, TUTORIAL_GERENTE_OPERACIONES } from "@/lib/manuales/semillas/gerenteOperaciones";
import { MANUAL_BI, TUTORIAL_BI } from "@/lib/manuales/semillas/inteligenciaNegocio";
import { MANUAL_RMA, TUTORIAL_RMA } from "@/lib/manuales/semillas/rma";
import { MANUAL_RRHH, TUTORIAL_RRHH } from "@/lib/manuales/semillas/rrhh";
import { MANUAL_SEGURIDAD, TUTORIAL_SEGURIDAD } from "@/lib/manuales/semillas/seguridad";
import { MANUAL_VENDEDOR, TUTORIAL_VENDEDOR } from "@/lib/manuales/semillas/vendedor";

/**
 * Contenido base de los manuales y tutoriales de cada rol. No se lee de aquí
 * en el día a día: Procesos lo carga desde la pantalla de Manuales («Contenido
 * base»), queda como borrador en la tabla `manuales` y desde ahí se edita y se
 * publica. Un código ya usado en la tabla no se vuelve a cargar.
 *
 * Códigos: MR-<ROL>-01 = manual del rol, TU-<ROL>-01 = tutorial del panel.
 * Rol nuevo: un archivo más en esta carpeta y sumarlo a SEMILLAS.
 */
export type Semilla = {
  codigo: string;
  titulo: string;
  area: string;
  version: string;
  tipo: TipoManual;
  /** `name` de la tabla roles, en minúsculas (el vendedor es "seller"). */
  roles: string[];
  contenido: Contenido;
};

export const SEMILLAS: Semilla[] = [
  MANUAL_VENDEDOR,
  TUTORIAL_VENDEDOR,
  MANUAL_ALMACEN,
  TUTORIAL_ALMACEN,
  MANUAL_SEGURIDAD,
  TUTORIAL_SEGURIDAD,
  MANUAL_CXC,
  TUTORIAL_CXC,
  MANUAL_ADMINISTRACION,
  TUTORIAL_ADMINISTRACION,
  MANUAL_RMA,
  TUTORIAL_RMA,
  MANUAL_COMPRAS,
  TUTORIAL_COMPRAS,
  MANUAL_GERENCIA_VENTAS,
  TUTORIAL_GERENCIA_VENTAS,
  MANUAL_GERENTE_OPERACIONES,
  TUTORIAL_GERENTE_OPERACIONES,
  MANUAL_ADMINLEADS,
  TUTORIAL_ADMINLEADS,
  MANUAL_RRHH,
  TUTORIAL_RRHH,
  MANUAL_ASISTENTE_VENTAS,
  TUTORIAL_ASISTENTE_VENTAS,
  MANUAL_BI,
  TUTORIAL_BI,
];
