// Funções e preços usados por todas as rotas /api.
// Arquivos que começam com "_" NÃO viram rota na Vercel.
//
// ⚠️ Os preços ficam no SERVIDOR: o navegador só manda "modelo" e "quantidade".
// Se mudar o preço, mude AQUI e também em app.js e checkout.js (valores em centavos).

export const clean = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");
export const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export const OFFERS: Record<string, { title: string; unitCents: number }> = {
  rodas: { title: "Cortador de Grama GramaZero Com Rodas", unitCents: 22990 },
  sem: { title: "Cortador de Grama GramaZero Sem Rodas", unitCents: 16990 },
};

// Frete: 0 = grátis. Se um dia cobrar frete, troque o valor (centavos) e o checkout.js (CONFIG.shippingCents).
export const SHIPPING_CENTS = 0;
export const SHIPPING_NAME = "Frete";

export function readOrder(body: any) {
  const { offerId, quantity, customer, address } = body ?? {};
  const offer = OFFERS[offerId];
  if (!offer) return { error: "Oferta inválida." } as const;

  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty < 1 || qty > 99) return { error: "Quantidade inválida." } as const;

  const cpf = digits(customer?.cpf);
  let phone = digits(customer?.phone);
  if (phone.startsWith("55") && phone.length > 11) phone = phone.slice(2);
  const zip = digits(address?.cep);
  if (!customer?.name || !customer?.email || cpf.length !== 11 || phone.length < 10 || zip.length !== 8 ||
      !address?.street || !address?.number || !address?.neighborhood || !address?.city || !address?.state) {
    return { error: "Preencha todos os dados obrigatórios." } as const;
  }

  // Itens cobrados (o valor total é calculado AQUI, nunca vem do navegador)
  const items = [
    { title: offer.title, unitPrice: offer.unitCents, quantity: qty, tangible: true, externalRef: String(offerId) },
    ...(SHIPPING_CENTS > 0 ? [{ title: SHIPPING_NAME, unitPrice: SHIPPING_CENTS, quantity: 1, tangible: false, externalRef: "frete" }] : []),
  ];
  const amount = items.reduce((t, p) => t + p.unitPrice * p.quantity, 0);
  return { offerId: String(offerId), offer, qty, cpf, phone, zip, items, amount } as const;
}
