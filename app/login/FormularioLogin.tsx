"use client";

import { useActionState, useState } from "react";
import { autenticar, type EstadoLogin } from "./actions";

export function FormularioLogin({ voltar }: { voltar: string }) {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(autenticar, null);

  const campo =
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-arca-medio focus:ring-2 focus:ring-arca-claro/50";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["entrar", "cadastrar"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`rounded-md py-2 ${modo === m ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {m === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <form action={acao} className="space-y-4">
        <input type="hidden" name="voltar" value={voltar} />
        <input type="hidden" name="modo" value={modo} />
        {modo === "cadastrar" && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Nome</span>
            <input name="nome" required minLength={2} maxLength={80} autoComplete="name" className={campo} />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className={campo} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Senha</span>
          <input
            name="senha"
            type="password"
            required
            minLength={modo === "entrar" ? 6 : 8}
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            className={campo}
          />
        </label>

        {estado?.erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>
        )}
        {estado?.aviso && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{estado.aviso}</p>
        )}

        <button
          disabled={enviando}
          className="w-full rounded-lg bg-arca-azul py-3 font-semibold text-white hover:bg-arca-marinho disabled:opacity-60"
        >
          {enviando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold">Contas de demonstração (senha arca1234)</p>
        <p>cidadao@arca.dev · gestor@arca.dev</p>
      </div>
    </div>
  );
}
