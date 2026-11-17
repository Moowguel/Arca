"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconeEscudo, IconeGrafico, IconeInicio, IconeLista, IconeMais, IconeUsuario } from "./Icones";

/** Navegação estilo app, fixa no rodapé — só aparece no celular */
export function BarraInferior({ logado, gestor }: { logado: boolean; gestor: boolean }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(href + "/"));

  const itens = [
    { href: "/", rotulo: "Início", Icone: IconeInicio },
    { href: "/dashboard", rotulo: "Painel", Icone: IconeGrafico },
    null, // espaço do botão central
    logado
      ? { href: "/chamados", rotulo: "Chamados", Icone: IconeLista }
      : { href: "/login", rotulo: "Chamados", Icone: IconeLista },
    gestor
      ? { href: "/gestor", rotulo: "Gestor", Icone: IconeEscudo }
      : { href: logado ? "/perfil" : "/login", rotulo: logado ? "Conta" : "Entrar", Icone: IconeUsuario },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="pb-seguro fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
    >
      <ul className="relative mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
        {itens.map((item, i) =>
          item === null ? (
            <li key="reportar" className="flex justify-center">
              <Link
                href={logado ? "/chamados/novo" : "/login?voltar=/chamados/novo"}
                aria-label="Reportar risco"
                className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-arca-ciano to-arca-azul text-white shadow-lg shadow-arca-azul/30 ring-4 ring-white active:scale-95"
              >
                <IconeMais className="h-7 w-7" />
              </Link>
            </li>
          ) : (
            <li key={i}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-medium ${
                  ativo(item.href) ? "text-arca-azul" : "text-slate-500"
                }`}
              >
                <item.Icone className="h-6 w-6" />
                {item.rotulo}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
