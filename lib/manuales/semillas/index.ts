import type { Contenido } from "@/lib/manuales/datos";
import type { TipoManual } from "@/lib/manuales/permisos";
import { MANUAL_ALMACEN, TUTORIAL_ALMACEN } from "@/lib/manuales/semillas/almacen";
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
];
