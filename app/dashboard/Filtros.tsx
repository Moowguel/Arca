"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Opcao = { valor: string; rotulo: string };

/** Filtros numa linha acima dos gráficos; mudam a URL (dá para compartilhar o recorte) */
export function Filtros({
  atuais,
  bairros,
  categorias,
}: {
  atuais: { periodo: string; bairro: string; categoria: string };
  bairros: Opcao[];
  categorias: Opcao[];
}) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();

  function mudar(campo: string, valor: string) {
    const p = new URLSearchParams({ ...atuais, [campo]: valor });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    iniciar(() => router.push(`/dashboard?${p.toString()}`, { scroll: false }));
  }

  const select = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";
  return (
    <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${carregando ? "opacity-60" : ""}`} aria-busy={carregando}>
      <label className="col-span-2 sm:col-span-1">
        <span className="mb-1 block text-xs font-medium text-slate-500">Período</span>
        <select className={select} value={atuais.periodo} onChange={(e) => mudar("periodo", e.target.value)}>
          <option value="24h">Últimas 24 horas</option>
          <option value="3d">Últimos 3 dias</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">Bairro</span>
        <select className={select} value={atuais.bairro} onChange={(e) => mudar("bairro", e.target.value)}>
          <option value="">Todos</option>
          {bairros.map((b) => <option key={b.valor} value={b.valor}>{b.rotulo}</option>)}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-slate-500">Tipo de problema</span>
        <select className={select} value={atuais.categoria} onChange={(e) => mudar("categoria", e.target.value)}>
          <option value="">Todos</option>
          {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
      </label>
    </div>
  );
}
