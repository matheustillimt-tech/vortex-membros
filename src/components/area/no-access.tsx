import Link from "next/link";
import { DEFAULT_HOME } from "@/lib/auth/redirect";
import { safeHttpUrl } from "@/lib/theme";
import { LockIcon } from "./icons";

/** Tela de produto/aula sem acesso: mesma linguagem dos cards bloqueados da home (cadeado + oferta). */
export function NoAccess({ offerUrl, productName }: { offerUrl: string | null; productName?: string }) {
  const offer = safeHttpUrl(offerUrl);
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center md:py-24">
      <span className="grid size-14 place-items-center rounded-full border border-line-2 text-text">
        <LockIcon className="size-5" />
      </span>
      {productName && <p className="mt-6 text-ui text-muted">{productName}</p>}
      <h1 className={`${productName ? "mt-1" : "mt-6"} text-lesson font-light text-text-2`}>
        Você ainda não tem acesso a este conteúdo.
      </h1>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        {offer && (
          <a
            href={offer}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center rounded-md bg-accent px-6 text-body text-accent-ink transition-opacity hover:opacity-90"
          >
            Quero ter acesso
          </a>
        )}
        <Link
          href={DEFAULT_HOME}
          className="inline-flex h-10 items-center rounded-full border border-line px-4 text-ui text-text-2 transition-colors hover:border-line-2 hover:text-hover"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
