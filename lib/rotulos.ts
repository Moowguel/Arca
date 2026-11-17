// Textos e cores usados em todo o site

export const CATEGORIAS: Record<string, string> = {
  bueiro_obstruido: "Bueiro obstruído",
  lixo_acumulado: "Lixo acumulado",
  corrego_assoreado: "Córrego assoreado",
  alagamento_ativo: "Alagamento agora",
  outro: "Outro",
  sem_risco: "Sem risco aparente",
};

export const STATUS: Record<string, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  em_atendimento: "Em atendimento",
  resolvido: "Resolvido",
  descartado: "Descartado",
};

export const PRIORIDADES: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const RISCOS: Record<string, string> = {
  baixo: "Baixo",
  moderado: "Moderado",
  alto: "Alto",
  critico: "Crítico",
  normal: "Normal",
  atencao: "Atenção",
};

/** Classes do Tailwind para cada nível (risco, prioridade, alerta) */
export const COR_NIVEL: Record<string, string> = {
  baixo: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  normal: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  baixa: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  moderado: "bg-amber-100 text-amber-800 ring-amber-200",
  media: "bg-amber-100 text-amber-800 ring-amber-200",
  atencao: "bg-amber-100 text-amber-900 ring-amber-300",
  alto: "bg-orange-100 text-orange-800 ring-orange-200",
  alta: "bg-orange-100 text-orange-800 ring-orange-200",
  critico: "bg-red-100 text-red-800 ring-red-200",
  critica: "bg-red-100 text-red-800 ring-red-200",
};

export const COR_STATUS: Record<string, string> = {
  aberto: "bg-sky-100 text-sky-800 ring-sky-200",
  em_analise: "bg-violet-100 text-violet-800 ring-violet-200",
  em_atendimento: "bg-amber-100 text-amber-800 ring-amber-200",
  resolvido: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  descartado: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/** Instante de N horas atrás (usado só depois de dados da requisição, nunca no prerender) */
export function horasAtras(horas: number) {
  return new Date(Date.now() - horas * 36e5);
}
