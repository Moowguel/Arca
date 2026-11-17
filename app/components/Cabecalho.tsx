import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { obterSessao } from "@/lib/sessao";
import { sair } from "@/app/login/actions";
import { BarraInferior } from "./BarraInferior";

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2" aria-label="ARCA, página inicial">
          <Image src="/arca-logo.webp" alt="" width={44} height={25} priority className="h-auto w-11" />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-tight text-arca-marinho">ARCA</span>
            <span className="hidden text-[11px] text-slate-500 sm:block">Alerta de Risco Climático e Apoio</span>
          </span>
        </Link>
        <Suspense fallback={<div className="h-9 w-24 animate-pulse rounded bg-slate-100" />}>
          <NavegacaoSuperior />
        </Suspense>
      </div>
    </header>
  );
}

async function NavegacaoSuperior() {
  const s = await obterSessao();
  const link = "rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-arca-nevoa hover:text-arca-marinho";

  return (
    <nav className="flex items-center gap-1">
      {/* links completos só no computador; no celular quem navega é a barra inferior */}
      <div className="hidden items-center gap-1 md:flex">
        <Link href="/alertas" className={link}>Alertas</Link>
        <Link href="/dashboard" className={link}>Painel de dados</Link>
        {s.logado && <Link href="/chamados" className={link}>Meus chamados</Link>}
        {s.papel === "gestor" && <Link href="/gestor" className={link}>Gestor</Link>}
        {s.logado && (
          <Link href="/chamados/novo" className="ml-1 rounded-md bg-arca-azul px-3 py-2 text-sm font-semibold text-white hover:bg-arca-marinho">
            Reportar risco
          </Link>
        )}
      </div>
      {s.logado ? (
        <form action={sair} className="ml-2 flex items-center gap-2">
          <span className="hidden max-w-32 truncate text-xs text-slate-500 lg:inline">{s.nome}</span>
          <button className="rounded-md px-2 py-2 text-sm font-medium text-slate-500 hover:text-arca-marinho">Sair</button>
        </form>
      ) : (
        <Link href="/login" className="ml-1 rounded-md bg-arca-azul px-3 py-2 text-sm font-semibold text-white hover:bg-arca-marinho">
          Entrar
        </Link>
      )}
    </nav>
  );
}

/** Fica fora do <header> porque o blur do cabeçalho prenderia o position: fixed */
export function NavegacaoCelular() {
  return (
    <Suspense fallback={null}>
      <BarraInferiorComSessao />
    </Suspense>
  );
}

async function BarraInferiorComSessao() {
  const s = await obterSessao();
  return <BarraInferior logado={s.logado} gestor={s.papel === "gestor"} />;
}
