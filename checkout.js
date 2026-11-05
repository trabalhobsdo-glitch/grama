// Mesmos valores da loja (index/app.js). Se mudar o preço, mude nos dois.
const MODELS = {
  rodas: { label: 'Com rodas', cents: 22990, image: 'grasscut-comparativo' },
  sem: { label: 'Sem rodas', cents: 16990, image: 'sem-rodas' }
};
const CONFIG = {
  shippingCents: null,   // null = não mostra frete. 0 = "Grátis". Ou valor em centavos.
  maxInstallments: 1     // 1 = só à vista. Sem cálculo de juros aqui.
};

const $ = s => document.querySelector(s);
const form = $('#co-form'), msg = $('#co-msg'), submit = $('#co-submit'), qty = $('#co-qty');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const params = new URLSearchParams(location.search);
const model = MODELS[params.get('modelo')] ? params.get('modelo') : 'rodas';
const clampQty = v => Math.min(99, Math.max(1, Math.floor(Number(v)) || 1));
qty.value = clampQty(params.get('qtd'));

function totals() {
  const sub = MODELS[model].cents * clampQty(qty.value);
  const ship = CONFIG.shippingCents || 0;
  return { sub, ship, total: sub + ship };
}
function render() {
  const t = totals();
  $('#co-model').textContent = MODELS[model].label;
  $('#co-img').src = 'media/' + MODELS[model].image + '.webp';
  $('#co-sub').textContent = brl.format(t.sub / 100);
  $('#co-ship-row').hidden = CONFIG.shippingCents === null;
  $('#co-ship').textContent = t.ship ? brl.format(t.ship / 100) : 'Grátis';
  $('#co-total').textContent = brl.format(t.total / 100);
  submit.textContent = 'Confirmar pedido · ' + brl.format(t.total / 100);
  const [dec, inc] = document.querySelectorAll('[data-step]');
  dec.disabled = clampQty(qty.value) <= 1; inc.disabled = clampQty(qty.value) >= 99;
  const sel = $('#parcelas'), n = CONFIG.maxInstallments;
  sel.innerHTML = '';
  for (let i = 1; i <= n; i++) sel.add(new Option(i === 1 ? 'À vista · ' + brl.format(t.total / 100) : i + 'x de ' + brl.format(t.total / i / 100), i));
}
document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { qty.value = clampQty(clampQty(qty.value) + Number(b.dataset.step)); render(); }));
qty.addEventListener('change', () => { qty.value = clampQty(qty.value); render(); });
render();

// Máscaras e validações
const digits = v => v.replace(/\D/g, '');
const mask = (id, fn) => $(id).addEventListener('input', e => { e.target.value = fn(digits(e.target.value)); check(e.target); });
mask('#cpf', d => d.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'));
mask('#tel', d => d.slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2'));
mask('#cep', d => d.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'));
mask('#cc-num', d => d.slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 '));
mask('#cc-val', d => d.slice(0, 4).replace(/(\d{2})(\d)/, '$1/$2'));
mask('#cc-cvv', d => d.slice(0, 4));
$('#uf').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z]/gi, '').toUpperCase(); });

function cpfOk(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const n of [9, 10]) {
    let s = 0; for (let i = 0; i < n; i++) s += c[i] * (n + 1 - i);
    if ((s * 10 % 11) % 10 !== Number(c[n])) return false;
  }
  return true;
}
function luhnOk(n) {
  if (n.length < 13) return false;
  let s = 0; [...n].reverse().forEach((ch, i) => { let d = +ch; if (i % 2) { d *= 2; if (d > 9) d -= 9; } s += d; });
  return s % 10 === 0;
}
function expiryOk(v) {
  const [m, y] = v.split('/').map(Number);
  if (!m || m > 12 || y === undefined || isNaN(y)) return false;
  return new Date(2000 + y, m, 1) > new Date();
}
const rules = {
  cpf: v => cpfOk(digits(v)) ? '' : 'CPF inválido.',
  tel: v => digits(v).length >= 10 ? '' : 'Informe o DDD e o número.',
  cep: v => digits(v).length === 8 ? '' : 'CEP com 8 números.',
  'cc-num': v => luhnOk(digits(v)) ? '' : 'Número de cartão inválido.',
  'cc-val': v => expiryOk(v) ? '' : 'Validade inválida.',
  'cc-cvv': v => digits(v).length >= 3 ? '' : 'Código inválido.',
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

// Cartão ou Pix
const card = $('#card-fields');
form.addEventListener('change', e => {
  if (e.target.name !== 'metodo') return;
  const isCard = e.target.value === 'cartao';
  card.hidden = !isCard; card.disabled = !isCard;
});

function show(html, error) { msg.className = 'co-msg' + (error ? ' err' : ''); msg.replaceChildren(); msg.append(html); msg.hidden = false; }

form.addEventListener('submit', async e => {
  e.preventDefault();
  form.querySelectorAll('input').forEach(el => { el.dataset.touched = '1'; check(el); });
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const f = new FormData(form), t = totals(), method = f.get('metodo');
  const order = {
    items: [{ model: MODELS[model].label, quantity: clampQty(qty.value), unitCents: MODELS[model].cents }],
    totalCents: t.total,
    customer: { name: f.get('nome'), email: f.get('email'), cpf: digits(f.get('cpf')), phone: digits(f.get('tel')) },
    address: { zip: digits(f.get('cep')), street: f.get('rua'), number: f.get('numero'), complement: f.get('compl'), district: f.get('bairro'), city: f.get('cidade'), state: f.get('uf') },
    method,
    card: method === 'cartao' ? { number: digits(f.get('cc-num')), name: f.get('cc-nome'), expiry: f.get('cc-val'), cvv: f.get('cc-cvv'), installments: Number(f.get('parcelas')) } : undefined
  };
  submit.disabled = true; msg.hidden = true;
  try {
    const res = await window.GramaPay.pay(order);
    if (res.redirectUrl) { location.href = res.redirectUrl; return; }
    if (res.pixCode) {
      const box = document.createElement('div');
      const code = document.createElement('code'); code.textContent = res.pixCode;
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copiar código Pix';
      copy.onclick = () => navigator.clipboard.writeText(res.pixCode).then(() => { copy.textContent = 'Código copiado'; });
      box.append('Pague com Pix copia e cola: ', code, document.createElement('br'), copy);
      show(box, false);
    } else {
      show(res.message || 'Pedido recebido.', !res.ok);
    }
  } catch {
    show('Não foi possível concluir agora. Tente de novo em instantes.', true);
  } finally {
    submit.disabled = false;
  }
});
