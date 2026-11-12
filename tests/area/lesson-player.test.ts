// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test } from "vitest";
import { LessonPlayer } from "@/components/area/lesson-player";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PANDA = "https://player-vz-00000000-000.tv.pandavideo.com.br/embed/?v=00000000-0000-4000-8000-000000000008";

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

const mount = (props: Parameters<typeof LessonPlayer>[0]) => {
  act(() => root.render(createElement(LessonPlayer, props)));
  return host.innerHTML;
};

test("HTML do servidor: capa sim, iframe não (o Next move o conteúdo em streaming e o iframe recarregaria)", () => {
  const html = renderToStaticMarkup(createElement(LessonPlayer, { url: PANDA, title: "Aula" }));
  expect(html).toContain('src="https://cdn.pandavideo.com/vz-00000000-000/00000000-0000-4000-8000-000000000008/thumbnail.jpg"');
  expect(html).not.toContain("<iframe");
});

test("no navegador: um iframe só, com onload inline e cor da Panda", () => {
  const html = mount({ url: PANDA, title: 'Aula "1" <b>', accentColor: "#ff7500" });
  expect(host.querySelectorAll("iframe")).toHaveLength(1);
  expect(html).toContain("onload=\"this.dataset.ready=''\"");
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe(`${PANDA}&color=ff7500`);
  // Título escapado: nada de HTML injetado pelo nome da aula.
  expect(host.querySelector("iframe")!.getAttribute("title")).toBe('Aula "1" <b>');
  expect(host.querySelector("b")).toBeNull();
});

test("YouTube: sem capa, só o iframe", () => {
  mount({ url: "https://youtu.be/abc123", title: "x" });
  expect(host.querySelector(".vx-player-poster")).toBeNull();
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("https://www.youtube.com/embed/abc123");
});

test("URL com aspas não quebra o atributo src", () => {
  mount({ url: 'https://exemplo.com/v?a="><script>x</script>', title: "x" });
  expect(host.querySelector("script")).toBeNull();
  expect(host.querySelectorAll("iframe")).toHaveLength(1);
});

test("sem vídeo: nada", () => {
  expect(renderToStaticMarkup(createElement(LessonPlayer, { url: null, title: "x" }))).toBe("");
});
