/**
 * O e-mail de vendas é enviado pelo backend (gmarket-backend/sale-mail.ts)
 * quando a encomenda ou bilhete é criado.
 *
 * Mantém a assinatura para não interferir nos fluxos de compra, mas não chama
 * rotas administrativas a partir do cliente.
 */
export async function notifyAdminOfSale(payload: {
  type: 'order' | 'ticket';
  subject: string;
  summary: string;
  fields?: Record<string, string | number | null | undefined>;
}): Promise<void> {
  void payload;
}
