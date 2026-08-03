# GOAL-000 — apps/api Dockerfile.
# Multi-stage build ile küçük bir runner imajı üretilir.

# ----- builder -----
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/i18n/package.json packages/i18n/
# Builder katmanında TypeScript ve Prisma gibi development bağımlılıkları
# zorunludur; dışarıdan NODE_ENV=production gelse bile bunlar atlanmamalıdır.
RUN pnpm install --frozen-lockfile --ignore-scripts --prod=false
COPY . .
RUN pnpm --filter @vetniva/contracts build
RUN pnpm --filter @vetniva/api exec prisma generate
RUN pnpm --filter @vetniva/api build

# ----- runner -----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist apps/api/dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1
CMD ["node", "apps/api/dist/main.js"]
