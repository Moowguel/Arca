import { describe, expect, test } from "bun:test";
import { classificarPorRegras } from "./regras";

describe("classificarPorRegras (modo reserva da IA)", () => {
  test("CT01 — bueiro entupido é classificado como bueiro_obstruido", () => {
    const r = classificarPorRegras("O bueiro da esquina está entupido de folhas", "outro");
    expect(r.categoria).toBe("bueiro_obstruido");
    expect(r.modo).toBe("regras");
  });

  test("CT02 — alagamento com sinais de urgência ganha gravidade acima da base", () => {
    const calmo = classificarPorRegras("A rua ficou alagada ontem à noite", "outro");
    const urgente = classificarPorRegras("Rua alagada, água subindo rápido e entrando na casa, tem idoso aqui", "outro");
    expect(urgente.categoria).toBe("alagamento_ativo");
    expect(urgente.gravidade).toBeGreaterThan(calmo.gravidade);
  });

  test("CT03 — texto sem indício de risco vira sem_risco com confiança baixa", () => {
    const r = classificarPorRegras("Gostaria de elogiar o atendimento do posto", "outro");
    expect(r.categoria).toBe("sem_risco");
    expect(r.confianca).toBeLessThanOrEqual(0.4);
  });

  test("CT04 — o tipo marcado pelo cidadão desempata quando o texto é vago", () => {
    const r = classificarPorRegras("Tem uma situação estranha aqui na rua", "lixo_acumulado");
    expect(r.categoria).toBe("lixo_acumulado");
  });

  test("CT05 — maiúsculas e acentos não atrapalham a classificação", () => {
    const r = classificarPorRegras("CÓRREGO TOTALMENTE ASSOREADO, CHEIO DE TERRA", "outro");
    expect(r.categoria).toBe("corrego_assoreado");
  });

  test("CT15 — palavra-chave dentro de outra palavra não conta (\"rio\" em \"horário\")", () => {
    const r = classificarPorRegras("Gostaria de saber o horário da coleta seletiva", "outro");
    expect(r.categoria).toBe("sem_risco");
  });

  test("CT06 — confiança e gravidade ficam sempre dentro dos limites", () => {
    const r = classificarPorRegras(
      "urgente agora risco alagado alagando inundação enchente submerso transbordou casa carro criança idoso",
      "alagamento_ativo",
    );
    expect(r.confianca).toBeLessThanOrEqual(0.9);
    expect(r.gravidade).toBeLessThanOrEqual(10);
  });
});
