# GOAL-000 — apps/api Dockerfile.
# Multi-stage build ile küçük bir runner imajı üretilir.

# ----- builder -----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
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
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist apps/api/dist
# RBAC izin kataloğu ve context-aware yardim/RAG indeksi dokuman
# tabanli runtime girdileridir. Uygulama bunlari proje köküne göre
# okuduğu için docs kökü production imajında da bulunmalıdır.
COPY --from=builder /app/docs ./docs
# pnpm workspace linkleri uygulama dizininde kalir; yalın runtime'a
# sadece root node_modules kopyalandiginda Node bunlari bulamaz. API'nin
# kullandigi ortak sözleşmeyi açık bir runtime linkiyle bağla.
RUN mkdir -p node_modules/@vetniva \
  && ln -sfn ../../packages/contracts node_modules/@vetniva/contracts
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1
# Pilot: veritabanı şeması uygulanmamışsa API ayağa kalkamaz (error_events
# tablosu yok gibi P2021 alır). Container başlarken `migrate deploy` ile
# şemayı uygula, sonra API'yi başlat. Retry'li yapı geçici DB hazır olmama
# durumlarını tolere eder.
CMD ["sh", "-c", "for i in 1 2 3 4 5 6 7 8 9 10; do pnpm --filter @vetniva/api exec prisma migrate deploy && break; echo 'Migration failed, retrying in 5s...'; sleep 5; done; node apps/api/dist/main.js"]
