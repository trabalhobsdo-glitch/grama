import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { clean, readOrder } from "./_shared.js";

// Cartão de crédito via Pagou (API v2) com o Payment Element (formulário seguro da Pagou).
// Os dados do cartão NUNCA passam pelo seu servidor: o navegador troca o cartão por um token "pgct_..."
// e só esse token chega aqui.
//
// Variáveis de ambiente na Vercel:
//   PAGOU_API_KEY         -> token secreto da Pagou (obrigatória)
//   PAGOU_PUBLISHABLE_KEY -> chave pública (pk_live_... ou pk_test_...). Sem ela, a opção de cartão fica oculta.
//   PAGOU_ENV             -> opcional: "sandbox" para testar
const getBase = () => (String(process.env.PAGOU_ENV ?? "").trim().toLowerCase() === "sandbox" ? "https://api.sandbox.pagou.ai" : "https://api.pagou.ai");
const getToken = () => clean(process.env.PAGOU_API_KEY || process.env.PAGOU_TOKEN || process.env.PAGOU_SECRET_KEY);
const getPublishable = () => clean(process.env.PAGOU_PUBLISHABLE_KEY || process.env.PAGOU_PUBLIC_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getToken();
  const base = getBase();
  const pk = getPublishable();

  // O site pergunta aqui se o cartão está disponível e qual a chave pública (segura para o navegador).
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      enabled: !!(token && pk),
      publishableKey: pk || null,
      sandbox: base.includes("sandbox") || pk.startsWith("pk_test"),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!token) return res.status(500).json({ error: "Pagamento não configurado (PAGOU_API_KEY ausente)." });

  const { customer, address, token: cardToken } = (req.body ?? {}) as any;
  if (typeof cardToken !== "string" || !/^pg(ct|pm)_[A-Za-z0-9_-]+$/.test(cardToken)) {
    return res.status(400).json({ error: "Não foi possível ler os dados do cartão. Confira e tente de novo." });
  }
  const o = readOrder(req.body);
  if ("error" in o) return res.status(400).json({ error: o.error });

  const products = o.items.map((i) => ({ name: i.title, price: i.unitPrice, quantity: i.quantity, tangible: i.tangible, sku: i.externalRef }));

  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  const notifyUrl = host && !/localhost|127\.0\.0\.1/.test(host) ? `https://${host}/api/webhook` : undefined;

  const payload = {
    external_ref: `gz-${randomUUID()}`,
    amount: o.amount,
    currency: "BRL",
    method: "credit_card",
    token: cardToken,
    installments: 1,
    ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    buyer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim(),
      phone: o.phone.length > 11 ? `+${o.phone}` : `+55${o.phone}`,
      document: { type: "CPF", number: o.cpf },
      address: {
        street: String(address.street),
        number: String(address.number),
        ...(address.complement ? { complement: String(address.complement) } : {}),
        neighborhood: String(address.neighborhood),
        city: String(address.city),
        state: String(address.state).toUpperCase(),
        zipCode: o.zip,
        country: "BR",
      },
    },
    products,
    traceable: true,
    ...(ip && isIP(ip) ? { ip_address: ip } : {}),
    informations: [
      { key: "oferta", value: o.offerId },
      { key: "quantidade", value: String(o.qty) },
      { key: "pagamento", value: "cartao" },
    ],
  };

  try {
    const r = await fetch(`${base}/v2/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Pagou card error", r.status, JSON.stringify(json));
      const first = Array.isArray(json?.errors) && json.errors[0] ? `${json.errors[0].field ?? ""}: ${json.errors[0].message ?? ""}`.trim() : "";
      const msg = r.status === 401 || r.status === 403
        ? "Pagamento temporariamente indisponível. Tente novamente em instantes."
        : r.status === 422
          ? `Confira os dados informados${first ? ` (${first})` : ""}.`
          : json?.detail || json?.message || "Não foi possível processar o cartão. Tente outro cartão ou pague com Pix.";
      return res.status(502).json({ error: msg });
    }
    const tx = json?.data ?? json;
    if (!tx?.id) {
      console.error("Resposta inesperada da Pagou (cartão)", JSON.stringify(json));
      return res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
    }
    // O navegador (SDK da Pagou) usa id/status/next_action para continuar a confirmação 3D Secure, se houver.
    return res.status(200).json({
      data: { id: tx.id, status: tx.status, next_action: tx.next_action ?? null },
      amount: tx.amount ?? o.amount,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Falha de comunicação com o gateway de pagamento." });
  }
}
