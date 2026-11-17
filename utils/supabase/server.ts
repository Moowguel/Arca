import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Usa a sessão do usuário (cookies), então as regras de RLS do banco valem.
 */
export async function createClient() {
  // Dado por requisição: diz ao Next para não pré-renderizar quem usa o banco
  // (o Supabase lê o relógio para validar a sessão, o que quebraria o prerender).
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component: pode ignorar,
            // o proxy.ts já renova a sessão a cada requisição.
          }
        },
      },
    },
  );
}
