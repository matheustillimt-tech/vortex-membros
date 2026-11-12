import type { Address } from "@/db/schema";
import type { ProfileInput } from "@/lib/profile";

const ADDRESS_FIELDS = ["cep", "street", "number", "complement", "reference", "district", "city", "state"] as const;

function text(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : undefined;
}

/** Campo ausente do formulário fica `undefined` (não é alterado); o grupo de endereço só existe se algum `address.*` vier. */
export function parseProfileForm(fd: FormData): ProfileInput {
  const out: ProfileInput = {};
  const name = text(fd, "name");
  const email = text(fd, "email");
  const document = text(fd, "document");
  const phone = text(fd, "phone");
  if (name !== undefined) out.name = name;
  if (email !== undefined) out.email = email;
  if (document !== undefined) out.document = document || null;
  if (phone !== undefined) out.phone = phone || null;

  if (ADDRESS_FIELDS.some((f) => fd.has(`address.${f}`))) {
    const address = {} as Address;
    for (const f of ADDRESS_FIELDS) address[f] = text(fd, `address.${f}`) ?? "";
    out.address = address;
  }
  return out;
}
