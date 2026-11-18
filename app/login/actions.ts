"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export type EstadoLogin = { erro?: string; aviso?: string } | null;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** só aceita caminhos internos, para evitar redirecionamento para sites externos */
function destinoSeguro(voltar: FormDataEntryValue | null) {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");

  if (!EMAIL_VALIDO.test(email)) return { erro: "Informe um e-mail válido." };
  if (senha.length < 6) return { erro: "A senha precisa ter pelo menos 6 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: "E-mail ou senha incorretos." };

  revalidatePath("/", "layout");
  redirect(destinoSeguro(form.get("voltar")));
}

export async function cadastrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");

  if (nome.length < 2 || nome.length > 80) return { erro: "Informe seu nome." };
  if (!EMAIL_VALIDO.test(email)) return { erro: "Informe um e-mail válido." };
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } },
  });
  if (error) return { erro: "Não foi possível criar a conta: " + error.message };

  // projeto com confirmação de e-mail ligada: ainda não há sessão
  if (!data.session) {
    return { aviso: "Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre." };
  }

  revalidatePath("/", "layout");
  redirect(destinoSeguro(form.get("voltar")));
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Ação única do formulário: o campo oculto "modo" decide entre entrar e cadastrar */
export async function autenticar(estado: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  return form.get("modo") === "cadastrar" ? cadastrar(estado, form) : entrar(estado, form);
}
