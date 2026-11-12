// @vitest-environment happy-dom
import { Activity, act, createElement, type ActivityProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PlayerFrame } from "@/components/area/player-frame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HTML = '<iframe src="about:blank#aula-1" title="Aula 1"></iframe>';

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

const render = (mode: "visible" | "hidden") =>
  act(() => root.render(createElement(Activity, { mode } as ActivityProps, createElement(PlayerFrame, { html: HTML }))));

test("página da aula escondida (navegou para outra aula): o player sai, o vídeo para", () => {
  render("visible");
  expect(host.querySelectorAll("iframe")).toHaveLength(1);
  render("hidden");
  expect(host.querySelectorAll("iframe")).toHaveLength(0);
});

test("voltou para a aula: o player volta, um só", () => {
  render("visible");
  render("hidden");
  render("visible");
  const frames = host.querySelectorAll("iframe");
  expect(frames).toHaveLength(1);
  expect(frames[0].getAttribute("src")).toBe("about:blank#aula-1");
});

test("vídeo embutido no texto da aula também para quando a aula fica escondida", async () => {
  const { LessonContent } = await import("@/components/area/lesson-content");
  const html = '<p>Veja:</p><iframe src="https://player.vimeo.com/video/1"></iframe>';
  const show = (mode: "visible" | "hidden") => act(() => root.render(createElement(Activity, { mode } as ActivityProps, createElement(LessonContent, { html }))));
  show("visible");
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("https://player.vimeo.com/video/1");
  show("hidden");
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("about:blank");
  show("visible");
  expect(host.querySelector("iframe")!.getAttribute("src")).toBe("https://player.vimeo.com/video/1");
});
