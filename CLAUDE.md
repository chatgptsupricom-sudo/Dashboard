# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Panel administrativo SUPRICOM. Next.js 16 (App Router) + TypeScript + MySQL + Odoo (JSON-RPC) + Socket.io. Multi-rol, multi-idioma (es/en).

## Comandos

- `pnpm dev` → `node server.js` (servidor custom: arranca Next **y** Socket.io + cron). **NO** usar `next dev` ni `next start`; el arranque pasa siempre por `server.js`.
- Producción: `pnpm build` y luego `pnpm start` (`NODE_ENV=production node server.js`).
- Gestor de paquetes: **pnpm** (Dockerfile y docs usan pnpm; existen `package-lock.json` y `pnpm-lock.yaml` duplicados, ignorar el de npm). `pnpm-workspace.yaml` solo configura permisos de build, **no** es un monorepo.
- Typecheck: `npx tsc --noEmit`. OJO: `next.config.mjs` tiene `typescript.ignoreBuildErrors: true`, así que `next build` NO valida tipos.
- No hay suite de tests ni ESLint configurado (`eslint` no está en devDependencies → `npm run lint` falla). No inventar comandos de test/lint.

## Arquitectura

- **Todas** las páginas viven bajo `app/[locale]/...` (next-intl). `middleware.ts` hace routing i18n + verificación JWT (jose) + guard por rol.
- Estructura espejo por rol/dominio: cada área (`adminleads`, `compras`, `vendedores`, `superadmin`, `gerente_venta`, `gerente_operaciones`, `recursos_humanos`, `dashboard`, `rma`, `cxc`…) suele tener su carpeta en `app/[locale]/`, sus endpoints en `app/api/`, sus componentes en `components/` y su lógica compartida en `lib/`. Al añadir una feature, seguir ese patrón de cuatro capas.
- `components/ui` es shadcn/Radix (ver `components.json`); reutilizar esos primitivos en vez de crear nuevos.
- i18n real: `i18n.config.ts` (rutas es/en, default `es`) + `i18n/request.ts` (conectado en `next.config.mjs`), traducciones en `messages/`. Los archivos raíz `next-intl.ts`, `intl.config.ts` y `next.intl.config.ts` están **obsoletos/sin usar**.
- Datos: MySQL vía pool en `lib/db.ts` (helper `query()` con `db.execute`). Odoo vía JSON-RPC en `lib/odoo.ts`.
- Auth: `POST /api/auth/login` autentica contra Odoo (email+password), luego busca el rol en MySQL (`users_config` JOIN `roles`, tabla `sellers` para `activo`), emite cookie httpOnly `token` (JWT, 7 días).
- **JWT library split**: `lib/jwt.ts` firma con `jsonwebtoken`; `middleware.ts` verifica con `jose`. Ambos deben compartir el mismo `JWT_SECRET`. Si cambias uno, cambia el otro.
- Roles/permisos se comparan en minúsculas en `middleware.ts`. **Cuidado**: los strings de `UserRole` (`lib/types.ts`) tienen casing inconsistente (ej. `"Gerencia De Ventas"` vs `"recursos humanos"`), pero `middleware.ts` aplica `.toLowerCase().trim()`. La lista de rutas de página protegidas es `isProtectedPath` en `middleware.ts` (una sección nueva en `app/[locale]/` hay que agregarla ahí o queda pública). Al añadir un rol hay que tocarlo en `middleware.ts`, `lib/types.ts` (`UserRole` + `rolePermissions.sections`) y `lib/actividades/rolesConfig.ts`.
- **Las APIs no pasan por el guard de sesión**: para `/api/*` el middleware solo corre `verificarOrigenApi()` (chequeo de Origin en métodos de escritura). Cada `route.ts` debe autenticarse sola con `requireRoles(request, [...])` o `requireSession(request)` de `lib/auth/roles.ts` (superadmin siempre entra). Un endpoint nuevo sin guard queda abierto.
- Dominio del portal de clientes (`PORTAL_HOSTS`, default `servicio.supricom.com.ve,soporte.supricom.com.ve`): ahí solo se sirve `/servicio-tecnico`; cualquier otra página responde 404 a propósito.
- `server.js`: cron de KPIs Mié/Vie 20:00 America/Caracas → `GET /api/cron/calculate-kpis` con header `Authorization: Bearer $CRON_SECRET`. Emite `kpis_updated` por Socket.io; la URL del socket en el cliente sale de `NEXT_PUBLIC_SOCKET_URL` (`lib/socket-client.ts` / `lib/socket-emit.ts`).

## Variables de entorno (`.env.local`)

`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (MySQL) · `NEXT_PUBLIC_ODOO_URL`, `ODOO_DB`, `ODOO_API_KEY` · `JWT_SECRET`, `JWT_EXPIRATION` · `CRON_SECRET` · `WEBHOOK_SECRET` · `N8N_LEAD_WEBHOOK_URL`, `N8N_REASSIGN_WEBHOOK_URL` · `OPENAI_API_KEY` / `OPENROUTER_API_KEY` (reportes) · `ANTHROPIC_API_KEY` y, opcionales, `ODOO_MCP_URL` / `ODOO_MCP_TOKEN` (Agente IA del SuperAdmin) · `NEXT_PUBLIC_SOCKET_URL`.

Gotchas:
- `JWT_SECRET`/`ODOO_API_KEY` no tienen fallback hardcodeado: `lib/secretos.ts` falla cerrado (secreto aleatorio de un solo uso / string vacío) si la env var falta, y loguea el error. No reintroducir un fallback fijo — es lo que este archivo reemplazó.
- `target_company_id` (cids) en agentes/reportes: 9=Valencia (default), 10=Caracas, 7=Panamá (`lib/tools.ts`).
- Ninguna ruta desactiva la verificación TLS globalmente (`NODE_TLS_REJECT_UNAUTHORIZED`) — las que antes lo hacían (inventario ×3) usan `callOdooRPCInsecure()` en `lib/odoo.ts`, que aplica un `https.Agent({rejectUnauthorized:false})` scoped a esa llamada puntual, no al proceso.
- `META_ACCESS_TOKEN` es un token de **system user** con `instagram_basic` pero **sin** `instagram_manage_insights`: perfil y listado de publicaciones de Instagram funcionan, pero Insights (views, reach, profile_views, demografía, insights por publicación) devuelve `(#10) Application does not have permission`. `lib/instagram.ts` degrada por bloque (`{ available, reason }`) en vez de fallar; cuando Meta apruebe el permiso empieza a devolver datos sin cambiar código.
- Agente IA (`lib/agenteia/agente.ts`, solo SuperAdmin): Claude con herramientas propias de lectura de Odoo (read_group/search_read/search_count/fields_get por el JSON-RPC del panel; modelos con secretos bloqueados) y de la MySQL del panel (transacción `READ ONLY`). Si `ODOO_MCP_URL`/`ODOO_MCP_TOKEN` están definidas, suma además el MCP de Odoo (`rag_odoo_mcp_server`, conector MCP de la API de Claude, allowlist de lectura con SQL directo); el módulo debe estar en modo API tokens con "Require API key" y la key User (solo lectura). En modo OAuth no sirve: sus tokens caducan. Las escrituras nunca son directas: `preparar_cambio_odoo` devuelve un token HMAC que la pantalla muestra como botón, y solo al confirmar se ejecuta con `callOdooRPCEstricto()`.
- La MySQL de producción tiene allowlist por IP: no se puede conectar desde cualquier máquina de desarrollo.
- Las migraciones se corren a mano en el phpMyAdmin de EasyPanel (MySQL 9.7, base `supricom_panel`, usuario `root@'%'`). Ahí **no se puede leer `information_schema`** (`#1044 Acceso negado`) y hasta un `CREATE TABLE` sin la base delante falla. Por eso `sql/migrar_seguridad_completo.sql` "corre" sin agregar columnas. Los scripts para ese phpMyAdmin van con `supricom_panel.tabla` y sin `information_schema` (ej. `sql/egreso_por_etapas.sql`, `sql/recepcion_packing_list.sql`); MySQL no tiene `ADD COLUMN IF NOT EXISTS`, así que se verifica antes con `SHOW COLUMNS` y después con `SHOW COLUMNS` / `SHOW TABLES`.
- `leads.fecha_venta` es en realidad **fecha de cierre**: se puebla en todo lead cerrado, incluidos los `motivo_cierre = 'PERDIDO'`. Para contar ventas hay que filtrar además por `status = 'CERRADO' AND motivo_cierre IN ('VENTA','GANADO')`. Y ojo con `COALESCE(fecha_venta, fecha_ingreso, created_at)` (patrón habitual en `app/api/adminleads/`): cuenta como leads del mes a leads viejos cerrados ese mes. El informe mensual usa el criterio separado — entrada por `COALESCE(fecha_ingreso, created_at)`, ventas por `fecha_venta` — y por eso no coincide con el tab General.

## Docs

`SETUP.md` está **desactualizado** (describe Next 15, `proxy.ts` y auth solo-Odoo). No guiarse por él; confiar en el código. `sql/` tiene DDL de tablas (`kpi_targets`, `kpi_weekly_data`) — schema de referencia de la MySQL local. `AGENTS.md` es una copia vieja de este archivo para otros agentes; si cambia algo importante aquí, actualizarlo también.

Tooling en `.claude/`: hook PreToolUse que bloquea editar `package-lock.json` y `.env*`; skills `migracion-phpmyadmin` y `verificar-kpi-odoo`; agente `kpi-auditor` (correr tras tocar fórmulas de KPI/CxC).
