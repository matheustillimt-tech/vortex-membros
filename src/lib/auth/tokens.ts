import { randomBytes } from "node:crypto";

/** Token de login por link (`login_token`): 48 bytes em base64url = 64 caracteres. */
export function generateLoginToken(): string {
  return randomBytes(48).toString("base64url");
}

/** Tokens legados são base64 padrão; o `+` chega como espaço após decodificar a query. */
export function normalizeLoginToken(raw: string): string {
  // Espaços viram "+" primeiro (um "+" inicial/final chega como espaço); só então remove \r\n\t das pontas.
  return raw.replaceAll(" ", "+").replace(/^[\r\n\t]+|[\r\n\t]+$/g, "");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
