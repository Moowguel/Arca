import { describe, expect, test } from "bun:test";
import { chuvaNoPasso, FATOR, NIVEL_BASE, proximoNivel } from "./simulador";

describe("simulador de sensores", () => {
  test("CT13 — a tempestade padrão leva o córrego do Jardim Pantanal acima do limite crítico (220 cm) e ele volta a baixar", () => {
    const passos = 30;
    let nivel = NIVEL_BASE;
    const historico: number[] = [];
    for (let p = 0; p < passos; p++) {
      nivel = proximoNivel(nivel, chuvaNoPasso(p, passos, 40) * FATOR[0]);
      historico.push(nivel);
    }
    const maximo = Math.max(...historico);
    expect(maximo).toBeGreaterThan(220);
    expect(historico.at(-1)!).toBeLessThan(maximo);
  });

  test("CT14 — o nível do córrego nunca sai da faixa aceita pelo banco", () => {
    expect(proximoNivel(470, 200)).toBe(480);
    expect(proximoNivel(20, 0)).toBeGreaterThanOrEqual(20);
  });
});
