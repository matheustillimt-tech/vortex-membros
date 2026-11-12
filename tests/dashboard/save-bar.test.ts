import { expect, test } from "vitest";
import { isSaveBarOpen, saveBarView } from "@/components/dashboard/save-bar";

const base = { dirty: false, saved: false, pending: false, error: null as string | null };

test("sem alteração a barra fica fechada", () => {
  expect(isSaveBarOpen(base)).toBe(false);
  expect(saveBarView(base)).toMatchObject({ open: false, status: null, tone: null });
});

test("suja → 'Alterações não salvas', botão ativo", () => {
  expect(saveBarView({ ...base, dirty: true })).toMatchObject({ open: true, status: "sujo", tone: null, collapsed: false, disabled: false });
});

test("salvando → rótulo recolhido e botão desativado", () => {
  expect(saveBarView({ ...base, dirty: true, pending: true })).toMatchObject({ open: true, status: "sujo", collapsed: true, disabled: true });
});

test("salvo agora → verde, recolhido", () => {
  expect(saveBarView({ ...base, saved: true })).toMatchObject({ open: true, status: "salvo", tone: "ok", collapsed: true, disabled: true });
});

test("erro mantém a barra aberta, vermelha, com o botão para tentar de novo", () => {
  expect(saveBarView({ ...base, dirty: true, error: "x" })).toMatchObject({ open: true, status: "erro", tone: "erro", disabled: false });
  expect(isSaveBarOpen({ ...base, error: "x" })).toBe(true);
});
