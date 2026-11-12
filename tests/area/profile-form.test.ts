import { expect, test } from "vitest";
import { parseProfileForm } from "@/app/area/aluno/perfil/form";

test("parseProfileForm monta o ProfileInput", () => {
  const fd = new FormData();
  fd.set("phone", "11999999999");
  fd.set("address.city", "Santos");
  const p = parseProfileForm(fd);
  expect(p.phone).toBe("11999999999");
  expect(p.name).toBeUndefined();
  expect(p.address?.city).toBe("Santos");
  expect(p.address?.street).toBe("");
});

test("sem campos de endereço, address fica undefined", () => {
  expect(parseProfileForm(new FormData()).address).toBeUndefined();
});
