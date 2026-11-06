/*
 * Camada de pagamento do GramaZero.
 *
 * O checkout (checkout.js) usa window.GramaPay. Aqui ficam as chamadas aos gateways:
 *   - Pix    -> Unipay  (via /api/create-pix)
 *   - Cartão -> Pagou   (formulário seguro da Pagou + /api/create-card)
 *
 * NENHUMA chave secreta fica neste arquivo: elas ficam nas Environment Variables da Vercel
 * e só as funções da pasta /api as enxergam. Os dados do cartão são digitados dentro do
 * formulário seguro da Pagou e viram um token; o seu site nunca vê o número do cartão.
 */
(function () {
  let cardCfg = null, els = null, cardEl = null, seq = 0, loader = null;

  const readJson = r => r.json().catch(() => ({}));
  const cookie = n => (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]+)')) || [])[1] || '';

  function loadPagou() {
    if (window.Pagou) return Promise.resolve(window.Pagou);
    if (!loader) {
      loader = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = 'https://js.pagou.ai/payments/v3.js?v=3.0.0';
        sc.async = true;
        sc.onload = () => (window.Pagou ? resolve(window.Pagou) : reject(new Error('Pagou indisponível')));
        sc.onerror = () => { loader = null; reject(new Error('Falha ao carregar a Pagou')); };
        document.head.appendChild(sc);
      });
    }
    return loader;
  }

  // O que o servidor precisa saber do pedido (o valor é recalculado lá).
  const body = order => ({
    offerId: order.model, quantity: order.quantity,
    customer: order.customer, address: order.address,
    fbp: cookie('_fbp'), fbc: cookie('_fbc'), sourceUrl: location.href
  });

  window.GramaPay = {
    // Pergunta ao servidor se o cartão está configurado (chave pública da Pagou).
    async init() {
      try {
        const c = await readJson(await fetch('/api/create-card'));
        cardCfg = c && c.enabled && c.publishableKey ? c : null;
      } catch { cardCfg = null; }
      return !!cardCfg;
    },

    // Monta o formulário seguro do cartão dentro do elemento (ex.: '#card-element').
    async mountCard(selector, onMessage) {
      this.unmountCard();
      const my = ++seq;
      const Pagou = await loadPagou();
      if (my !== seq) return false;
      if (cardCfg.sandbox) Pagou.setEnvironment('sandbox');
      try { els = Pagou.elements({ publicKey: cardCfg.publishableKey, locale: 'pt-BR' }); }
      catch { els = Pagou.elements({ publicKey: cardCfg.publishableKey }); }
      cardEl = els.create('card', { theme: 'default' });
      cardEl.mount(selector);
      cardEl.on?.('change', ev => onMessage?.(ev?.errors?.length ? String(ev.errors[0].message ?? '') : ''));
      return true;
    },
    unmountCard() {
      seq++;
      try { (cardEl?.unmount ?? cardEl?.destroy)?.call(cardEl); } catch { /* ignora */ }
      cardEl = null; els = null;
    },

    // Gera o Pix. Retorna { ok:true, pix:{ id, qrcode, amount, expirationDate } } ou { ok:false, message }
    async payPix(order) {
      try {
        const r = await fetch('/api/create-pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body(order)) });
        const j = await readJson(r);
        if (!r.ok) return { ok: false, message: j.error || 'Não foi possível gerar o Pix.' };
        return { ok: true, pix: j };
      } catch { return { ok: false, message: 'Falha de conexão. Tente novamente.' }; }
    },

    // Cobra no cartão. Retorna { ok:true, status, id, amount } ou { ok:false, message }
    async payCard(order) {
      if (!els) return { ok: false, message: 'O formulário do cartão ainda está carregando. Aguarde um instante.' };
      let txId = '', txAmount = null;
      try {
        const result = await els.submit({
          mode: 'payment',
          createTransaction: async tokenData => {
            const r = await fetch('/api/create-card', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body(order), token: tokenData?.token })
            });
            const j = await readJson(r);
            if (!r.ok) throw new Error(j.error || 'Não foi possível processar o cartão.');
            txId = j?.data?.id ?? '';
            txAmount = typeof j?.amount === 'number' ? j.amount : null;
            return j.data ?? j;
          }
        });
        return { ok: true, status: String(result?.status ?? '').toLowerCase(), id: String(result?.id ?? txId), amount: txAmount };
      } catch (e) {
        return { ok: false, message: e instanceof Error && e.message ? e.message : 'Cartão não aprovado. Tente outro cartão ou pague com Pix.' };
      }
    },

    // Consulta o status ('pix' = Unipay, 'card' = Pagou). Retorna string em minúsculas ou '' se falhar.
    async status(id, kind) {
      try {
        const r = await fetch('/api/pix-status?id=' + encodeURIComponent(id) + (kind === 'pix' ? '&m=pix' : ''));
        return String((await readJson(r)).status || '');
      } catch { return ''; }
    }
  };
})();
