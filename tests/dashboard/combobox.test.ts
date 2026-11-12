// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { Combobox, filterOptions, type ComboOption } from "@/components/dashboard/combobox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS: ComboOption[] = [
  { value: "lifetime", label: "Acesso vitalício" },
  { value: "days", label: "Dias" },
  { value: "3", label: "Terceira" },
];

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  act(() => {
    root.render(createElement("form", null, createElement(Combobox, { name: "accessType", options: OPTIONS, ...props })));
  });
  const form = host.querySelector("form")!;
  const button = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  return { form, button, value: () => new FormData(form).get("accessType") };
}

test("envia o valor inicial num input hidden com o mesmo name", () => {
  const { value, button } = render({ defaultValue: "days" });
  expect(value()).toBe("days");
  expect(button.textContent).toContain("Dias");
});

test("clicar numa opção troca o valor enviado e avisa onChange", () => {
  const seen: string[] = [];
  const { button, value } = render({ defaultValue: "lifetime", onChange: (v) => seen.push(v) });
  act(() => button.click());
  const options = host.querySelectorAll<HTMLElement>('[role="option"]');
  expect(options).toHaveLength(3);
  expect(options[0].getAttribute("aria-selected")).toBe("true");
  act(() => options[2].click());
  expect(value()).toBe("3");
  expect(seen).toEqual(["3"]);
  expect(host.querySelector('[role="listbox"]')).toBeNull();
});

test("teclado: seta para baixo abre e move, Enter escolhe, Esc fecha", () => {
  const { button, value } = render({ defaultValue: "lifetime" });
  const key = (k: string) => act(() => void button.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
  key("ArrowDown");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  key("ArrowDown");
  key("Enter");
  expect(value()).toBe("days");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  key("ArrowDown");
  key("Escape");
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(value()).toBe("days");
});

test("clique fora fecha a lista", () => {
  const { button } = render();
  act(() => button.click());
  expect(host.querySelector('[role="listbox"]')).not.toBeNull();
  act(() => void document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  expect(host.querySelector('[role="listbox"]')).toBeNull();
});

test("sem valor mostra o placeholder e envia vazio", () => {
  const { button, value } = render({ placeholder: "Selecione…" });
  expect(button.textContent).toContain("Selecione…");
  expect(value()).toBe("");
});

test("busca ignora acentos e caixa", () => {
  expect(filterOptions(OPTIONS, "VITALICIO").map((o) => o.value)).toEqual(["lifetime"]);
  expect(filterOptions(OPTIONS, "")).toHaveLength(3);
});
