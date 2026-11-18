# =====================================================================
# ARCA — imagem de produção do app Next.js
#   1) deps    → instala dependências com bun (lockfile congelado)
#   2) build   → gera o build "standalone" do Next
#   3) runner  → imagem final enxuta, usuário sem privilégios
# Uso:  docker compose --env-file .env.local up --build
# =====================================================================

# ---------- 1) dependências ----------
FROM node:24-slim AS deps
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------- 2) build ----------
FROM node:24-slim AS build
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# variáveis NEXT_PUBLIC_* entram no JavaScript do navegador no momento do build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---------- 3) execução ----------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# usuário sem privilégios (boa prática de segurança)
RUN groupadd --system --gid 1001 arca && useradd --system --uid 1001 --gid arca arca

COPY --from=build --chown=arca:arca /app/public ./public
COPY --from=build --chown=arca:arca /app/.next/standalone ./
COPY --from=build --chown=arca:arca /app/.next/static ./.next/static

USER arca
EXPOSE 3000

# o Docker marca o container como "unhealthy" se a rota de saúde parar de responder
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# segredos (SUPABASE_SECRET_KEY, GEMINI_API_KEY) chegam só em tempo de execução, nunca na imagem
CMD ["node", "server.js"]
