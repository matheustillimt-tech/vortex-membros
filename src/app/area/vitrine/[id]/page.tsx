import { redirect } from "next/navigation";
import { DEFAULT_HOME } from "@/lib/auth/redirect";

/**
 * A vitrine não tem página própria: ela é só a fileira horizontal da home. Endereços antigos
 * `/area/vitrine/<id>` caem no início, como qualquer endereço desconhecido.
 */
export default function ShowcasePage() {
  redirect(DEFAULT_HOME);
}
