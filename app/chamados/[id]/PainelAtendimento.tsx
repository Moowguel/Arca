"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { registrarAndamento, type EstadoAndamento } from "@/app/gestor/actions";

export const PASSOS = [
  { tipo: "a_caminho", rotulo: "Equipe a caminho", icone: "🚚" },
  { tipo: "chegada", rotulo: "Chegamos ao local", icone: "📍" },
  { tipo: "execucao", rotulo: "Serviço em execução", icone: "🔧" },
  { tipo: "concluido", rotulo: "Serviço concluído", icone: "✅" },
  { tipo: "saida", rotulo: "Saímos do local", icone: "🚪" },
  { tipo: "nota", rotulo: "Anotação", icone: "📝" },
] as const;

const DICAS: Record<string, string> = {
  a_caminho: "Ex.: viatura 12 saindo da base, previsão de 20 min.",
  chegada: "Ex.: local confirmado, bueiro com terra e folhas.",
  execucao: "Ex.: retirando resíduos com caminhão sugador.",
  concluido: "O que foi feito? Ex.: bueiro desobstruído, 2 m³ de resíduos retirados.",
  saida: "Ex.: área liberada e sinalização retirada.",
  nota: "Observação livre. Marque como interna se for só para a equipe.",
};

export function PainelAtendimento({ chamadoId, sugestao }: { chamadoId: string; sugestao: string }) {
  const [estado, acao, enviando] = useActionState<EstadoAndamento, FormData>(registrarAndamento, null);
  const [tipo, setTipo] = useState<string>(sugestao);
  const [equipe, setEquipe] = useState("");
  const formulario = useRef<HTMLFormElement>(null);

  // lembra a equipe neste aparelho (o funcionário costuma ser sempre da mesma)
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEquipe(localStorage.getItem("arca:equipe") ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    if (estado?.ok) {
      const texto = formulario.current?.querySelector("textarea");
      if (texto) texto.value = "";
      const interno = formulario.current?.querySelector<HTMLInputElement>('input[name="interno"]');
      if (interno) interno.checked = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTipo(sugestao);
    }
  }, [estado, sugestao]);

  return (
    <section className="rounded-2xl border-2 border-arca-claro bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Registrar andamento</h2>
      <p className="mb-3 text-xs text-slate-500">Cada registro fica na linha do tempo com hora e responsável.</p>

      <form ref={formulario} action={acao} className="space-y-3">
        <input type="hidden" name="chamado_id" value={chamadoId} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PASSOS.map((p) => (
            <label
              key={p.tipo}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-sm font-medium ${
                tipo === p.tipo ? "border-arca-medio bg-arca-nevoa text-arca-marinho ring-2 ring-arca-claro/60" : "border-slate-200"
              }`}
            >
              <input type="radio" name="tipo" value={p.tipo} checked={tipo === p.tipo} onChange={() => setTipo(p.tipo)} className="sr-only" />
              <span aria-hidden="true">{p.icone}</span>
              {p.rotulo}
            </label>
          ))}
        </div>

        <input
          name="equipe"
          value={equipe}
          onChange={(e) => {
            setEquipe(e.target.value);
            try { localStorage.setItem("arca:equipe", e.target.value); } catch {}
          }}
          maxLength={80}
          placeholder="Equipe / viatura (ex.: Equipe Leste 3)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
        />
        <textarea
          name="descricao"
          rows={3}
          maxLength={1000}
          required={tipo === "nota" || tipo === "concluido"}
          placeholder={DICAS[tipo]}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="interno" defaultChecked={false} className="h-4 w-4" />
          Nota interna (não aparece para o morador)
        </label>

        {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
        {estado?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{estado.ok}</p>}

        <button disabled={enviando} className="w-full rounded-xl bg-arca-azul py-3 font-semibold text-white disabled:opacity-60">
          {enviando ? "Registrando..." : `Registrar: ${PASSOS.find((p) => p.tipo === tipo)?.rotulo}`}
        </button>
      </form>
    </section>
  );
}
