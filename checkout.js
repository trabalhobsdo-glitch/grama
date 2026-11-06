// Mesmos valores da loja (index/app.js) e do servidor (api/_shared.ts). Se mudar o preço, mude nos três.
const MODELS = {
  rodas: { label: 'Com rodas', cents: 22990, image: 'grasscut-comparativo' },
  sem: { label: 'Sem rodas', cents: 16990, image: 'sem-rodas' }
};
const CONFIG = {
  shippingCents: null   // null = não mostra frete. 0 = "Grátis". Se cobrar frete, ajuste também api/_shared.ts.
};

const $ = s => document.querySelector(s);
const form = $('#co-form'), msg = $('#co-msg'), submit = $('#co-submit'), qty = $('#co-qty');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const params = new URLSearchParams(location.search);
const model = MODELS[params.get('modelo')] ? params.get('modelo') : 'rodas';
const clampQty = v => Math.min(99, Math.max(1, Math.floor(Number(v)) || 1));
qty.value = clampQty(params.get('qtd'));

const state = { method: 'pix', cardEnabled: false, loading: false, paidWith: 'pix', paidAmount: null, waitId: '', pix: null, purchaseSent: '' };

function totals() {
  const sub = MODELS[model].cents * clampQty(qty.value);
  const ship = CONFIG.shippingCents || 0;
  return { sub, ship, total: sub + ship };
}
function updateButton() {
  const t = totals();
  const total = brl.format(t.total / 100);
  if (state.loading) submit.textContent = state.method === 'cartao' ? 'Processando…' : 'Gerando Pix…';
  else if (state.method === 'cartao' && state.cardEnabled) submit.textContent = 'Pagar no cartão · ' + total;
  else submit.textContent = 'Pagar com Pix · ' + total;
  submit.disabled = state.loading;
}
function render() {
  const t = totals();
  $('#co-model').textContent = MODELS[model].label;
  $('#co-img').src = 'media/' + MODELS[model].image + '.webp';
  $('#co-sub').textContent = brl.format(t.sub / 100);
  $('#co-ship-row').hidden = CONFIG.shippingCents === null;
  $('#co-ship').textContent = t.ship ? brl.format(t.ship / 100) : 'Grátis';
  $('#co-total').textContent = brl.format(t.total / 100);
  const [dec, inc] = document.querySelectorAll('[data-step]');
  dec.disabled = clampQty(qty.value) <= 1; inc.disabled = clampQty(qty.value) >= 99;
  updateButton();
}
document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { qty.value = clampQty(clampQty(qty.value) + Number(b.dataset.step)); render(); }));
qty.addEventListener('change', () => { qty.value = clampQty(qty.value); render(); });
render();

/* ---------- pixels (só disparam se o Pixel do Meta/TikTok estiver instalado no site) ---------- */
const pixelData = cents => ({ content_name: 'GramaZero ' + MODELS[model].label, content_type: 'product', content_ids: [model], contents: [{ id: model, quantity: clampQty(qty.value) }], num_items: clampQty(qty.value), value: cents / 100, currency: 'BRL' });
window.fbq?.('track', 'InitiateCheckout', pixelData(totals().total));
function trackPaymentInfo(cents) { window.fbq?.('track', 'AddPaymentInfo', pixelData(cents)); }
function trackPurchase(cents) {
  // Um disparo por Pix/pedido (cada Pix novo tem id novo e conta como nova venda)
  const key = state.waitId || model;
  if (state.purchaseSent === key) return; state.purchaseSent = key;
  // eventID igual ao do servidor (webhook) para o Meta não contar 2x
  window.fbq?.('track', 'Purchase', pixelData(cents), { eventID: 'purchase_' + key });
}

/* ---------- máscaras e validações ---------- */
const digits = v => v.replace(/\D/g, '');
const mask = (id, fn) => $(id).addEventListener('input', e => { e.target.value = fn(digits(e.target.value)); check(e.target); });
mask('#cpf', d => d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'));
mask('#tel', d => d.slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2'));
mask('#cep', d => d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'));
$('#uf').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase(); });

function cpfOk(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const n of [9, 10]) {
    let s = 0; for (let i = 0; i < n; i++) s += c[i] * (n + 1 - i);
    if ((s * 10 % 11) % 10 !== Number(c[n])) return false;
  }
  return true;
}
const rules = {
  cpf: v => cpfOk(digits(v)) ? '' : 'CPF inválido.',
  tel: v => digits(v).length >= 10 ? '' : 'Informe o DDD e o número.',
  cep: v => digits(v).length === 8 ? '' : 'CEP com 8 números.',
  uf: v => v.length === 2 ? '' : 'Use a sigla do estado.'
};
function check(el) {
  el.setCustomValidity(el.value && rules[el.name] ? rules[el.name](el.value) : '');
  if (el.dataset.touched) el.setAttribute('aria-invalid', String(!el.checkValidity()));
}
form.querySelectorAll('input').forEach(el => {
  el.addEventListener('blur', () => { el.dataset.touched = '1'; check(el); });
  el.addEventListener('input', () => check(el));
});

// Preenche o endereço pelo CEP (ViaCEP). Se falhar, o cliente digita.
$('#cep').addEventListener('input', async e => {
  if (digits(e.target.value).length !== 8) return;
  try {
    const r = await fetch('https://viacep.com.br/ws/' + digits(e.target.value) + '/json/');
    const d = await r.json();
    if (d.erro) return;
    $('#rua').value = d.logradouro || ''; $('#bairro').value = d.bairro || '';
    $('#cidade').value = d.localidade || ''; $('#uf').value = d.uf || '';
    $('#numero').focus();
  } catch { /* segue com preenchimento manual */ }
});

/* ---------- mensagens ---------- */
function show(text, error) { msg.className = 'co-msg' + (error ? ' err' : ''); msg.textContent = text; msg.hidden = !text; }
function setCardMsg(t) { const e = $('#card-msg'); e.textContent = t; e.hidden = !t; }

/* ---------- Pix ou cartão (cartão só aparece se a Pagou estiver configurada na Vercel) ---------- */
async function syncMethod() {
  const card = state.method === 'cartao' && state.cardEnabled;
  $('#card-box').hidden = !card;
  updateButton();
  if (!card) { window.GramaPay.unmountCard(); return; }
  setCardMsg(''); $('#card-loading').hidden = false;
  try { await window.GramaPay.mountCard('#card-element', setCardMsg); $('#card-loading').hidden = true; }
  catch { $('#card-loading').hidden = true; setCardMsg('Não foi possível carregar o formulário do cartão. Tente novamente ou pague com Pix.'); }
}
form.addEventListener('change', e => {
  if (e.target.name !== 'metodo') return;
  state.method = e.target.value; show('', false); syncMethod();
});
window.GramaPay.init().then(ok => { state.cardEnabled = ok; $('#opt-card').hidden = !ok; updateButton(); });

/* ---------- telas depois de pagar ---------- */
function showScreen(name) {
  $('#co-main').hidden = name === 'form';
  $('#co-screen').hidden = name === 'form';
  document.querySelectorAll('[data-screen]').forEach(el => { el.hidden = el.dataset.screen !== name; });
  if (name !== 'pix') window.scrollTo({ top: 0, behavior: 'smooth' });
}
function drawQR(canvas, text) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), margin = 2, cell = Math.max(2, Math.floor(280 / (n + margin * 2)));
    const px = cell * (n + margin * 2);
    canvas.width = canvas.height = px;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, px, px);
    c.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
  } catch { canvas.hidden = true; }
}
function showPix(pix) {
  $('#pix-amount').textContent = brl.format(pix.amount / 100);
  $('#pix-code').value = pix.qrcode;
  $('#pix-qr').hidden = false; drawQR($('#pix-qr'), pix.qrcode);
  $('#pix-exp').textContent = pix.expirationDate ? 'Válido até ' + new Date(pix.expirationDate).toLocaleString('pt-BR') : '';
  showScreen('pix');
  // leva a tela direto para o valor e o QR Code (e não para o topo da página)
  requestAnimationFrame(() => $('#pix-amount').scrollIntoView({ block: 'start' }));
}
$('#pix-code').addEventListener('focus', e => e.currentTarget.select());
$('#pix-copy').addEventListener('click', async () => {
  const b = $('#pix-copy');
  try { await navigator.clipboard.writeText(state.pix.qrcode); }
  catch { $('#pix-code').select(); document.execCommand('copy'); }
  b.textContent = '✓ Código copiado!';
  setTimeout(() => (b.textContent = 'Copiar código Pix'), 2500);
});
function showPaid() {
  clearInterval(pollTimer);
  $('#paid-with').textContent = state.paidWith === 'card' ? 'pagamento no cartão' : 'Pix';
  $('#paid-amount').textContent = brl.format((state.paidAmount ?? totals().total) / 100);
  $('#paid-email').textContent = $('#email').value;
  showScreen('paid');
}
function showFailed() {
  clearInterval(pollTimer);
  const card = state.paidWith === 'card';
  $('#fail-title').textContent = card ? 'Pagamento não aprovado' : 'Pix expirado ou cancelado';
  $('#fail-text').textContent = card ? 'O cartão não foi aprovado. Você pode tentar outro cartão ou pagar com Pix.' : 'Não identificamos o pagamento. Você pode gerar um novo Pix.';
  $('#fail-retry').textContent = card ? 'Tentar novamente' : 'Gerar novo Pix';
  showScreen('failed');
}
$('#fail-retry').addEventListener('click', () => { state.pix = null; showScreen('form'); syncMethod(); });

/* ---------- confirmação do pagamento (consulta a cada 5s) ---------- */
let pollTimer = null;
function startPolling(kind) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const status = await window.GramaPay.status(state.waitId, kind);
    if (status === 'paid' || status === 'captured' || (kind === 'pix' && status === 'authorized')) {
      trackPurchase(state.paidAmount ?? totals().total); showPaid();
    } else if (['refused', 'canceled', 'cancelled', 'expired'].includes(status)) showFailed();
  }, 5000);
}

/* ---------- envio do pedido ---------- */
form.addEventListener('submit', async e => {
  e.preventDefault();
  form.querySelectorAll('input').forEach(el => { el.dataset.touched = '1'; check(el); });
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const f = new FormData(form);
  const order = {
    model, quantity: clampQty(qty.value), method: state.method,
    customer: { name: f.get('nome').trim(), email: f.get('email').trim(), cpf: digits(f.get('cpf')), phone: digits(f.get('tel')) },
    address: { cep: digits(f.get('cep')), street: f.get('rua'), number: f.get('numero'), complement: f.get('compl'), neighborhood: f.get('bairro'), city: f.get('cidade'), state: f.get('uf') }
  };
  const total = totals().total;
  state.loading = true; show('', false); updateButton();
  try {
    if (state.method === 'cartao' && state.cardEnabled) {
      trackPaymentInfo(total);
      const r = await window.GramaPay.payCard(order);
      if (!r.ok) { show(r.message, true); return; }
      state.paidWith = 'card'; state.paidAmount = r.amount ?? total; state.waitId = r.id;
      if (['paid', 'captured', 'succeeded', 'completed'].includes(r.status)) { trackPurchase(state.paidAmount); showPaid(); }
      else if (['authorized', 'processing', 'pending', 'processed'].includes(r.status) && r.id) { window.GramaPay.unmountCard(); showScreen('cardwait'); startPolling('card'); }
      else if (r.status === 'canceled' || r.status === 'cancelled') show('Pagamento cancelado. Você pode tentar de novo.', true);
      else show('Cartão não aprovado. Confira os dados, tente outro cartão ou pague com Pix.', true);
    } else {
      const r = await window.GramaPay.payPix(order);
      if (!r.ok) { show(r.message, true); return; }
      state.pix = r.pix; state.waitId = r.pix.id; state.paidWith = 'pix'; state.paidAmount = r.pix.amount ?? total;
      window.GramaPay.unmountCard();
      showPix(r.pix); startPolling('pix'); trackPaymentInfo(state.paidAmount);
      trackPurchase(state.paidAmount); // Pix gerado = venda marcada no Pixel na hora
    }
  } catch {
    show('Não foi possível concluir agora. Tente de novo em instantes.', true);
  } finally {
    state.loading = false; updateButton();
  }
});
