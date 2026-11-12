/** Texto de um bloco de código para copiar, sem o botão "Copiar" que fica dentro dele. Não altera o DOM. */
export function codeBlockText(pre: Element): string {
  const clone = pre.cloneNode(true) as Element;
  clone.querySelectorAll(".copy-button").forEach((b) => b.remove());
  return clone.textContent ?? "";
}
