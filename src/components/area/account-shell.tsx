import type { ReactNode } from "react";
import Link from "next/link";
import { BellIcon, UserCircleIcon } from "./icons";

const LINKS = [
  { href: "/area/aluno/perfil", label: "Perfil", Icon: UserCircleIcon },
  { href: "/area/aluno/notificacao", label: "Notificações", Icon: BellIcon },
] as const;

/**
 * "Minha conta" (perfil e notificações): menu à esquerda (Minha conta / Atendimento, lado a
 * lado no celular) e o conteúdo num cartão com título e ação à direita.
 */
export function AccountShell({ current, title, action, children }: { current: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="vx-conta">
      <div className="vx-list-container">
        <div className="vx-conta-row">
          <nav aria-label="Minha conta" className="vx-conta-menu">
            <ul>
              <li className="vx-conta-menu-title">Minha conta</li>
              {LINKS.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link href={href} aria-current={current === href ? "page" : undefined} className="vx-conta-link">
                    <Icon className="size-[13px]" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul>
              <li className="vx-conta-menu-title">Atendimento</li>
            </ul>
          </nav>
          <div className="vx-conta-content">
            <section className="vx-conta-card" aria-labelledby="vx-conta-title">
              <div className="vx-conta-head">
                <h1 id="vx-conta-title">{title}</h1>
                {action}
              </div>
              <hr className="vx-conta-hr" />
              {children}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
