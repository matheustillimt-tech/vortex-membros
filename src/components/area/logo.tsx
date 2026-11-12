import { safeImageUrl } from "@/lib/theme";

/** Logo da plataforma (30px de altura; 31px no celular); sem imagem, o nome do site em 20px/30px peso 400. */
export function Logo({ src, siteName }: { src: string | null; siteName: string }) {
  const url = safeImageUrl(src);
  if (url) return <img src={url} alt={siteName} />;
  return <span className="vx-logo-text">{siteName}</span>;
}
