import type { Classificacao, ContextoBairro } from "./tipos";

export type Prioridade = "baixa" | "media" | "alta" | "critica";

export type ResultadoPrioridade = {
  score: number; // 0 a 100
  prioridade: Prioridade;
  componentes: { nome: string; pontos: number; explicacao: string }[];
};

const PESO_CATEGORIA: Record<Classificacao["categoria"], number> = {
  alagamento_ativo: 40,
  corrego_assoreado: 28,
  bueiro_obstruido: 24,
  lixo_acumulado: 18,
  sem_risco: 3,
};

/**
 * Score de prioridade explicável (0–100).
 * Junta o que a IA viu na foto com o que os SENSORES dizem sobre o bairro agora:
 * o mesmo bueiro entupido vale mais num bairro com o córrego subindo e chovendo.
 */
export function calcularPrioridade(c: Classificacao, ctx: ContextoBairro): ResultadoPrioridade {
  const ajusteConfianca = 0.6 + 0.4 * c.confianca;
  const componentes = [
    {
      nome: "Tipo do problema",
      pontos: PESO_CATEGORIA[c.categoria] * ajusteConfianca,
      explicacao: `Peso da categoria × confiança da IA (${Math.round(c.confianca * 100)}%)`,
    },
    {
      nome: "Gravidade vista na foto",
      pontos: c.gravidade * 2,
      explicacao: `Gravidade ${c.gravidade}/10 avaliada pela IA`,
    },
    {
      nome: "Risco atual do bairro",
      pontos: ctx.indice_risco * 0.25,
      explicacao: `Índice ${ctx.indice_risco}/100 calculado com sensores de nível e chuva`,
    },
    {
      nome: "Outros chamados abertos no bairro",
      pontos: Math.min(ctx.chamados_abertos * 2, 10),
      explicacao: `${ctx.chamados_abertos} chamado(s) ainda sem solução na região`,
    },
    {
      nome: "Chovendo agora",
      pontos:
        (ctx.chuva_mm_h ?? 0) >= 15 && c.categoria !== "sem_risco" && c.categoria !== "corrego_assoreado" ? 5 : 0,
      explicacao: `Pluviômetro marcando ${ctx.chuva_mm_h ?? 0} mm/h (bônus a partir de 15 mm/h)`,
    },
  ].map((x) => ({ ...x, pontos: Math.round(x.pontos * 10) / 10 }));

  const score = Math.max(0, Math.min(100, Math.round(componentes.reduce((s, x) => s + x.pontos, 0))));
  const prioridade: Prioridade = score >= 75 ? "critica" : score >= 55 ? "alta" : score >= 30 ? "media" : "baixa";
  return { score, prioridade, componentes };
}
