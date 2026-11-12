// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const createTag = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, id: 7 })));
vi.mock("@/app/dashboard/sales/deliveries/actions", () => ({ createTagAction: createTag }));

import { TagPicker } from "@/components/dashboard/tag-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  createTag.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const byText = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

test("criar uma tag no modal não envia o formulário da entrega em volta", async () => {
  const outerSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
  const onChange = vi.fn();
  const onTagCreated = vi.fn();
  act(() => {
    root.render(
      createElement(
        "form",
        { onSubmit: outerSubmit },
        createElement(TagPicker, { tags: [], selected: [], onChange, onTagCreated }),
      ),
    );
  });
  act(() => byText("Adicionar tag").click());
  act(() => byText("Criar tag").click());
  const input = document.getElementById("novaTagNome") as HTMLInputElement;
  expect(input).toBeTruthy();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, "Turma A");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.form!.requestSubmit();
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(input.form).not.toBe(host.querySelector("form")); // modal em portal, fora do form da entrega
  expect(outerSubmit).not.toHaveBeenCalled();
  expect(createTag).toHaveBeenCalledTimes(1);
  expect(onTagCreated).toHaveBeenCalledWith({ id: 7, name: "Turma A" });
  expect(onChange).toHaveBeenCalledWith([7]);
});
