import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { createTestDb } from "../helpers/db";
import { kiwifyRaw } from "../helpers/kiwify";
import { ensureKiwifyWebhookSecret, verifyKiwifySignature } from "@/lib/sales/kiwify";
import { getPlatformSettings, KIWIFY_SECRET_PATTERN } from "@/lib/settings";

test("verifyKiwifySignature: HMAC-SHA1 hex do corpo cru, em tempo constante", () => {
  const raw = kiwifyRaw("paid");
  const sig = createHmac("sha1", "tok-123").update(raw).digest("hex");
  expect(verifyKiwifySignature(raw, sig, "tok-123")).toBe(true);
  expect(verifyKiwifySignature(raw, sig.toUpperCase(), "tok-123")).toBe(true);
  expect(verifyKiwifySignature(raw, sig, "outro")).toBe(false);
  expect(verifyKiwifySignature(raw + " ", sig, "tok-123")).toBe(false);
  expect(verifyKiwifySignature(raw, null, "tok-123")).toBe(false);
  expect(verifyKiwifySignature(raw, "", "tok-123")).toBe(false);
  expect(verifyKiwifySignature(raw, "zz", "tok-123")).toBe(false);
});

test("ensureKiwifyWebhookSecret gera uma vez e mantém", async () => {
  const db = await createTestDb();
  const a = await ensureKiwifyWebhookSecret(db);
  expect(a).toMatch(KIWIFY_SECRET_PATTERN);
  expect(await ensureKiwifyWebhookSecret(db)).toBe(a);
  expect((await getPlatformSettings(db)).kiwify.webhookSecret).toBe(a);
});
