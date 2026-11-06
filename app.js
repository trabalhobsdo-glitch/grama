const variants = {
  rodas: { label: 'Com rodas', cents: 22990, image: 'grasscut-comparativo', alt: 'Cortador GramaZero vermelho com rodas removíveis' },
  sem: { label: 'Sem rodas', cents: 16990, image: 'sem-rodas', alt: 'Cortador GramaZero vermelho sem rodas' }
};
const photos = { ...variants, kit: { image: 'kit-detalhe', alt: 'GramaZero com baterias, carregador e peças de corte' } };
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const quantityInput = document.querySelector('#purchase-quantity');
const stepButtons = document.querySelectorAll('[data-step]');
const purchaseImage = document.querySelector('#purchase-image');
const photoButtons = document.querySelectorAll('[data-offer-image]');
const orderButton = document.querySelector('#order-link');

function selectedModel() {
  return document.querySelector('input[name="modelo"]:checked').value;
}
function quantity() {
  return Math.min(99, Math.max(1, Math.floor(quantityInput.valueAsNumber) || 1));
}
function orderSummary() {
  const count = quantity();
  const variant = variants[selectedModel()];
  return {
    model: variant.label,
    count,
    units: count === 1 ? '1 unidade' : count + ' unidades',
    total: currency.format(variant.cents * count / 100)
  };
}
function syncOrder() {
  const order = orderSummary();
  document.querySelector('#selection').textContent = order.model + ' · ' + order.units;
  document.querySelector('#purchase-total').textContent = order.total;
  document.querySelector('#mobile-selection').textContent = order.model + ' · ' + order.count + ' un.';
  document.querySelector('#mobile-total').textContent = order.total;
  stepButtons[0].disabled = order.count <= 1;
  stepButtons[1].disabled = order.count >= 99;
}
function showPurchasePhoto(key) {
  const photo = photos[key];
  purchaseImage.src = 'media/' + photo.image + '.webp';
  purchaseImage.alt = photo.alt;
  for (const button of photoButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.offerImage === key));
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    purchaseImage.animate([{opacity: 0.45, transform: 'scale(.97)'}, {opacity: 1, transform: 'scale(1)'}], {duration: 280});
  }
}
for (const button of photoButtons) {
  button.addEventListener('click', () => showPurchasePhoto(button.dataset.offerImage));
}
document.querySelector('#purchase-variants').addEventListener('change', () => {
  showPurchasePhoto(selectedModel());
  syncOrder();
});
for (const button of stepButtons) {
  button.addEventListener('click', () => {
    quantityInput.value = Math.min(99, Math.max(1, quantity() + Number(button.dataset.step)));
    syncOrder();
  });
}
quantityInput.addEventListener('input', syncOrder);
quantityInput.addEventListener('change', () => {
  quantityInput.value = quantity();
  syncOrder();
});
orderButton.addEventListener('click', () => {
  const model = selectedModel(), qty = quantity();
  const url = 'checkout.html?modelo=' + model + '&qtd=' + qty;
  window.fbq?.('track', 'AddToCart', { content_name: 'GramaZero ' + model, content_type: 'product', content_ids: [model], num_items: qty, value: variants[model].cents * qty / 100, currency: 'BRL' });
  setTimeout(() => { location.href = url; }, 150);
});
syncOrder();

const clock = document.querySelector('#offer-clock');
const progress = document.querySelector('#offer-progress');
const timer = clock.closest('.offer-timer');
const timerSeconds = 600;
const offerDeadlineKey = 'grasscut-offer-deadline';

function getOfferDeadline() {
  try {
    return Number(localStorage.getItem(offerDeadlineKey)) || 0;
  } catch {
    return 0;
  }
}

function startTimer(deadline = Date.now() + timerSeconds * 1000) {
  try {
    localStorage.setItem(offerDeadlineKey, String(deadline));
  } catch {
    // The countdown still works during this visit when storage is unavailable.
  }
  window.setInterval(updateTimer, 250);
  updateTimer();

  function updateTimer() {
    const duration = timerSeconds * 1000;
    const elapsed = Math.max(0, Date.now() - (deadline - duration));
    const remaining = Math.ceil((duration - elapsed % duration) / 1000);
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const seconds = String(remaining % 60).padStart(2, '0');
    clock.textContent = minutes + ':' + seconds;
    progress.value = remaining;
    timer.classList.toggle('timer-ending', remaining <= 60);
  }
}

const video = document.querySelector('#demo-video');
const playButton = document.querySelector('.video-play');
playButton.hidden = false;
playButton.addEventListener('click', () => {
  video.play().catch(() => { playButton.hidden = true; });
});
video.addEventListener('play', () => { playButton.hidden = true; });

const galleryImage = document.querySelector('#gallery-image');
const galleryButtons = document.querySelectorAll('[data-image]');
const dialog = document.querySelector('#zoom');
const zoomImage = dialog.querySelector('img');

for (const button of galleryButtons) {
  button.addEventListener('click', () => {
    galleryImage.src = 'media/' + button.dataset.image + '.webp';
    galleryImage.alt = button.dataset.alt;
    for (const control of galleryButtons) {
      control.setAttribute('aria-pressed', String(control === button));
    }
  });
}
function openZoom(source) {
  zoomImage.src = source.src;
  zoomImage.alt = source.alt;
  dialog.showModal();
}
document.querySelector('.image-open').addEventListener('click', () => openZoom(galleryImage));
document.querySelector('.purchase-photo').addEventListener('click', () => openZoom(purchaseImage));
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

if ('IntersectionObserver' in window) {
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(element => reveal.observe(element));
}

const savedOfferDeadline = getOfferDeadline();
if (savedOfferDeadline) {
  startTimer(savedOfferDeadline);
} else if ('IntersectionObserver' in window) {
  const timerObserver = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      timerObserver.disconnect();
      startTimer();
    }
  });
  timerObserver.observe(timer);
} else {
  startTimer();
}

const useImage = document.querySelector('#use-image');
const useCaption = document.querySelector('#use-caption');
const useChoices = document.querySelectorAll('[data-use]');
for (const choice of useChoices) {
  choice.addEventListener('click', () => {
    useImage.src = 'media/' + choice.dataset.use + '.webp';
    useImage.alt = choice.dataset.alt;
    useCaption.textContent = choice.querySelector('b').textContent + ' / ' +
      choice.querySelector('strong').textContent;
    for (const option of useChoices) {
      option.setAttribute('aria-pressed', String(option === choice));
    }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      useImage.animate([{opacity: 0.4}, {opacity: 1}], {duration: 280});
    }
  });
}
