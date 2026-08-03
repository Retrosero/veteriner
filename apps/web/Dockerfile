# syntax=docker/dockerfile:1.7
# =============================================================
# VetNiva web (apps/web) — Next.js 14 standalone build
# Multi-stage: deps -> builder -> runner
# =============================================================

# ---- 1. Bağımlılık katmanı (pnpm workspace) ----
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# pnpm workspace + paket manifest'leri
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

# Yalnızca web paketi + bağımlılıkları (dev dahil) kurulur.
RUN pnpm install --filter @vetniva/web... --frozen-lockfile=false --ignore-scripts

# ---- 2. Build katmanı ----
FROM deps AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Kaynak kodu kopyala
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/i18n packages/i18n
COPY packages/ui packages/ui
COPY apps/web apps/web
# Önce workspace paketlerini derle (turbo yerine sıralı)
RUN pnpm --filter @vetniva/config build || true
RUN pnpm --filter @vetniva/contracts build
RUN pnpm --filter @vetniva/i18n build
RUN pnpm --filter @vetniva/ui build
# Hoisted pnpm yapılandırmasında Next kök node_modules üzerinden çözer.
# Builder Linux bağlarını açıkça kurar; Windows host node_modules imaja alınmaz.
RUN rm -rf node_modules/@vetniva/ui node_modules/@vetniva/contracts node_modules/@vetniva/i18n \
  && mkdir -p node_modules/@vetniva \
  && ln -sfn ../../packages/ui node_modules/@vetniva/ui \
  && ln -sfn ../../packages/contracts node_modules/@vetniva/contracts \
  && ln -sfn ../../packages/i18n node_modules/@vetniva/i18n
RUN test -f node_modules/@vetniva/ui/package.json \
  && test -f node_modules/@vetniva/ui/dist/index.js \
  && node -e "console.log(require.resolve('@vetniva/ui/package.json'))"
# Next.js standalone build
RUN pnpm --filter @vetniva/web build

# ---- 3. Runner katmanı (yalnızca standalone çıktısı) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone çıktıdan runtime bağımlılıkları + server.js
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

# Non-root kullanıcı ile çalıştır
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs
USER nextjs

CMD ["node", "apps/web/server.js"]
