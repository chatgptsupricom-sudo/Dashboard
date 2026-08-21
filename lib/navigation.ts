// lib/navigation.ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "../i18n.config"; // Asegúrate que esta ruta sea correcta

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
