---
name: verificar-kpi-odoo
description: Verifica un KPI o monto del panel (CxC, Pago de Clientes, Contado/Crédito, Stoplight) contra los datos reales de Odoo y explica de dónde sale la diferencia. Usar cuando alguien dice que una tarjeta "da mucho", "no cuadra", "está mal" o pregunta si una fórmula está bien.
---

# Verificar un KPI contra Odoo

Objetivo: confirmar con datos si el número de la pantalla es correcto y, si no
cuadra con lo que espera el usuario, encontrar los registros concretos que
explican la diferencia. No cambiar código hasta tener la causa.

## 1. Ubicar la fórmula real

- Pantalla en `app/[locale]/<area>/…/page.tsx` → endpoint en `app/api/…/route.ts` → lógica en `lib/<area>/`.
- CxC: la fuente única de "cobrado" es `lib/cxc/cobros.ts`; fecha de un cobro en `lib/cxc/fechaConfirmacion.ts`; Efectividad (CEI) en `lib/cxc/efectividad.ts`; cartera en un corte pasado en `lib/cxc/seriesSemanales.ts` (`carteraEn`).
- La tarjeta y su modal (`kpi-detail/route.ts`) deben usar el mismo helper. Si no, esa ya es la diferencia.

## 2. Reglas del negocio que casi siempre explican una diferencia

- **Fecha de un pago** = `account.payment.payment_registration_date` ("Fecha de Registro (Confirmación)", se llena al confirmar; fallback `create_date`). NO es `date` (fecha valor, puede ser retroactiva). Un rango por confirmación incluye pagos con fecha de pago anterior.
- **Cobro** = solo diarios `bank`/`cash` sin "retenido" en el nombre. Retenciones, NC y ajustes bajan saldo pero no son dinero.
- **Cliente interno** Supricom (`partner_id.name ilike supricom`) fuera de los KPIs.
- **Sedes** (`company_id`): 9 = Valencia, 10 = Caracas, 7 = Panamá. Las tres llevan contabilidad en USD (`amount_company_currency_signed`, `account.partial.reconcile.amount` ya están en USD).
- `amount_residual` es el saldo de HOY: para un corte pasado hay que reconstruir (saldo hoy + conciliado después del corte).
- Leads: `leads.fecha_venta` es fecha de cierre (incluye PERDIDO), ver CLAUDE.md.

## 3. Consultar Odoo (solo lectura)

Usar `odoo_search_read` (tope 500 filas por llamada). Nunca `odoo_write`/`odoo_execute`/`odoo_unlink`.

1. Reproducir el filtro exacto del endpoint (mismo dominio, misma sede, mismo rango).
2. Ordenar por monto desc (`order: "amount_company_currency_signed desc"`) para ver qué pagos pesan.
3. Buscar el segmento que explica la diferencia, p.ej. confirmados en rango con `date` fuera de rango, un pago atípicamente grande, registros sin fecha de confirmación.
4. Si hace falta, `ir.model.fields` para ver qué es un campo (`field_description`, `store`, `readonly`).

## 4. Reportar

- Veredicto: ¿el cálculo es correcto según su definición? ¿La definición es la que el usuario cree?
- Cifras con ejemplos concretos (nombre del pago, monto, fechas).
- Si hay que cambiar algo, proponerlo y pedir confirmación antes de tocar la fórmula (alguna la pidió Administración y cambiarla descuadra otras pantallas).
