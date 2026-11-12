/**
 * URL de conexão usada em tempo de execução. Padrão: a URL como veio (pooler do Supabase em modo
 * sessão, porta 5432). O modo transação (6543) TRAVOU páginas na Vercel duas vezes (16/10 e 29/10:
 * "Task timed out after 300 seconds" no painel e na home, minutos depois de publicar): a conexão
 * ficava presa sem resposta. Fica só como opção explícita, `DB_POOL_MODE=transaction`, para testes.
 *
 * O limite de 15 clientes do modo sessão é protegido de outro jeito: as imagens (/media) saem
 * prontas da publicação e não abrem conexão por visita.
 */
export function runtimeDatabaseUrl(url: string, env: Record<string, string | undefined> = process.env): string {
  if (env.DB_POOL_MODE !== "transaction") return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.hostname.endsWith(".pooler.supabase.com") || u.port !== "5432") return url;
  u.port = "6543";
  return u.toString();
}
