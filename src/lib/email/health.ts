import { INVALID_KEY_ERROR, type OutboxHealth } from "./outbox";

export type EmailHealthNotice = { tone: "warning" | "danger"; text: string };

const emails = (n: number) => `${n} ${n === 1 ? "e-mail" : "e-mails"}`;
const waits = (n: number) => (n === 1 ? "aguarda" : "aguardam");

/** Aviso da tela Configurações → E-mails sobre o envio (null = tudo certo). */
export function emailHealthNotice(h: OutboxHealth): EmailHealthNotice | null {
  if (!h.keyConfigured) {
    return {
      tone: "warning",
      text: h.queued + h.failed > 0
        ? `O envio de e-mails não está configurado. ${emails(h.queued + h.failed)} ${waits(h.queued + h.failed)} na fila e saem assim que a chave do Brevo for definida.`
        : "O envio de e-mails não está configurado. Os e-mails ficam na fila até a chave do Brevo ser definida.",
    };
  }
  if (h.failed > 0 && h.lastError === INVALID_KEY_ERROR) {
    return { tone: "danger", text: `A chave do Brevo foi recusada. ${emails(h.failed)} ${waits(h.failed)} na fila até ela ser corrigida.` };
  }
  if (h.dead > 0) {
    return { tone: "danger", text: `${emails(h.dead)} ${h.dead === 1 ? "não foi enviado" : "não foram enviados"} depois de 5 tentativas.` };
  }
  return null;
}
