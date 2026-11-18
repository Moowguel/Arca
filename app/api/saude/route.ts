import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verificação de saúde (healthcheck do Docker e monitoramento).
 * Responde 200 se o app está no ar e o banco responde; 503 caso contrário.
 */
export async function GET() {
  await connection(); // sempre em tempo real, nunca pré-renderizado
  const inicio = performance.now();

  let banco: "ok" | "erro" = "erro";
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await supabase.from("bairros").select("id", { head: true, count: "exact" });
    banco = error ? "erro" : "ok";
  } catch {
    banco = "erro";
  }

  const corpo = {
    status: banco === "ok" ? "ok" : "degradado",
    servico: "arca-web",
    banco,
    ia: process.env.GEMINI_API_KEY ? "gemini" : "modo-reserva",
    latencia_banco_ms: Math.round(performance.now() - inicio),
    uptime_s: Math.round(process.uptime()),
    horario: new Date().toISOString(),
  };
  return Response.json(corpo, { status: banco === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
