/**
 * Endereço público do site para links enviados por e-mail: APP_URL → domínio de produção da
 * Vercel → origem da requisição (host + x-forwarded-proto) → localhost.
 */
export function getAppUrl(headers?: Headers): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  const host = headers?.get("x-forwarded-host")?.split(",")[0]?.trim() || headers?.get("host")?.trim();
  if (host && /^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) {
    const proto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ? "https" : "http";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}
