import type { Metadata, Viewport } from "next";
import { getSharingMetadata } from "@/lib/sharing-metadata";
import "./globals.css";

// Sem web fonts: a pilha system-ui (definida em globals.css).
// Sem `antialiased`: usa a suavização padrão do sistema (no Mac o texto fica mais encorpado).
const BASE_METADATA: Metadata = {
  title: "Vórtex Membros",
  description: "Seus cursos e conteúdos em um só lugar.",
};

/** Prévia dos links (Configurações → Compartilhamento) por cima do padrão. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...BASE_METADATA, ...(await getSharingMetadata()) };
}

// Tela travada no tamanho do celular: sem zoom ao focar campo (letra < 16px)
// e sem pinça, para a página não abrir ampliada nem balançar para os lados.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
