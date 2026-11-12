import Link from "next/link";
import { ChevronLeft } from "./icons";

/** "‹" da linha de título (margem direita 8px), na cor do título. */
export function BackLink({ href, ariaLabel }: { href: string; ariaLabel: string }) {
  return (
    <Link href={href} aria-label={ariaLabel} className="vx-back">
      <ChevronLeft strokeWidth={3} />
    </Link>
  );
}
