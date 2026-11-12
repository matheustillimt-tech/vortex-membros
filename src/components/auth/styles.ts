/** Links brancos sob o formulário das telas de acesso ("Esqueceu sua senha?", "Voltar para o login"). */
export const authLinkClass = "text-[14.4px] leading-[20.8px] text-white no-underline hover:text-white";

// Valores medidos no login. O contorno global de :focus-visible fica de fora
// dos campos (outline-none!): no foco, só a borda muda para a cor de destaque, sem brilho.
export const authLabelClass = "m-0 mb-2 block text-left text-[12px] leading-[18px] text-[#c1c1c1]";
export const authInputClass =
  "block h-[45px] w-full rounded-[7px] border border-solid border-[#1f2223] bg-[#111213] p-3 text-[12.8px] leading-[19.2px] text-[#c1c1c1] shadow-none outline-none! focus:border-accent";
/** Botão principal (.auth-btn): 120px no login; textos maiores crescem com o mesmo padding. */
export const authButtonClass =
  "h-[45px] min-w-[120px] cursor-pointer rounded-[30px] border-0 bg-accent px-6 py-0 text-[12.8px] font-normal text-white shadow-none transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_88%,#000)] disabled:cursor-wait disabled:opacity-70";
/** Aviso acima do formulário: erro (borda avermelhada) ou informação (borda neutra). */
export const authAlertClass =
  "m-0 mb-6 rounded-[7px] border border-solid border-[#5a2a2a] bg-[#111213] p-3 text-[12px] leading-[18px] text-[#c1c1c1]";
export const authNoticeClass =
  "m-0 mb-6 rounded-[7px] border border-solid border-[#1f2223] bg-[#111213] p-3 text-[12px] leading-[18px] text-[#c1c1c1]";
/** h4 + p.tip das telas "Esqueceu sua senha?" e "Falta pouco" (h4.pt-5 e p.tip, centralizados). */
export const authTitleClass = "m-0 mb-2 pt-12 text-left text-[24px] font-medium leading-[28.8px] text-[#e2e2e2]";
export const authTipClass = "m-0 py-4 text-left text-[12px] leading-[20.8px] text-[#868686]";
/** Parágrafo do link de rodapé do formulário ("Esqueceu sua senha?", "Voltar ao login"). */
export const authFooterLinkWrapClass = "m-0 mt-2 py-4 text-center text-[12px]";
