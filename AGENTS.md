# AGENTS.md

Panel administrativo SUPRICOM. Next.js 16 (App Router) + TypeScript + MySQL + Odoo (RPC) + Socket.io. Multi-rol, multi-idioma (es/en).

## Comandos

- `npm run dev` / `pnpm dev` → `node server.js` (servidor custom: arranca Next **y** Socket.io + cron). **NO** usar `next dev` ni `next start`; el arranque pasa siempre por `server.js`.
- Producción: `pnpm build` y luego `pnpm start` (que corre `NODE_ENV=production node server.js`).
- Gestor de paquetes: **pnpm** (Dockerfile y docs usan pnpm; hay `package-lock.json` y `pnpm-lock.yaml` duplicados, ignorar el de npm). `pnpm-workspace.yaml` solo configura permisos de build, **no** es un monorepo.
- Typecheck: `npx tsc --noEmit`. OJO: `next.config.mjs` tiene `typescript.ignoreBuildErrors: true`, así que `next build` NO valida tipos.
- No hay suite de tests ni ESLint configurado (`eslint` no está en devDependencies → `npm run lint` falla). No inventar comandos de test/lint.

## Arquitectura

- **Todas** las páginas viven bajo `app/[locale]/...` (next-intl). El `middleware.ts` hace routing i18n + verificación JWT (jose) + guard por rol.
- i18n real: `i18n.config.ts` (rutas es/en, default `es`) + `i18n/request.ts` (conectado en `next.config.mjs`). Los archivos raíz `next-intl.ts`, `intl.config.ts` y `next.intl.config.ts` están **obsoletos/sin usar**.
- Backend en `app/api/...`. MySQL vía pool en `lib/db.ts` (helper `query()` con `db.execute`). Odoo vía JSON-RPC en `lib/odoo.ts`.
- Auth: `POST /api/auth/login` autentica contra Odoo (email+password), luego busca el rol en MySQL (`users_config` JOIN `roles`, tabla `sellers` para `activo`), emite cookie httpOnly `token` (JWT, 7 días). Mapeo de roles: ver `lib/types.ts` (`UserRole`, strings en DB tipo `"recursos humanos"`, `"compras"`, `"superAdmin"`).
- **JWT library split**: `lib/jwt.ts` usa `jsonwebtoken` para firmar; `middleware.ts` usa `jose` para verificar. Ambos deben compartir el mismo `JWT_SECRET`. Si cambias uno, cambia el otro.
- Roles/permisos se comparan en minúsculas en `middleware.ts`. **Cuidado**: los strings en `UserRole` enum tienen casing inconsistente (ej. `"Gerencia De Ventas"` vs `"recursos humanos"`), pero `middleware.ts` aplica `.toLowerCase().trim()`. Rutas protegidas: `/dashboard`, `/superadmin`, `/vendedores`, `/adminleads`, `/gerente_venta`, `/gerente_operaciones`, `/recursos_humanos`, `/compras`. Al añadir un rol, hay que tocarlo en middleware, `lib/types.ts` y `lib/actividades/rolesConfig.ts`.
- `server.js`: cron de KPIs Mié/Vie 20:00 America/Caracas → `GET /api/cron/calculate-kpis` con header `Authorization: Bearer $CRON_SECRET`. Emite `kpis_updated` por Socket.io. La URL del socket en el cliente se toma de `NEXT_PUBLIC_SOCKET_URL`.

## Variables de entorno (`.env.local`)

`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (MySQL) · `NEXT_PUBLIC_ODOO_URL`, `ODOO_DB`, `ODOO_API_KEY` · `JWT_SECRET`, `JWT_EXPIRATION` · `CRON_SECRET` · `WEBHOOK_SECRET` · `N8N_LEAD_WEBHOOK_URL`, `N8N_REASSIGN_WEBHOOK_URL` · `OPENAI_API_KEY` / `OPENROUTER_API_KEY` (agente IA y reportes) · `NEXT_PUBLIC_SOCKET_URL`.

Gotchas:
- Existen secrets hardcodeados como fallback en el código (JWT_SECRET, ODOO_API_KEY). No añadir más ni quitarlos sin reemplazo.
- `target_company_id` (cids) en agentes/reportes: 9=Valencia (default), 10=Caracas, 7=Panamá (`lib/tools.ts`).
- Varias rutas (inventario ×3, agenteia) hacen `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` al inicio — quirk de dev, respetarlo.

## Docs

`SETUP.md` está **desactualizado** (describe Next 15, `proxy.ts` y auth solo-Odoo). No guiarse por él; confiar en el código. `sql/` tiene DDL de tablas (`kpi_targets`, `kpi_weekly_data`) — schema de referencia de la MySQL local.
