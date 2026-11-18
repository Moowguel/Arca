export const CATEGORIAS_IA = [
  "bueiro_obstruido",
  "lixo_acumulado",
  "corrego_assoreado",
  "alagamento_ativo",
  "sem_risco",
] as const;
export type CategoriaIA = (typeof CATEGORIAS_IA)[number];

export const TIPOS_INFORMADOS = [
  "bueiro_obstruido",
  "lixo_acumulado",
  "corrego_assoreado",
  "alagamento_ativo",
  "outro",
] as const;
export type TipoInformado = (typeof TIPOS_INFORMADOS)[number];

/** Resultado da classificação (Gemini ou regras) */
export type Classificacao = {
  categoria: CategoriaIA;
  confianca: number; // 0 a 1
  gravidade: number; // 0 a 10: quão grave o problema parece
  justificativa: string;
  modo: "gemini" | "regras";
  modelo: string;
};

/** Contexto do bairro vindo dos sensores (camada gold) */
export type ContextoBairro = {
  indice_risco: number; // 0 a 100
  classificacao_risco: string;
  nivel_cm: number | null;
  chuva_mm_h: number | null;
  chamados_abertos: number;
};
