import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Uploads por server action: imagens (até 3 MB) e planilhas de importação (até 4 MB) + multipart;
  // o padrão é 1 MB. A Vercel recusa corpos acima de 4,5 MB antes de chegar à action.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite (banco local de dev) carrega arquivos .wasm/.data do próprio pacote; não pode ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Páginas/rotas de autenticação: nunca cachear e não vazar tokens via Referer para outros sites.
  async headers() {
    return [
      {
        source: "/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          // same-origin: nada vaza para outros sites (?login_token, token de redefinição), e o POST nativo
          // de formulário (antes da hidratação) leva o Origin real, que o Next exige nas server actions.
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/", destination: "/area/vitrine/home", permanent: false },
      // Link automático (/auth/login?login_token=...): 307 de verdade para /auth/token (a query é repassada).
      // A página de login também trata, mas lá o redirect sai via <meta> por causa do streaming.
      { source: "/auth/login", has: [{ type: "query", key: "login_token" }], destination: "/auth/token", permanent: false },
    ];
  },
};

export default nextConfig;
