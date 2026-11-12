import Link from "next/link";
import { formatReleaseDate } from "@/lib/catalog/release";
import { LockIcon } from "./icons";

/** Aula programada ainda não liberada: só cadeado e a data (nada do vídeo ou do conteúdo). */
export function ScheduledLesson({ releaseAt, productId }: { releaseAt: Date; productId: number }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center md:py-24">
      <span className="grid size-14 place-items-center rounded-full border border-line-2 text-text">
        <LockIcon className="size-5" />
      </span>
      <h1 className="mt-6 text-lesson font-light text-text-2">{`Disponível em ${formatReleaseDate(releaseAt)}`}</h1>
      <p className="mt-2 text-ui text-muted">Esta aula ainda não foi liberada para você.</p>
      <div className="mt-8">
        <Link
          href={`/area/conteudo/listagem/${productId}`}
          className="inline-flex h-10 items-center rounded-full border border-line px-4 text-ui text-text-2 transition-colors hover:border-line-2 hover:text-hover"
        >
          Voltar para o curso
        </Link>
      </div>
    </div>
  );
}
