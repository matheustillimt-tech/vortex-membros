import { readFileSync } from "node:fs";
import path from "node:path";

export type KiwifyFixture = "paid" | "refunded" | "chargedback" | "subscription-test-paid";

/** Payloads de exemplo (fictícios) da Kiwify em tests/fixtures/kiwify. */
export function kiwifyRaw(name: KiwifyFixture): string {
  return readFileSync(path.resolve(__dirname, `../fixtures/kiwify/${name}.json`), "utf8");
}

/** Cópia nova do payload (pode ser alterada no teste). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON livre do gateway
export function kiwifyPayload(name: KiwifyFixture): Record<string, any> {
  return JSON.parse(kiwifyRaw(name));
}
