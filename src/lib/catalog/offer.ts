export function buildOfferUrl(offerUrl: string | null, email: string): string | null {
  if (!offerUrl) return null;
  const sep = offerUrl.includes("?") ? (/[?&]$/.test(offerUrl) ? "" : "&") : "?";
  return `${offerUrl}${sep}email=${encodeURIComponent(email)}`;
}
