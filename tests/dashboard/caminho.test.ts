import { expect, test } from "vitest";
import { caminhoDoPainel } from "@/components/dashboard/caminho";

const txt = (p: string, n?: Record<string, string>) =>
  caminhoDoPainel(p, n).map((x) => (x.href ? `[${x.label}]` : x.label)).join(" > ");

test("caminhos esperados", () => {
  expect(txt("/dashboard")).toBe("Dashboard");
  expect(txt("/dashboard/content/products")).toBe("[Dashboard] > Conteúdo > Produtos");
  expect(txt("/dashboard/content/schedules")).toBe("[Dashboard] > Conteúdo > Conteúdo programado");
  expect(txt("/dashboard/students")).toBe("[Dashboard] > Alunos");
  expect(txt("/dashboard/students/tags")).toBe("[Dashboard] > [Alunos] > Tags");
  expect(txt("/dashboard/students/imports")).toBe("[Dashboard] > [Alunos] > Importações");
  expect(txt("/dashboard/sales")).toBe("[Dashboard] > Vendas");
  expect(txt("/dashboard/sales/deliveries")).toBe("[Dashboard] > [Vendas] > Entregas");
  expect(txt("/dashboard/reports")).toBe("[Dashboard] > Relatórios");
  expect(txt("/dashboard/settings")).toBe("[Dashboard] > Configurações");
});

test("produto, aula e aluno usam o nome registrado pela página", () => {
  const n = {
    "/dashboard/content/product/7": "INICIO DA JORNADA",
    "/dashboard/content/product/7/lesson/9": "Boas-vindas",
    "/dashboard/student/3": "Amanda C Silva",
  };
  expect(txt("/dashboard/content/product/7", n)).toBe("[Dashboard] > Conteúdo > [Produtos] > INICIO DA JORNADA");
  expect(txt("/dashboard/content/product/7/schedule", n)).toBe(
    "[Dashboard] > Conteúdo > [Produtos] > [INICIO DA JORNADA] > Conteúdo programado",
  );
  expect(txt("/dashboard/content/product/7/lesson/9", n)).toBe("[Dashboard] > Conteúdo > [Produtos] > [INICIO DA JORNADA] > Boas-vindas");
  expect(txt("/dashboard/student/3", n)).toBe("[Dashboard] > [Alunos] > Amanda C Silva");
  expect(txt("/dashboard/student/3/logs", n)).toBe("[Dashboard] > [Alunos] > [Amanda C Silva] > Logs");
  // Sem nome ainda: texto genérico.
  expect(txt("/dashboard/content/product/8")).toBe("[Dashboard] > Conteúdo > [Produtos] > Produto");
});
