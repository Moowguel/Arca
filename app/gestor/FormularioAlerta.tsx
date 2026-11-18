"use client";

import { useActionState } from "react";
import { publicarAlerta, type EstadoAlerta } from "./actions";

export function FormularioAlerta({ bairros }: { bairros: { id: number; nome: string }[] }) {
  const [estado, acao, enviando] = useActionState<EstadoAlerta, FormData>(publicarAlerta, null);
  const campo = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base";
  return (
    <form action={acao} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select name="bairro_id" required defaultValue="" className={campo} aria-label="Bairro">
          <option value="" disabled>Bairro</option>
          {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select name="nivel" defaultValue="atencao" className={campo} aria-label="Nível">
          <option value="atencao">Atenção</option>
          <option value="critico">Crítico</option>
        </select>
      </div>
      <textarea
        name="motivo"
        required
        minLength={10}
        maxLength={300}
        rows={2}
        placeholder="Motivo. Ex.: previsão de chuva forte à tarde e córrego já acima do normal."
        className={campo}
      />
      {estado?.erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{estado.erro}</p>}
      {estado?.ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{estado.ok}</p>}
      <button disabled={enviando} className="w-full rounded-xl bg-arca-azul py-3 font-semibold text-white disabled:opacity-60">
        {enviando ? "IA escrevendo o alerta..." : "Publicar alerta (texto gerado por IA)"}
      </button>
    </form>
  );
}
