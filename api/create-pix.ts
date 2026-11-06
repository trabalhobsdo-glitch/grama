import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIP } from "node:net";
import { clean, readOrder } from "./_shared.js";

// PIX via Unipay (plataforma FastSoft White Label). Docs: https://developers.fastsoftbrasil.com
// O CARTÃO fica na Pagou (api/create-card.ts).
//
// Variáveis de ambiente na Vercel:
//   UNIPAY_API_KEY -> chave secreta (Painel Unipay > Configurações > Chave de API) (obrigatória)
//   UNIPAY_API_URL -> opcional. Padrão: https://api.unipaybr.com
//                     Se o diagnóstico (/api/create-pix?diag=1) mostrar 401/404, troque para https://api.fastsoftbrasil.com
const getToken = () => clean(process.env.UNIPAY_API_KEY || process.env.UNIPAY_SECRET_KEY);
const getBase = () => clean(process.env.UNIPAY_API_URL).replace(/\/+$/, "").replace(/\/api$/, "") || "https://api.unipaybr.com";
// Autenticação Basic: base64("x:CHAVE_SECRETA")
const authHeader = (token: string) => ({ Authorization: `Basic ${Buffer.from(`x:${token}`).toString("base64")}` });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getToken();
  const base = getBase();

  // Diagnóstico: abra /api/create-pix?diag=1 no navegador. Nunca mostra a chave.
  if (req.method === "GET" && req.query?.diag) {
    const out: Record<string, unknown> = { gateway: "unipay", baseUrl: base, tokenConfigured: !!token, tokenLength: token.length };
    if (token) {
      // 200 = chave OK | 401 = chave errada ou endereço errado
      const probe = async (b: string) => {
        try { return (await fetch(`${b}/api/user/wallet/balance`, { headers: authHeader(token) })).status; }
        catch { return "sem_conexao"; }
      };
      out.authStatus = await probe(base);
      const alt = base.includes("fastsoftbrasil") ? "https://api.unipaybr.com" : "https://api.fastsoftbrasil.com";
      out.alternativo = { baseUrl: alt, authStatus: await probe(alt) };
    }
    return res.status(200).json(out);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!token) return res.status(500).json({ error: "Pagamento não configurado (UNIPAY_API_KEY ausente)." });

  const { customer, address, fbp, fbc, sourceUrl } = (req.body ?? {}) as any;
  const o = readOrder(req.body);
  if ("error" in o) return res.status(400).json({ error: o.error });

  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  const postbackUrl = host && !/localhost|127\.0\.0\.1/.test(host) ? `https://${host}/api/webhook` : undefined;

  const payload = {
    amount: o.amount,
    paymentMethod: "PIX",
    customer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim(),
      document: { number: o.cpf, type: "CPF" },
      phone: o.phone,
    },
    shipping: {
      fee: 0, // o frete (se houver) já entra como item, para nunca cobrar 2x
      address: {
        street: String(address.street),
        streetNumber: String(address.number),
        ...(address.complement ? { complement: String(address.complement) } : {}),
        zipCode: o.zip,
        neighborhood: String(address.neighborhood),
        city: String(address.city),
        state: String(address.state).toUpperCase(),
        country: "br",
      },
    },
    items: o.items,
    traceable: true,
    ...(ip && isIP(ip) ? { ip } : {}),
    ...(postbackUrl ? { postbackUrl } : {}),
    metadata: {
      oferta: o.offerId,
      quantidade: String(o.qty),
      fbp: String(fbp ?? "").slice(0, 120),
      fbc: String(fbc ?? "").slice(0, 200),
      url: String(sourceUrl ?? "").slice(0, 300),
      ua: String(req.headers["user-agent"] ?? "").slice(0, 300),
      ip: ip || "",
    },
    pix: { expiresInDays: 1 },
  };

  try {
    const r = await fetch(`${base}/api/user/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify(payload),
    });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Unipay error", r.status, JSON.stringify(json));
      const detail = Array.isArray(json?.message) ? json.message.join("; ") : json?.message;
      const msg = r.status === 401 || r.status === 403
        ? "Pagamento temporariamente indisponível. Tente novamente em instantes."
        : r.status === 400 || r.status === 422
          ? `Confira os dados informados${detail ? ` (${String(detail).slice(0, 120)})` : ""}.`
          : "Não foi possível gerar o Pix. Tente novamente.";
      return res.status(502).json({ error: msg });
    }
    const tx = json?.data ?? json;
    const qrcode = tx?.pix?.qrcode ?? tx?.pix?.qrCode ?? tx?.pix?.qr_code;
    if (!tx?.id || !qrcode) {
      console.error("Resposta inesperada da Unipay", JSON.stringify(json));
      return res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
    }
    return res.status(200).json({
      id: tx.id,
      qrcode,
      expirationDate: tx.pix?.expirationDate ?? null,
      amount: tx.amount ?? o.amount,
      status: String(tx.status ?? "waiting_payment").toLowerCase(),
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Falha de comunicação com o gateway de pagamento." });
  }
}
