/**
 * URL del webhook de n8n para los avisos de servicio técnico (RMA).
 *
 * Antes iban todos a `N8N_LEAD_WEBHOOK_URL`, que es el flujo de asignación de
 * leads a vendedores: ese flujo no mira el `evento`, buscaba un vendedor que
 * no existe y terminaba sin mandar nada. Los de RMA tienen su propio flujo
 * ("RMA - Correos al cliente", webhook `rma-notify`), que se configura en
 * `N8N_RMA_WEBHOOK_URL`. Sin esa variable se sigue usando la de antes, así un
 * despliegue sin configurar se comporta igual que hoy.
 */
export function urlWebhookRma(): string | undefined {
  return process.env.N8N_RMA_WEBHOOK_URL || process.env.N8N_LEAD_WEBHOOK_URL || undefined;
}
