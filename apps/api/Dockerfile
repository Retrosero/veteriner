# GOAL-000 — apps/api Dockerfile.
# Multi-stage build ile küçük bir runner imajı üretilir.

# ----- builder -----
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/i18n/package.json packages/i18n/
COPY tools/docs-check/package.json tools/docs-check/ 2>/dev/null || true
COPY tools/i18n-check/package.json tools/i18n-check/ 2>/dev/null || true
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @vetniva/api build

# ----- runner -----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/i18n/package.json packages/i18n/
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/apps/api/dist apps/api/dist
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1
CMD ["node", "apps/api/dist/main.js"]
