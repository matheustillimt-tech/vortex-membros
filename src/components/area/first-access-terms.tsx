import { acceptFirstAccessTermsAction } from "@/app/area/termo-primeiro-acesso/actions";
import { primaryButtonClass } from "./form-styles";
import { LessonContent } from "./lesson-content";

/** Termo de primeiro acesso (mesmo visual do termo do produto) com "Li e aceito". */
export function FirstAccessTerms({ html, hash, next }: { html: string; hash: string; next: string }) {
  return (
    <>
      <h1 className="mb-5 mt-1 text-lesson font-light text-text-2">Termo de aceite</h1>
      <section aria-label="Termo de aceite" className="rounded-md border border-line p-5 md:p-6">
        <LessonContent html={html} />
      </section>
      <form action={acceptFirstAccessTermsAction} className="mt-6 flex justify-end">
        <input type="hidden" name="hash" value={hash} />
        <input type="hidden" name="next" value={next} />
        <button type="submit" className={primaryButtonClass}>
          Li e aceito
        </button>
      </form>
    </>
  );
}
