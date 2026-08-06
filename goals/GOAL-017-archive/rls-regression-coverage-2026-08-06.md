# RLS Regression Test Coverage Raporu (GOAL-017 devamı)

**Tarih:** 2026-08-06
**Durum:** 64 RLS E2E testi yazıldı, 8 dosyada dağıtıldı, canlı DB
ile çalıştırılmak üzere hazır.

## Genel Bakış

PostgreSQL Row Level Security (RLS) regression testleri, kısıtlı
runtime rolü (`vetniva_e2e_app`) ile gerçek veritabanı katmanında
tenant izolasyonunu doğrular. Append-only trigger'lar + app role
yetkileri + cross-tenant senaryolar dahil.

## Test Dosyaları (8)

| Dosya | Test Sayısı | Kapsam |
| --- | --- | --- |
| `app.e2e-spec.ts` | 7 | Genel app başlatma + auth akışı |
| `controlled-drugs.rls.e2e-spec.ts` | 10 | Kontrollü ilaç + append-only correction |
| `error-events.rls.e2e-spec.ts` | 1 | SUPERADMIN error event izolasyonu |
| `imaging-orders.rls.e2e-spec.ts` | 11 | Görüntüleme + report JSONB + app role |
| `lab-orders.rls.e2e-spec.ts` | 10 | Laboratuvar sipariş + patient filtresi |
| `lab-results.rls.e2e-spec.ts` | 11 | Lab sonuç + revision |
| `lab-tests.rls.e2e-spec.ts` | 12 | Lab test kataloğu + tenant scope |
| `runtime-role.http.e2e-spec.ts` | 2 | HTTP üzerinden runtime role davranışı |
| **Toplam** | **64** | |

## Kapsanan Senaryolar

### 1. Tenant İzolasyonu (zorunlu)

- `tenant bağlamı yokken X satırı göstermez veya yazdırmaz`
  (her entity için)
- `doğru tenant bağlamı yalnızca kendi kaydını açar`
  (her entity için)
- `Repository findById tenant-scoped: cross-tenant null döner`
- `Repository search X filtresi tenant-scoped`
- `Repository update cross-tenant: P2025/null ile sonuçlanır`

### 2. Repository Transaction Propagation

- `Branch repository RLS bağlamını aynı transaction içinde taşır`
- `RBAC repository RLS bağlamını aynı transaction içinde taşır`
- `File repository RLS bağlamını aynı transaction içinde taşır`
- `Auth repository token lookup ve session mutation bağlamını taşır`
- `Auth login üyelik ve varsayılan şube bağlamını aynı transaction'da çözer`
- `Auth invitation ve reset tokenları yalnız hash bağlamıyla açar`

### 3. Append-Only Trigger

- `append-only correction kaydı runtime RLS yolunda stok bakiyesini tersine çevirir`
- `tenant bağlamı doğru olsa dahi append-only trigger UPDATE'i reddeder`
- `Append-only trigger tenant bağlamı doğru olsa dahi DELETE'i reddeder`

### 4. App Role Privileges

- `App role yalnızca X SELECT/INSERT/UPDATE yetkisine sahiptir`
  (her entity için — DELETE append-only trigger ile reddedilir)

### 5. JSONB Alanlar

- `Repository update reportRevisions JSONB kendi tenant'ında günceller`

## Çalıştırma Koşulları

RLS E2E testleri gerçek PostgreSQL + bootstrap gerektirir:

```bash
# Coolify terminal'de (api container)
export DATABASE_MIGRATOR_URL=postgresql://vetniva:$DB_PASSWORD@postgres:5432/vetniva
export DATABASE_URL=postgresql://vetniva_e2e_app:$APP_PASSWORD@postgres:5432/vetniva

# pnpm docker:up ile izole PG (port 55432)
pnpm docker:up

# Test çalıştır
pnpm --filter @vetniva/api test -- test/*.rls.e2e-spec.ts
```

**Veya** `apps/api/test/setup-rls.ts` setup script'i ile:

```bash
cd apps/api
node --import tsx test/setup-rls.ts
pnpm test -- test/*.rls.e2e-spec.ts
```

## Bilinçli Atlamalar (Pilot Kapsamı Dışı)

- **Tüm modüllerin RLS coverage'ı** — şu an controlled-drugs,
  error-events, imaging-orders, lab-orders/results/tests var.
  Patient, owner, examination, prescription, vaccination için
  ek RLS testleri FAZ-12+ devamı.
- **Performance RLS** — RLS overhead ölçümü (k6 + RLS).
- **WAL-based RLS regression** — streaming replication'da
  RLS davranışı.
- **SUPERADMIN bypass coverage** — `app.is_superadmin=true`
  ile cross-tenant erişim testleri (kısmen `app.e2e-spec.ts`).

## Pilot Veri ile Eklenecek Coverage

Aşağıdaki senaryolar pilot veri ile eklenecek (FAZ-12 devamı):

1. **Patient cross-tenant IDOR** — A tenant'ın B tenant'ı
   patient'ına `/api/v1/clinic/patients/<id>` ile erişim → 404.
2. **Owner cross-tenant IDOR** — Aynısı owner için.
3. **Examination cross-tenant** — A tenant'ın muayenesine
   cross-tenant read → 404.
4. **Prescription cross-tenant** — Reçete cross-tenant
   read → 404 + audit event.
5. **Vaccination cross-tenant** — Aşı kartı cross-tenant
   read → 404.
6. **Portal cross-tenant** — PET_OWNER_PORTAL farklı
   tenant'ın owner'ı ile login → 401.
7. **Branches arası transfer** — Aynı tenant farklı branch
   cross-branch → 403 (VET-AUTHZ-0004).
8. **Session token rotate** — Refresh token rotation
   cross-session → 401.
9. **Invitation token reuse** — Tek kullanımlık token
   ikinci kez kullanımda 410.
10. **Audit log cross-tenant** — Audit event'lerinin
    tenant filtresi.

## Takip Öğeleri (production-ready öncesi)

1. **Tüm 10 modül için RLS E2E testi** — patient, owner,
   examination, prescription, vaccination, vb.
2. **Pilot veri ile cross-tenant IDOR senaryoları** —
   yukarıdaki 10 senaryo.
3. **`pnpm docker:up` izole PG** — port 55432 fixture
   (pre-existing setup).
4. **CI gate entegrasyonu** — RLS E2E testlerinin main'de
   otomatik çalışması (Postgres service container).
5. **Performance RLS benchmark** — k6 + RLS overhead ölçümü
   (production tier için).
