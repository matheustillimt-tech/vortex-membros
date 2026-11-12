/**
 * Cookie que guarda o menu lateral recolhido (lido no servidor para a página já chegar no estado certo).
 * Fica neste módulo comum (sem "use client") para o layout do servidor receber o texto, não uma referência.
 */
export const MENU_COOKIE = "painel-menu";

/** Um passo do caminho no topo do painel. O último é a página atual; os outros podem ter link. */
export type Passo = { label: string; href?: string };

const D: Passo = { label: "Dashboard", href: "/dashboard" };

const PRODUTO_ABAS: Record<string, string> = {
  general: "Geral",
  "product-page": "Página do produto",
  "lesson-page": "Página da aula",
  terms: "Termo de aceite",
  schedule: "Conteúdo programado",
};
const ALUNO_ABAS: Record<string, string> = { purchases: "Compras", products: "Produtos", logs: "Logs" };
const CONFIG: Record<string, string> = {
  "student-area": "Área do aluno",
  "student-area/terms": "Termo de aceite no primeiro acesso",
  "access-screens": "Telas de acesso",
  "admin-area": "Painel administrativo",
  administrators: "Administradores",
  emails: "E-mails",
  "security/auth": "Autenticação",
  sharing: "Compartilhamento",
};

/**
 * Caminho mostrado no topo (breadcrumb): "Dashboard › Conteúdo › Produtos",
 * "Dashboard › Alunos › Fulano". Grupos sem página própria (Conteúdo) aparecem sem link.
 * `nomes` traz nomes de produtos/alunos/aulas registrados pelas páginas (sem nome: texto genérico).
 */
export function caminhoDoPainel(pathname: string, nomes: Record<string, string> = {}): Passo[] {
  const p = pathname.replace(/\/+$/, "") || "/";
  const s = p.split("/").slice(2); // depois de /dashboard
  const nome = (href: string, padrao: string) => nomes[href] ?? padrao;
  if (s.length === 0) return [{ label: "Dashboard" }];
  const [a, b, c, d, e] = s;

  if (a === "content") {
    const conteudo: Passo = { label: "Conteúdo" };
    const produtos: Passo = { label: "Produtos", href: "/dashboard/content/products" };
    if (b === "products") return [D, conteudo, { label: "Produtos" }];
    if (b === "schedules") return [D, conteudo, { label: "Conteúdo programado" }];
    if (b === "banners") {
      if (!c) return [D, conteudo, { label: "Banners" }];
      return [D, conteudo, { label: "Banners", href: "/dashboard/content/banners" }, { label: "Banner" }];
    }
    if (b === "product" && c) {
      const href = `/dashboard/content/product/${c}`;
      const prod = nome(href, "Produto");
      if (!d) return [D, conteudo, produtos, { label: prod }];
      const linkProd: Passo = { label: prod, href };
      if (d === "lesson" && e) return [D, conteudo, produtos, linkProd, { label: nome(`${href}/lesson/${e}`, "Aula") }];
      return [D, conteudo, produtos, linkProd, { label: PRODUTO_ABAS[d] ?? "Produto" }];
    }
    return [D, conteudo];
  }

  if (a === "students") {
    if (!b) return [D, { label: "Alunos" }];
    const alunos: Passo = { label: "Alunos", href: "/dashboard/students" };
    if (b === "tags") return [D, alunos, { label: "Tags" }];
    if (b === "imports") return [D, alunos, { label: "Importações" }];
    return [D, alunos];
  }

  if (a === "student" && b) {
    const alunos: Passo = { label: "Alunos", href: "/dashboard/students" };
    const href = `/dashboard/student/${b}`;
    const aluno = nome(href, "Aluno");
    if (!c || !ALUNO_ABAS[c]) return [D, alunos, { label: aluno }];
    return [D, alunos, { label: aluno, href }, { label: ALUNO_ABAS[c] }];
  }

  if (a === "sales") {
    if (!b) return [D, { label: "Vendas" }];
    const vendas: Passo = { label: "Vendas", href: "/dashboard/sales" };
    if (b === "deliveries") {
      if (!c) return [D, vendas, { label: "Entregas" }];
      const entregas: Passo = { label: "Entregas", href: "/dashboard/sales/deliveries" };
      if (c === "kiwify-instrucoes") return [D, vendas, entregas, { label: "Instruções da Kiwify" }];
      if (c === "new" || c === "create") return [D, vendas, entregas, { label: "Nova entrega" }];
      return [D, vendas, entregas, { label: "Editar entrega" }];
    }
    return [D, vendas];
  }

  if (a === "reports") {
    if (!b) return [D, { label: "Relatórios" }];
    const rel: Passo = { label: "Relatórios", href: "/dashboard/reports" };
    if (b === "students") return [D, rel, { label: "Alunos" }];
    if (b === "products") {
      if (!c) return [D, rel, { label: "Produtos" }];
      const href = `/dashboard/reports/products/${c}`;
      return [D, rel, { label: "Produtos", href: "/dashboard/reports/products" }, { label: nome(href, "Produto") }];
    }
    return [D, rel];
  }

  if (a === "settings") {
    if (!b) return [D, { label: "Configurações" }];
    const cfg: Passo = { label: "Configurações", href: "/dashboard/settings" };
    if (b === "administrators" && c) {
      return [D, cfg, { label: "Administradores", href: "/dashboard/settings/administrators" }, { label: "Administrador" }];
    }
    const rotulo = CONFIG[s.slice(1).join("/")] ?? CONFIG[b];
    return rotulo ? [D, cfg, { label: rotulo }] : [D, cfg];
  }

  return [D];
}
