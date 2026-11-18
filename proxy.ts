import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";

// Rotas que exigem login (checagem otimista; a regra definitiva é o RLS do banco)
const ROTAS_PROTEGIDAS = ["/chamados", "/gestor"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && ROTAS_PROTEGIDAS.some((rota) => pathname.startsWith(rota))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("voltar", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // tudo, menos arquivos estáticos, imagens e a API dos sensores
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/sensores|api/saude|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
