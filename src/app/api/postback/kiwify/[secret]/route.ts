import { after, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { getAppUrl } from "@/lib/auth/app-url";
import { scheduleOutboxFlush } from "@/lib/email/send-now";
import { safeEqual, verifyKiwifySignature } from "@/lib/sales/kiwify";
import { processSale } from "@/lib/sales/process-sale";
import { recordSale } from "@/lib/sales/sales-store";
import { getPlatformSettings } from "@/lib/settings";
import { safeErrorSummary } from "@/lib/log";

export const maxDuration = 60;

const MAX_BODY_BYTES = 1024 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A assinatura vem na query (`?signature=`) ou no campo `signature` do corpo. Na query, vale o HMAC
 * do corpo cru; no corpo, o HMAC não pode incluir a si mesmo, então também vale o do corpo sem o campo.
 */
function signatureOk(req: NextRequest, raw: string, body: Record<string, unknown>, token: string): boolean {
  const fromQuery = req.nextUrl.searchParams.get("signature");
  if (fromQuery) return verifyKiwifySignature(raw, fromQuery, token);
  const fromBody = typeof body.signature === "string" ? body.signature : null;
  if (!fromBody) return false;
  if (verifyKiwifySignature(raw, fromBody, token)) return true;
  const { signature: _omit, ...rest } = body;
  void _omit;
  return verifyKiwifySignature(JSON.stringify(rest), fromBody, token);
}

/**
 * Webhook da Kiwify. Grava o evento antes de tudo e responde 200; o processamento roda depois da
 * resposta (e o cron/painel refazem se precisar). 401: segredo da URL ou assinatura não conferem;
 * 400: corpo não é um objeto JSON; 413: corpo acima de 1 MB. Erro de processamento nunca vira 500.
 * Nada de segredo, token ou corpo no log.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const db = getDb();
  const settings = await getPlatformSettings(db);
  const expected = settings.kiwify.webhookSecret;
  if (!expected || !safeEqual(secret, expected)) return json({ error: "unauthorized" }, 401);

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  const raw = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!isObj(body)) return json({ error: "invalid json" }, 400);

  const token = settings.kiwify.signatureToken;
  if (token && !signatureOk(req, raw, body, token)) return json({ error: "unauthorized" }, 401);

  const { id, duplicate } = await recordSale(db, "kiwify", body, raw);
  if (duplicate) return json({ ok: true, duplicate: true });

  const appUrl = getAppUrl(req.headers);
  after(async () => {
    try {
      await processSale(getDb(), id, { appUrl });
    } catch (err) {
      console.error(`[vendas] falha ao processar a venda ${id}:`, safeErrorSummary(err));
    }
    // Depois do processamento, para o e-mail que ele enfileirou já sair nesta requisição.
    scheduleOutboxFlush();
  });
  return json({ ok: true });
}
