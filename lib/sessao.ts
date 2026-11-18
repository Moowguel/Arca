import "server-only";
import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

export type Sessao = {
  logado: boolean;
  id: string | null;
  nome: string | null;
  papel: "cidadao" | "gestor" | null;
};

/** Usuário logado + perfil. `cache` evita repetir a consulta na mesma requisição. */
export const obterSessao = cache(async (): Promise<Sessao> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { logado: false, id: null, nome: null, papel: null };

  const { data } = await supabase.from("perfis").select("nome, papel").eq("id", user.id).single();
  return {
    logado: true,
    id: user.id,
    nome: data?.nome ?? user.email ?? null,
    papel: (data?.papel as Sessao["papel"]) ?? "cidadao",
  };
});
