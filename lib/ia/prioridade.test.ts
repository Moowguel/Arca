import { describe, expect, test } from "bun:test";
import { calcularPrioridade } from "./prioridade";
import type { Classificacao, ContextoBairro } from "./tipos";

const classif = (c: Partial<Classificacao>): Classificacao => ({
  categoria: "bueiro_obstruido",
  confianca: 0.8,
  gravidade: 5,
  justificativa: "",
  modo: "regras",
  modelo: "teste",
  ...c,
});
const bairro = (c: Partial<ContextoBairro>): ContextoBairro => ({
  indice_risco: 20,
  classificacao_risco: "baixo",
  nivel_cm: 60,
  chuva_mm_h: 0,
  chamados_abertos: 0,
  ...c,
});

describe("calcularPrioridade (score explicável 0–100)", () => {
  test("CT07 — alagamento grave em bairro crítico e chovendo é prioridade crítica", () => {
    const r = calcularPrioridade(
      classif({ categoria: "alagamento_ativo", confianca: 1, gravidade: 10 }),
      bairro({ indice_risco: 100, chuva_mm_h: 30, chamados_abertos: 10 }),
    );
    expect(r.score).toBe(100);
    expect(r.prioridade).toBe("critica");
  });

  test("CT08 — foto sem risco em bairro calmo é prioridade baixa", () => {
    const r = calcularPrioridade(classif({ categoria: "sem_risco", gravidade: 1 }), bairro({ indice_risco: 5 }));
    expect(r.prioridade).toBe("baixa");
  });

  test("CT09 — o mesmo bueiro vale mais num bairro com risco alto (sensores)", () => {
    const calmo = calcularPrioridade(classif({}), bairro({ indice_risco: 10 }));
    const emRisco = calcularPrioridade(classif({}), bairro({ indice_risco: 90 }));
    expect(emRisco.score).toBeGreaterThan(calmo.score);
  });

  test("CT10 — bônus de chuva só a partir de 15 mm/h e não vale para córrego", () => {
    const bonus = (c: Classificacao["categoria"], chuva: number) =>
      calcularPrioridade(classif({ categoria: c }), bairro({ chuva_mm_h: chuva })).componentes.find(
        (x) => x.nome === "Chovendo agora",
      )!.pontos;
    expect(bonus("bueiro_obstruido", 14.9)).toBe(0);
    expect(bonus("bueiro_obstruido", 15)).toBe(5);
    expect(bonus("corrego_assoreado", 30)).toBe(0);
  });

  test("CT11 — chamados abertos no bairro somam no máximo 10 pontos", () => {
    const r = calcularPrioridade(classif({}), bairro({ chamados_abertos: 50 }));
    expect(r.componentes.find((x) => x.nome === "Outros chamados abertos no bairro")!.pontos).toBe(10);
  });

  test("CT12 — a soma dos componentes é o score mostrado ao gestor", () => {
    const r = calcularPrioridade(classif({}), bairro({ indice_risco: 40, chamados_abertos: 2 }));
    const soma = r.componentes.reduce((s, x) => s + x.pontos, 0);
    expect(Math.abs(r.score - soma)).toBeLessThanOrEqual(0.5);
  });
});
