import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clean } from "./_shared.js";

// Consulta o status de um pagamento. Dois gateways:
//   ?m=pix  -> Pix na Unipay  (GET /api/user/transactions/:id)
//   (sem m) -> cartão em análise na Pagou (GET /v2/transactions/:id)
// Status normalizados em minúsculas: paid, waiting_payment, refused, canceled, refunded...
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "ID inválido." });
  res.setHeader("Cache-Control", "no-store");

  if (String(req.query.m ?? "") === "pix") {
    const token = clean(process.env.UNIPAY_API_KEY || process.env.UNIPAY_SECRET_KEY);
    if (!token) return res.status(500).json({ error: "Pagamento não configurado." });
    const base = clean(process.env.UNIPAY_API_URL).replace(/\/+$/, "").replace(/\/api$/, "") || "https://api.unipaybr.com";
    try {
      const r = await fetch(`${base}/api/user/transactions/${id}`, {
        headers: { Authorization: `Basic ${Buffer.from(`x:${token}`).toString("base64")}` },
      });
      const json: any = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: "Não foi possível consultar o pagamento." });
      const tx = json?.data ?? json;
      return res.status(200).json({ status: String(tx?.status ?? "").toLowerCase() });
    } catch {
      return res.status(502).json({ error: "Falha ao consultar o pagamento." });
    }
  }

  const token = clean(process.env.PAGOU_API_KEY || process.env.PAGOU_TOKEN || process.env.PAGOU_SECRET_KEY);
  if (!token) return res.status(500).json({ error: "Pagamento não configurado." });
  const base = String(process.env.PAGOU_ENV ?? "").trim().toLowerCase() === "sandbox" ? "https://api.sandbox.pagou.ai" : "https://api.pagou.ai";
  try {
    const r = await fetch(`${base}/v2/transactions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "Não foi possível consultar o pagamento." });
    const tx = json?.data ?? json;
    return res.status(200).json({ status: String(tx?.status ?? "").toLowerCase() });
  } catch {
    return res.status(502).json({ error: "Falha ao consultar o pagamento." });
  }
}
