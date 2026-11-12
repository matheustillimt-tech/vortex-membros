/**
 * Erro de domínio do painel: a mensagem é escrita para o produtor e pode ir para a interface.
 * Qualquer outro erro (banco, driver, bug) é logado no servidor e vira uma mensagem genérica.
 */
export class AdminError extends Error {
  override name = "AdminError";
}
