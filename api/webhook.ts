import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { clean } from "./_shared.js";

// Recebe as notificações dos dois gateways:
//   Unipay (Pix):    { type: "transaction", objectId, data: { id, status, amount, ... } }
//   Pagou (cartão):  { id, data: { event_type, id, status, amount, ... } }
// Por padrão só registra nos Logs da Vercel. O site confirma o pagamento consultando /api/pix-status.
//
// OPCIONAL (Meta Conversions API): se você criar META_PIXEL_ID e META_CAPI_TOKEN na Vercel,
// a compra paga no Pix é enviada ao Meta direto do servidor. Sem as duas variáveis, nada é enviado.
const sha = (v: unknown) => createHash("sha256").update(String(v ?? "").trim().toLowerCase()).digest("hex");

async function sendMetaPurchase(d: any, id: string) {
  const pixel = clean(process.env.META_PIXEL_ID);
  const token = clean(process.env.META_CAPI_TOKEN);
  if (!pixel || !token) return;
  const m = d?.metadata ?? {};
  const phone = String(d?.customer?.phone ?? "").replace(/\D/g, "");
  const body = {
    data: [{
      event_name: "Purchase", event_time: Math.floor(Date.now() / 1000),
      event_id: "purchase_" + id, action_source: "website", event_source_url: m.url || undefined,
      user_data: {
        em: d?.customer?.email ? [sha(d.customer.email)] : undefined,
        ph: phone ? [sha(phone.startsWith("55") ? phone : "55" + phone)] : undefined,
        fn: d?.customer?.name ? [sha(String(d.customer.name).split(" ")[0])] : undefined,
        external_id: d?.customer?.document?.number ? [sha(d.customer.document.number)] : undefined,
        fbp: m.fbp || undefined, fbc: m.fbc || undefined,
        client_ip_address: m.ip || undefined, client_user_agent: m.ua || undefined,
      },
      custom_data: { currency: "BRL", value: Number(d?.amount ?? 0) / 100, content_type: "product", content_ids: m.oferta ? [m.oferta] : undefined },
    }],
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    console.log("[meta] Purchase", id, r.status);
  } catch (e) { console.error("[meta] falha", e); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const d = b?.data;
  if (b?.type === "transaction") {
    console.log("[webhook Unipay]", b?.objectId ?? d?.id, d?.status, d?.amount, d?.paymentMethod, d?.customer?.email);
    if (String(d?.status ?? "").toLowerCase() === "paid") await sendMetaPurchase(d, String(b?.objectId ?? d?.id));
  } else {
    console.log("[webhook Pagou]", b?.id, d?.event_type, d?.id, d?.status, d?.amount, d?.customer?.email);
  }
  return res.status(200).json({ received: true });
}
