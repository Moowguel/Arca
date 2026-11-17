import type { Classificacao, CategoriaIA, TipoInformado } from "./tipos";

/**
 * Modo reserva: classificação por regras sobre o texto do cidadão.
 * Usado quando não há chave do Gemini ou a API falha — o app nunca para de triar.
 */
const PALAVRAS: Record<Exclude<CategoriaIA, "sem_risco">, string[]> = {
  alagamento_ativo: ["alagad", "alagando", "inunda", "enchente", "água entrando", "agua entrando", "não passa", "nao passa", "submers", "transbord"],
  corrego_assoreado: ["córrego", "corrego", "rio", "assorea", "margem", "canal", "terra no", "mato"],
  bueiro_obstruido: ["bueiro", "boca de lobo", "boca-de-lobo", "grade", "galeria", "entupid", "tampad", "obstru", "drenagem"],
  lixo_acumulado: ["lixo", "entulho", "sacos", "descarte", "sujeira", "garrafa", "resto de obra", "sofá", "sofa"],
};

const URGENCIA = ["urgente", "agora", "subindo", "risco", "criança", "crianca", "idoso", "casa", "carro", "muito", "rápido", "rapido"];

function normalizar(t: string) {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// o termo precisa começar uma palavra: "rio" casa com "rio" e "rios", mas não com "horário"
function contem(texto: string, termo: string) {
  return new RegExp(`\\b${normalizar(termo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(texto);
}

export function classificarPorRegras(descricao: string, tipoInformado: TipoInformado): Classificacao {
  const texto = normalizar(descricao);
  const pontos = Object.fromEntries(
    Object.entries(PALAVRAS).map(([cat, termos]) => [
      cat,
      termos.reduce((n, termo) => n + (contem(texto, termo) ? 1 : 0), 0),
    ]),
  ) as Record<Exclude<CategoriaIA, "sem_risco">, number>;

  // o que o cidadão marcou vale como uma evidência extra
  if (tipoInformado !== "outro") pontos[tipoInformado] += 1.5;

  const [melhor, valor] = Object.entries(pontos).sort((a, b) => b[1] - a[1])[0] as [CategoriaIA, number];
  const total = Object.values(pontos).reduce((a, b) => a + b, 0);
  const urgencia = URGENCIA.filter((p) => contem(texto, p)).length;

  if (valor === 0) {
    return {
      categoria: "sem_risco",
      confianca: 0.4,
      gravidade: 2,
      justificativa: "Nenhum indício de risco de alagamento encontrado na descrição.",
      modo: "regras",
      modelo: "regras-v1",
    };
  }

  const base = melhor === "alagamento_ativo" ? 7 : melhor === "corrego_assoreado" ? 5 : melhor === "bueiro_obstruido" ? 4 : 3;
  return {
    categoria: melhor,
    confianca: Math.min(0.9, 0.45 + (valor / Math.max(total, 1)) * 0.35 + Math.min(valor, 3) * 0.04),
    gravidade: Math.min(10, base + Math.min(urgencia, 3)),
    justificativa: `Classificado pelo texto: ${valor} indício(s) de "${melhor.replaceAll("_", " ")}"${
      urgencia ? ` e ${urgencia} sinal(is) de urgência` : ""
    }.`,
    modo: "regras",
    modelo: "regras-v1",
  };
}
