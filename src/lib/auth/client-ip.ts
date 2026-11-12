/** IP do cliente para os limites: x-real-ip, depois o primeiro item de x-forwarded-for, senão "0". */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0";
}
