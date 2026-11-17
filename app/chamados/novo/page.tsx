import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { FormularioChamado } from "./FormularioChamado";

export default function NovoChamado() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-arca-marinho">Reportar risco de alagamento</h1>
      <p className="mt-1 mb-5 text-sm text-slate-600">
        Tire uma foto do problema. A IA identifica o tipo e, junto com os sensores do bairro, define a prioridade.
      </p>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-2xl bg-white" />}>
        <Conteudo />
      </Suspense>
    </div>
  );
}

async function Conteudo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?voltar=/chamados/novo");

  const [{ data: bairros }, { data: perfil }] = await Promise.all([
    supabase.from("bairros").select("id, nome, regiao, lat, lng").order("nome"),
    supabase.from("perfis").select("bairro_id").eq("id", user.id).single(),
  ]);

  return (
    <FormularioChamado
      usuarioId={user.id}
      bairros={(bairros ?? []).map((b) => ({ ...b, lat: Number(b.lat), lng: Number(b.lng) }))}
      bairroPadrao={perfil?.bairro_id ?? null}
    />
  );
}
