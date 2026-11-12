/** % de aulas vistas (0 sem aulas). */
export function progressPercent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
}

/** Título do trilho de progresso sob a capa: "N de M - X%". */
export function progressTitle(done: number, total: number): string {
  return `${done} de ${total} - ${progressPercent(done, total)}%`;
}

/** Texto comparável para a busca de capas: minúsculo, sem acentos e espaços repetidos. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A capa aparece se o nome contém o termo buscado (termo vazio mostra tudo). */
export function matchesSearch(name: string, query: string): boolean {
  const q = normalizeSearch(query);
  return q === "" || normalizeSearch(name).includes(q);
}
