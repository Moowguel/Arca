export type ComponentePrioridade = { nome: string; pontos: number; explicacao: string };

export type Chamado = {
  id: string;
  protocolo: string;
  bairro_id: number;
  tipo_informado: string;
  descricao: string;
  referencia: string | null;
  foto_path: string | null;
  foto_url: string | null; // foto externa (demonstração, Wikimedia Commons)
  ia_categoria: string | null;
  ia_confianca: number | null;
  ia_justificativa: string | null;
  ia_modo: "gemini" | "regras" | null;
  ia_detalhes: {
    modelo?: string;
    gravidade?: number;
    tempo_triagem_ms?: number;
    componentes?: ComponentePrioridade[];
    falha_gemini?: string | null;
  } | null;
  prioridade_score: number | null;
  prioridade: string | null;
  status: string;
  criado_em: string;
  resolvido_em: string | null;
  bairros: { nome: string } | null;
};
