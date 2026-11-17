import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { obterSessao } from "@/lib/sessao";
import { sair } from "@/app/login/actions";
import { IconeUsuario } from "@/app/components/Icones";

export default function PaginaPerfil() {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const s = await obterSessao();
  if (!s.logado) redirect("/login?voltar=/perfil");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-sm">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-arca-nevoa text-arca-azul">
          <IconeUsuario />
        </span>
        <div>
          <p className="font-semibold">{s.nome}</p>
          <p className="text-sm text-slate-500">{s.papel === "gestor" ? "Gestor(a) — Defesa Civil" : "Cidadão(ã)"}</p>
        </div>
      </div>
      <Link href="/chamados" className="block rounded-2xl bg-white p-4 font-medium shadow-sm">Meus chamados</Link>
      <form action={sair}>
        <button className="w-full rounded-2xl bg-white p-4 text-left font-medium text-red-700 shadow-sm">Sair da conta</button>
      </form>
    </div>
  );
}
