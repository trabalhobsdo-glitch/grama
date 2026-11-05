/*
 * Camada de pagamento do GramaZero.
 *
 * O checkout (checkout.js) chama window.GramaPay.pay(order) e espera uma Promise.
 * É AQUI que entra a API do Getter. Hoje é só um esqueleto: não cobra nada.
 *
 * "order" traz: { items, totalCents, customer, address, method, card? }
 *   - method: 'pix' | 'cartao'
 *   - card (só no cartão): { number, name, expiry, cvv, installments }
 *
 * Retorne um destes formatos:
 *   { ok: true, pixCode: '000201...' }          -> mostra o Pix copia e cola
 *   { ok: true, redirectUrl: 'https://...' }    -> leva o cliente para a confirmação
 *   { ok: true, message: 'Pedido recebido.' }   -> só mostra a mensagem
 *   { ok: false, message: 'Motivo do erro.' }   -> mostra o erro
 *
 * IMPORTANTE:
 *   - Chaves secretas da API NUNCA ficam neste arquivo (ele é público no navegador).
 *     Crie uma função serverless na Vercel (ex.: /api/pagar.js), guarde a chave em
 *     Environment Variables e faça o fetch('/api/pagar', ...) daqui.
 *   - Dados do cartão devem ser tokenizados pelo SDK/endpoint do próprio gateway,
 *     nunca enviados crus para o seu servidor.
 */
window.GramaPay = {
  async pay(order) {
    // TODO: conectar à API do Getter.
    return { ok: false, message: 'O pagamento ainda não está conectado. Seus dados foram validados.' };
  }
};
