// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { codeBlockText } from "@/lib/content/copy-text";

test("copia só o texto do bloco, sem o botão Copiar", () => {
  const pre = document.createElement("pre");
  pre.innerHTML = `<code>Aja como especialista.\nCrie 5 ideias.</code>`;
  const button = document.createElement("button");
  button.className = "copy-button";
  button.textContent = "Copiar";
  pre.appendChild(button);
  expect(codeBlockText(pre)).toBe("Aja como especialista.\nCrie 5 ideias.");
  expect(pre.querySelector(".copy-button")).not.toBeNull(); // não mexe no DOM real
});

test("bloco sem botão devolve o texto inteiro", () => {
  const pre = document.createElement("pre");
  pre.textContent = "prompt simples";
  expect(codeBlockText(pre)).toBe("prompt simples");
});
