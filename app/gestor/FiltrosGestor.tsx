"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export type FiltrosAtuais = {
  ver: string;
  q: string;
  bairro: string;
  prioridade: string;
  categoria: string;
  status: string;
  ordem: string;
};

type Opcao = { valor: string; rotulo: string };

/** Barra de filtros do gestor: busca + selects; tudo vai para a URL */
export function FiltrosGestor({
  atuais,
  bairros,
  categorias,
  statusOpcoes,
}: {
  atuais: FiltrosAtuais;
  bairros: Opcao[];
  categorias: Opcao[];
  statusOpcoes: Opcao[];
}) {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  const [busca, setBusca] = useState(atuais.q);
  const [aberto, setAberto] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  function aplicar(mudancas: Partial<FiltrosAtuais>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...atuais, ...mudancas })) {
      if (v && !(k === "ver" && v === "fila")) p.set(k, v);
    }
    iniciar(() => router.push(`/gestor${p.size ? `?${p}` : ""}`, { scroll: false }));
  }

  // busca enquanto digita, com pequena espera para não consultar a cada tecla
  useEffect(() => {
    if (busca === atuais.q) return;
    clearTimeout(espera.current);
    espera.current = setTimeout(() => aplicar({ q: busca.trim() }), 400);
    return () => clearTimeout(espera.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const ativos = (["bairro", "prioridade", "categoria", "status"] as const).filter((k) => atuais[k]).length;
  const select = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";

  return (
    <div className={`space-y-2 ${carregando ? "opacity-60" : ""}`} aria-busy={carregando}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" aria-hidden="true">🔍</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Protocolo, descrição ou referência"
            aria-label="Buscar chamados"
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-3 pl-9 text-base"
          />
        </div>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`relative rounded-xl border px-3 text-sm font-semibold lg:hidden ${ativos ? "border-arca-azul text-arca-azul" : "border-slate-300 text-slate-700"}`}
        >
          Filtros{ativos > 0 && <span className="ml-1 rounded-full bg-arca-azul px-1.5 text-xs text-white">{ativos}</span>}
        </button>
      </div>

      {/* no celular os filtros abrem sob demanda; no computador ficam sempre visíveis */}
      <div className={`${aberto ? "grid" : "hidden"} grid-cols-2 gap-2 lg:grid lg:grid-cols-5`}>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Bairro</span>
          <select className={select} value={atuais.bairro} onChange={(e) => aplicar({ bairro: e.target.value })}>
            <option value="">Todos</option>
            {bairros.map((b) => <option key={b.valor} value={b.valor}>{b.rotulo}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Prioridade</span>
          <select className={select} value={atuais.prioridade} onChange={(e) => aplicar({ prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Tipo (IA)</span>
          <select className={select} value={atuais.categoria} onChange={(e) => aplicar({ categoria: e.target.value })}>
            <option value="">Todos</option>
            {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
          <select className={select} value={atuais.status} onChange={(e) => aplicar({ status: e.target.value })}>
            <option value="">Todos</option>
            {statusOpcoes.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
        </label>
        <label className="col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Ordenar por</span>
          <select className={select} value={atuais.ordem} onChange={(e) => aplicar({ ordem: e.target.value })}>
            <option value="">Maior prioridade</option>
            <option value="antigos">Esperando há mais tempo</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </label>
      </div>

      {(ativos > 0 || atuais.q || atuais.ordem) && (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            aplicar({ q: "", bairro: "", prioridade: "", categoria: "", status: "", ordem: "" });
          }}
          className="text-sm font-medium text-arca-azul"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
