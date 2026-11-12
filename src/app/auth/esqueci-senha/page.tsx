import { permanentRedirect } from "next/navigation";

// Endereço antigo: a tela agora fica em /auth/esqueci_minha_senha.
export default function OldForgotPasswordPage(): never {
  permanentRedirect("/auth/esqueci_minha_senha");
}
