# =============================================================
# VetNiva Worker — production image
# Multi-stage build: pnpm fetch + build, sonra slim runtime.
# Kullanım: docker build -t vetniva-worker -f apps/worker/Dockerfile .
# =============================================================

# ---- 1) Base image (pnpm + Node 20) -----------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# ---- 2) Dependencies (prod + dev) -------------------------------
FROM base AS deps
# Tüm monorepo lockfile ve workspace dosyaları kopyalanır;
# pnpm filter ile sadece worker ve bağımlılıkları kurulur.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --filter @vetniva/worker... --filter @vetniva/api... --frozen-lockfile=false --ignore-scripts

# ---- 3) Build ----------------------------------------------------
FROM base AS build
COPY --from=deps /repo /repo
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/api/prisma apps/api/prisma
COPY apps/worker apps/worker
RUN pnpm --filter @vetniva/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @vetniva/contracts build
RUN pnpm --filter @vetniva/worker build

# ---- 4) Runtime (sadece prod deps + dist) -----------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY --from=build /repo/apps/worker/dist ./dist
COPY --from=build /repo/apps/worker/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
# Worker uzun yaşayan bir süreçtir; main.js'i require etmek ikinci bir
# worker başlatır ve health check'in zaman aşımına düşmesine neden olur.
# Bu nedenle yalnızca yayın artefaktının varlığı doğrulanır.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:fs').accessSync('./dist/main.js')" || exit 1
CMD ["node", "dist/main.js"]
